import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PNG } from "pngjs";
import { zipSync } from "fflate";
import { decodeGif } from "./sprite/gif-decode";
import { encodeGif } from "./sprite/gif";
import { PALETTES } from "./sprite/pixelate";
import { resizeNearest } from "./sprite/image";
import { fitSize, frameBudget, MAX_DECODED_PIXELS } from "./sprite/limits";
import { DEFAULT_SETTINGS, hasTransparentBorder, processFrames, type ProcessSettings, type ProcessResult } from "./sprite/process";
import { renameFrames, toGodotSpriteFrames, toTexturePackerJSON } from "./sprite/pack";
import type { RGBAImage } from "./sprite/types";
import type { SpriteClient } from "./api";

export type { ProcessSettings, ProcessResult, RGBAImage };
export const PROCESSOR_VERSION = "0.1.0";
export const MAX_SOURCE_BYTES = 25_000_000;
export interface ExportOptions {
  name?: string;
  fps?: number;
  settings?: Partial<ProcessSettings>;
  /** Also write individual transparent PNG frames and frames.zip. */
  frames?: boolean;
  preview?: boolean;
  /** A one-off move (attack, jump): keep its first and last frame and mark the animation as not looping (`settings.ends` overrides it). */
  once?: boolean;
}
export interface ExportManifest {
  processor: string;
  sourceFrames: number;
  decodedFrames: number;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  animationName: string;
  settings: ProcessSettings;
  files: string[];
}
export interface ExportArtifact {
  result: ProcessResult;
  manifest: ExportManifest;
  files: Record<string, Uint8Array>;
}
const bytes = (s: string) => new TextEncoder().encode(s);

