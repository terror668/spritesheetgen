// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { unzipSync } from "fflate";
import { solid, rect } from "./sprite/test-helpers";
import { encodeGif } from "./sprite/gif";
import { decodeGif } from "./sprite/gif-decode";
import { processFrames, DEFAULT_SETTINGS } from "./sprite/process";
import { renameFrames, toGodotSpriteFrames, toTexturePackerJSON } from "./sprite/pack";
import { exportGif, writeExport, downloadGif, exportGeneration } from "./export";
import type { SpriteClient } from "./api";
afterEach(() => vi.unstubAllGlobals());

// The same solid/rectangle fixtures used by the site's pipeline tests.
const fixture = () => encodeGif([
  rect(solid(20, 20, [255, 0, 255]), 5, 5, 6, 8, [200, 30, 30]),
  rect(solid(20, 20, [255, 0, 255]), 7, 5, 6, 8, [200, 30, 30]),
], { fps: 10 });

describe("Node / shared site pipeline parity", () => {
  it.each([false, true])("same pixels, atlas and Godot metadata (pixelate=%s)", (pixelate) => {
    const gif = fixture();
    const settings = { ...DEFAULT_SETTINGS, count: 2, end: 2, pixelate, targetHeight: 8, palette: "pico8" };
    const expected = processFrames(decodeGif(gif).frames, settings);
    const sheet = renameFrames(expected.sheet, "walk");
    const meta = { imageName: "sheet.png", animationName: "walk", fps: 10, loop: true, pivot: expected.pivot };
    const out = exportGif(gif, { name: "walk", fps: 10, settings, frames: true, preview: true });
    expect(out.result.frames).toEqual(expected.frames);
    expect(out.result.sheet.image).toEqual(sheet.image);
    const png = PNG.sync.read(Buffer.from(out.files["sheet.png"]));
    expect(new Uint8ClampedArray(png.data)).toEqual(sheet.image.data);
    expect(new TextDecoder().decode(out.files["sheet.json"])).toBe(toTexturePackerJSON(sheet, meta));
    expect(new TextDecoder().decode(out.files["animation.tres"])).toBe(toGodotSpriteFrames(sheet, meta));
    const zip = unzipSync(out.files["frames.zip"]);
    expect(Object.keys(zip)).toHaveLength(expected.frames.length);
    for (let i = 0; i < expected.frames.length; i++) expect(new Uint8ClampedArray(PNG.sync.read(Buffer.from(zip[`frames/${sheet.frames[i].name}.png`])).data)).toEqual(expected.frames[i].data);
    expect(decodeGif(out.files["preview.gif"]).frames).toHaveLength(expected.frames.length);
  });
  it("packs a one-off move with its last frame and marks it as not looping", () => {
    const gif = encodeGif([0, 2, 4, 6, 8].map((x) => rect(solid(20, 20, [255, 0, 255]), x, 5, 6, 8, [200, 30, 30])), { fps: 10 });
    const settings = { count: 3, dedupe: false, align: false };
    const loop = exportGif(gif, { settings, preview: true });
    const once = exportGif(gif, { settings, once: true, preview: true });
    // a GIF loops only with the NETSCAPE2.0 extension: the one-off preview plays once
    const netscape = (b: Uint8Array) => Buffer.from(b).includes("NETSCAPE2.0");
    expect(netscape(loop.files["preview.gif"])).toBe(true);
    expect(netscape(once.files["preview.gif"])).toBe(false);
    // explicit settings win over `once`, and the metadata follows what was packed
    const packedAsLoop = exportGif(gif, { settings: { ...settings, ends: false }, once: true });
    expect(JSON.parse(new TextDecoder().decode(packedAsLoop.files["sheet.json"])).meta.loop).toBe(true);
    expect(once.result.frames[2]).toEqual(processFrames(decodeGif(gif).frames.slice(4), { ...DEFAULT_SETTINGS, ...settings, count: 1 }).frames[0]);
    expect(loop.result.frames[2]).not.toEqual(once.result.frames[2]);
    expect(JSON.parse(new TextDecoder().decode(once.files["sheet.json"])).meta.loop).toBe(false);
    expect(new TextDecoder().decode(once.files["animation.tres"])).toContain('"loop": false');
    expect(JSON.parse(new TextDecoder().decode(loop.files["sheet.json"])).meta.loop).toBe(true);
  });
  it("preserves already-transparent inputs and reports truncation explicitly", () => {
    const frame = solid(20, 20, [255, 0, 255]); frame.data.fill(0); rect(frame, 5, 5, 8, 8, [200, 30, 30]);
    const out = exportGif(encodeGif([frame], { fps: 10 }));
    expect(out.manifest.settings.removeBackground).toBe(false);
    expect(out.manifest.sourceFrames).toBe(1);
    expect(out.manifest.decodedFrames).toBe(1);
  });
  it("rejects path/resource injection, corrupt GIF and unsafe processing settings", () => {
    expect(() => exportGif(fixture(), { name: '../other' })).toThrow();
    expect(() => exportGif(fixture(), { name: 'bad"name' })).toThrow();
    expect(() => exportGif(fixture(), { settings: { count: Infinity } })).toThrow();
    expect(() => exportGif(fixture(), { settings: { palette: "unknown" } })).toThrow();
    expect(() => exportGif(new Uint8Array([1, 2]))).toThrow();
  });
});

it("writes all files, preserves existing directories and leaves no partial directory on error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sprite-export-"));
  try {
    const artifact = exportGif(fixture(), { frames: true });
    await writeExport(artifact, join(dir, "output"));
    const before = await readFile(join(dir, "output/sheet.png"));
    await expect(writeExport(artifact, join(dir, "output"))).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(join(dir, "output/sheet.png"))).toEqual(before);
    await expect(writeExport({ ...artifact, files: { ...artifact.files, "../escape": new Uint8Array() } }, join(dir, "partial"))).rejects.toThrow();
    await expect(readFile(join(dir, "partial/sheet.png"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("downloads without a credential, refuses HTTP redirects and bounds oversized media", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://cdn.example/sprite.gif" } })).mockResolvedValueOnce(new Response(new Uint8Array(fixture())));
  await downloadGif("https://media.example/sprite.gif", fetcher);
  for (const [, init] of fetcher.mock.calls) expect(new Headers(init?.headers).has("authorization")).toBe(false);
  await expect(downloadGif("https://media.example/a", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://evil.example/a" } })))).rejects.toThrow("HTTPS");
  await expect(downloadGif("https://media.example/a", vi.fn<typeof fetch>().mockResolvedValue(new Response("x", { headers: { "content-length": "25000001" } })))).rejects.toThrow("25 MB");
});

it("failed export only reads the existing generation; never re-generates", async () => {
  const get = vi.fn().mockResolvedValue({ id: "existing", status: "SUCCEEDED", images: ["https://media.example/result.gif"], videos: [] });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-a-gif"));
  vi.stubGlobal("fetch", fetcher);
  await expect(exportGeneration({ get } as unknown as SpriteClient, "existing", { outputDir: "unused" })).rejects.toThrow();
  expect(get).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("refuses character/video generations before downloading and gives explicit format guidance", async () => {
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
  for (const generation of [
    { kind: "image", tool: "sprite_anchor" },
    { kind: "video", tool: "sprite_video" },
  ]) {
    const get = vi.fn().mockResolvedValue({ ...generation, id: "existing", status: "SUCCEEDED", images: ["https://media.example/character.png"], videos: [] });
    await expect(exportGeneration({ get } as unknown as SpriteClient, "existing", { outputDir: "unused" })).rejects.toThrow("Choose an action generation");
  }
  expect(fetcher).not.toHaveBeenCalled();
  expect(() => exportGif(new Uint8Array([137, 80, 78, 71]))).toThrow("Export requires a GIF animation");
});

describe("playsOnce", () => {
  it("follows the stored cut, then the action for older rows", async () => {
    const { playsOnce } = await import("./export");
    expect(playsOnce({ action: "custom", motion: "casts a fireball", cut: "once" })).toBe(true);
    expect(playsOnce({ action: "custom", motion: "spins", cut: "loop" })).toBe(false);
    expect(playsOnce({ action: "attack", cut: "loop" })).toBe(false);
    expect(playsOnce({ action: "jump" })).toBe(true);
    expect(playsOnce({ action: "walk" })).toBe(false);
    expect(playsOnce(undefined)).toBe(false);
  });
});