/** PNG pixels are exactly the shared pipeline's RGBA values; encoding is Node-specific. */
export function encodePng(image: RGBAImage): Uint8Array {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

/** GIF -> the site's pure processing pipeline -> local file bytes. No API calls or writes. */
export function exportGif(source: Uint8Array, options: ExportOptions = {}): ExportArtifact {
  if (source.length > MAX_SOURCE_BYTES) throw new Error("GIF exceeds the 25 MB source limit.");
  const signature = new TextDecoder().decode(source.subarray(0, 6));
  if (source.length < 13 || (signature !== "GIF87a" && signature !== "GIF89a")) throw new Error("Export requires a GIF animation. Character PNG/JPEG/WebP images and MP4 videos cannot be packed by this exporter; choose an animation GIF.");
  const name = options.name ?? "animation";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error("Animation name must be 1..64 letters, digits, - or _.");
  const width = source[6] | source[7] << 8, height = source[8] | source[9] << 8;
  const decoded = decodeGif(source, { maxFrames: frameBudget(width, height, 240, MAX_DECODED_PIXELS) });
  const [w, h] = fitSize(decoded.width, decoded.height, 512);
  const frames = decoded.frames.map((f) => f.width === w && f.height === h ? f : resizeNearest(f, w, h));
  const fps = options.fps ?? Math.min(60, Math.max(1, Math.round(1000 * frames.length / decoded.delaysMs.reduce((a, b) => a + b, 0))));
  if (!Number.isFinite(fps) || fps < 1 || fps > 60) throw new Error("fps must be between 1 and 60.");
  // Mirrors SpriteStudio's GIF-load defaults, including already-transparent inputs.
  const settings: ProcessSettings = { ...DEFAULT_SETTINGS, end: frames.length, count: Math.min(frames.length, 64), removeBackground: !hasTransparentBorder(frames[0]), ends: options.once === true, ...options.settings };
  validateSettings(settings);
  const processed = processFrames(frames, settings);
  const result = { ...processed, sheet: renameFrames(processed.sheet, name) };
  const meta = { imageName: "sheet.png", animationName: name, fps, loop: !settings.ends, pivot: result.pivot };
  const files: Record<string, Uint8Array> = {
    "sheet.png": encodePng(result.sheet.image),
    "sheet.json": bytes(toTexturePackerJSON(result.sheet, meta)),
    "animation.tres": bytes(toGodotSpriteFrames(result.sheet, meta)),
  };
  if (options.frames) {
    const individual: Record<string, Uint8Array> = {};
    result.frames.forEach((f, i) => { individual[`frames/${result.sheet.frames[i].name}.png`] = encodePng(f); });
    Object.assign(files, individual);
    files["frames.zip"] = zipSync(individual);
  }
  if (options.preview) files["preview.gif"] = encodeGif(result.frames, { fps, repeat: settings.ends ? -1 : 0 });
  const manifest: ExportManifest = {
    processor: PROCESSOR_VERSION, sourceFrames: decoded.totalFrames, decodedFrames: frames.length,
    frameCount: result.frames.length, fps, width: result.sheet.image.width, height: result.sheet.image.height,
    frameWidth: result.sheet.cellWidth, frameHeight: result.sheet.cellHeight, columns: result.sheet.columns, rows: result.sheet.rows, animationName: name,
    settings, files: [...Object.keys(files), "export.json"],
  };
  files["export.json"] = bytes(JSON.stringify(manifest, null, 2) + "\n");
  return { result, manifest, files };
}

function validateSettings(s: ProcessSettings) {
  for (const [name, value, min, max] of [
    ["start", s.start, 0, 239], ["end", s.end, 1, 240], ["count", s.count, 1, 64],
    ["padding", s.padding, 0, 64], ["targetHeight", s.targetHeight, 1, 512], ["columns", s.columns, 0, 64],
    ["autoColors", s.autoColors, 2, 256], ["tolerance", s.tolerance, 0, 442], ["softness", s.softness, 0, 442],
  ] as const) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in ${min}..${max}.`);
  }
  if (s.end <= s.start) throw new Error("end must follow start.");
  if (!["off", "gentle", "strong"].includes(s.edgeCleanup)) throw new Error("Invalid edgeCleanup.");
  if (s.anchor !== undefined && s.anchor !== "body" && s.anchor !== "box") throw new Error("anchor must be body or box.");
  if (!["auto", "none", ...Object.keys(PALETTES)].includes(s.palette)) throw new Error("Invalid palette.");
  if (s.keyColor && (s.keyColor.length !== 3 || s.keyColor.some((v) => !Number.isInteger(v) || v < 0 || v > 255))) throw new Error("keyColor must be three RGB bytes.");
}

/** Write into a NEW directory only. Failed writes remove this newly created directory for local retry. */
export async function writeExport(artifact: ExportArtifact, outputDir: string): Promise<ExportManifest & { outputDir: string }> {
  const directory = resolve(outputDir);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // EEXIST preserves every pre-existing user asset
  try {
    for (const [name, content] of Object.entries(artifact.files)) {
      if (!/^(sheet\.(png|json)|animation\.tres|preview\.gif|export\.json|frames\.zip|frames\/[A-Za-z0-9_-]+\.png)$/.test(name)) throw new Error("Invalid export filename.");
      const file = join(directory, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content, { flag: "wx" });
    }
  } catch (e) {
    await rm(directory, { recursive: true, force: true });
    throw e;
  }
  return { ...artifact.manifest, outputDir: directory };
}

/** Bounded download with NO Authorization/cookies. Media URLs are separate from the API origin. */
export async function downloadGif(url: string, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<Uint8Array> {
  let target = new URL(url);
  const signal = AbortSignal.timeout(60_000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (target.protocol !== "https:" || target.username || target.password) throw new Error("Media downloads require an HTTPS URL without credentials.");
    let response: Response;
    try { response = await fetcher(target, { redirect: "manual", signal }); }
    catch { throw new Error("Media download failed. Retry export; do not regenerate."); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Media redirect has no destination.");
      target = new URL(location, target); continue;
    }
    if (!response.ok || !response.body) throw new Error(`Media download failed (HTTP ${response.status}).`);
    if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) { await response.body.cancel(); throw new Error("GIF exceeds the 25 MB source limit."); }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > MAX_SOURCE_BYTES) throw new Error("GIF exceeds the 25 MB source limit.");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const output = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }
  throw new Error("Too many media redirects.");
}

/** Actions made as one move between rests rather than a cycle (the site's ACTIONS with cut "once"). */
const ONE_OFF_ACTIONS = new Set(["attack", "jump"]);

/** Plays once? The stored `cut` first (custom motions, newer rows), else the action (older rows have no cut). */
export function playsOnce(inputs: Record<string, string> | undefined): boolean {
  const cut = inputs?.cut;
  if (cut === "once" || cut === "loop") return cut === "once";
  return ONE_OFF_ACTIONS.has(inputs?.action ?? "");
}

/** One free lookup + download + local export. Never generates or debits credits. GIF sources only. */
export async function exportGeneration(client: SpriteClient, id: string, options: ExportOptions & { outputDir: string }) {
  const generation = await client.get(id);
  if (generation.status !== "SUCCEEDED") throw new Error(`Generation is ${generation.status}; export needs a successful generation.`);
  if (generation.kind === "text" || generation.kind === "video" || generation.tool === "sprite_anchor") {
    throw new Error("Export requires an animation GIF. Choose an action generation, not a character image, text or MP4 video.");
  }
  const url = generation.images[0] ?? generation.videos[0];
  if (!url) throw new Error("The generation has no media URL yet. Retry status/export later.");
  const artifact = exportGif(await downloadGif(url), { once: playsOnce(generation.inputs), ...options });
  return { ...await writeExport(artifact, options.outputDir), generationId: generation.id, creditsCharged: generation.credits_charged, refunded: generation.refunded };
}

/** Local retries can also start directly from a previously downloaded GIF; no key required. */
export async function exportFile(file: string, options: ExportOptions & { outputDir: string }) {
  const { stat } = await import("node:fs/promises");
  if ((await stat(file)).size > MAX_SOURCE_BYTES) throw new Error("GIF exceeds the 25 MB source limit.");
  return writeExport(exportGif(await readFile(file), options), options.outputDir);
}
