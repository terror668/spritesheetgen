import { parseArgs } from "node:util";
import { cp, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkKeyShape, forgetKey, saveKey } from "./credentials";
import { ApiError, createClient, type AgentEstimateRequest } from "./api";
import { exportFile, exportGeneration, type ExportOptions, type ProcessSettings } from "./export";

export const HELP = `SpriteSheetGen — generate remotely, pack locally (Node 20+)

  login                      paste your API key (hidden); stored for this user only
  login --stdin              read the key from stdin instead
  logout                     forget the stored key
  skill install --dir DIR    copy the agent skill into DIR/spritesheetgen
  estimate --description TEXT
  estimate --reference REF --action walk [--notes TEXT]
  character --description TEXT --client-key KEY --max-credits N
  animate --reference REF --action walk --client-key KEY --max-credits N [--notes TEXT]
  upload --file character.png
  status --id ID [--timeout 900] [--poll 2] [--once]
  list --source generated|uploaded [--limit 20] [--cursor CURSOR]
  list --reference REF [--limit 20] [--cursor CURSOR]
  prompt --text TEXT [--lang en|zh|ja|ko]
  export --id ID --out DIRECTORY [options]
  export --file source.gif --out DIRECTORY [options]  (offline, no key needed)

Export options:
  --name animation --frames N --fps N --pixel-height N --columns N
  --background auto|remove|keep --tolerance N --softness N
  --palette auto|none|PRESET --no-align --no-dedupe --padding N
  --individual-frames (also frames.zip) --preview

Every command accepts --json. Errors exit 1. --help prints this text.
The key comes from SPRITESHEETGEN_API_KEY or from \`login\`; never pass it as an argument.
Estimate before authorizing paid calls. Keep client-key for retries; never replace it after a timeout.
Export writes a new directory and never regenerates. PNG/MP4 inputs are not supported in this GIF exporter.
`;

const options = {
  json: { type: "boolean" }, help: { type: "boolean", short: "h" },
  description: { type: "string" }, reference: { type: "string" }, action: { type: "string" }, notes: { type: "string" },
  "client-key": { type: "string" }, "max-credits": { type: "string" }, file: { type: "string" }, id: { type: "string" },
  timeout: { type: "string" }, poll: { type: "string" }, once: { type: "boolean" }, source: { type: "string" }, limit: { type: "string" }, cursor: { type: "string" },
  text: { type: "string" }, lang: { type: "string" }, out: { type: "string" }, name: { type: "string" },
  frames: { type: "string" }, fps: { type: "string" }, "pixel-height": { type: "string" }, columns: { type: "string" },
  background: { type: "string" }, tolerance: { type: "string" }, softness: { type: "string" }, palette: { type: "string" },
  "no-align": { type: "boolean" }, "no-dedupe": { type: "boolean" }, padding: { type: "string" },
  "individual-frames": { type: "boolean" }, preview: { type: "boolean" },
  stdin: { type: "boolean" }, dir: { type: "string" },
} as const;

/** CLI dispatcher. MCP integration injects its stdio entry point; it owns stdout in that branch. */
export async function runCli(argv = process.argv.slice(2), hooks: { mcp?: () => Promise<void> } = {}): Promise<void> {
  const json = argv.includes("--json");
  try {
    const { values: v, positionals } = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
    const command = positionals[0];
    if (v.help || !command) { process.stdout.write(json ? JSON.stringify({ ok: true, data: { help: HELP } }) + "\n" : HELP); return; }
    if (command === "skill") {
      if (positionals[1] !== "install" || positionals.length !== 2) throw new Error("Use: skill install --dir DIR");
      if (!v.dir?.trim()) throw new Error("--dir is required (e.g. ~/.claude/skills or ~/.codex/skills).");
      const installed = await installSkill(v.dir);
      process.stdout.write(json ? JSON.stringify({ ok: true, data: { installed } }) + "\n" : `Skill installed in ${installed}\n`);
      return;
    }
    if (positionals.length !== 1) throw new Error("Unexpected positional arguments; use --help.");
    if (command === "login") {
      const key = checkKeyShape(v.stdin ? await readStdin() : await askHidden("Paste your SpriteSheetGen API key (input hidden): "));
      // Check it before saving: an unknown key is refused here, not on the first paid call.
      let note = "";
      try {
        await createClient({ key, retries: 0 }).estimate({ operation: "character", description: "a small knight" });
      } catch (e) {
        if (!(e instanceof ApiError) || e.kind === "auth") throw e;
        if (e.kind === "network" || e.kind === "timeout" || e.kind === "invalid_response") throw new Error("Could not reach spritesheetgen.com to check the key; nothing was saved. Try again.");
        if (e.kind !== "scope") throw e;
        note = " This key may not read or generate yet: tick its permissions on the account page.";
      }
      const file = await saveKey(key);
      process.stdout.write(json ? JSON.stringify({ ok: true, data: { saved: file } }) + "\n" : `Key saved to ${file} (readable only by you).${note}\n`);
      return;
    }
    if (command === "logout") {
      const file = await forgetKey();
      process.stdout.write(json ? JSON.stringify({ ok: true, data: { removed: file } }) + "\n" : `Removed ${file}\n`);
      return;
    }
    if (command === "mcp") {
      if (!hooks.mcp) throw new Error("MCP support is not included in this build yet.");
      await hooks.mcp(); return;
    }
    const required = (name: keyof typeof v): string => {
      const value = v[name];
      if (typeof value !== "string" || !value.trim()) throw new Error(`--${name} is required.`);
      return value;
    };
    const number = (name: keyof typeof v, fallback?: number): number => {
      if (v[name] === undefined && fallback !== undefined) return fallback;
      const raw = required(name);
      const value = Number(raw);
      if (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(value)) throw new Error(`--${name} must be a nonnegative number.`);
      return value;
    };
    const estimate = (): AgentEstimateRequest => v.reference
      ? { operation: "action", reference: v.reference, action: required("action"), notes: v.notes }
      : { operation: "character", description: required("description") };
    let data: unknown;
    switch (command) {
      case "estimate": data = await createClient().estimate(estimate()); break;
      case "character": data = await createClient().character({ description: required("description"), client_key: required("client-key"), max_credits: number("max-credits") }); break;
      case "animate": data = await createClient().animate({ reference: required("reference"), action: required("action"), notes: v.notes, client_key: required("client-key"), max_credits: number("max-credits") }); break;
      case "upload": data = await createClient().uploadFile(required("file")); break;
      case "status": {
        const client = createClient(), id = required("id");
        data = v.once ? await client.get(id) : await client.wait(id, { timeoutMs: number("timeout", 900) * 1000, pollMs: number("poll", 2) * 1000 });
        break;
      }
      case "list": {
        const client = createClient();
        const limit = number("limit", 20);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be 1..100.");
        if (v.reference) data = await client.listActions({ reference: v.reference, limit, cursor: v.cursor });
        else {
          const source = required("source");
          if (source !== "generated" && source !== "uploaded") throw new Error("--source must be generated or uploaded.");
          data = await client.listCharacters({ source, limit, cursor: v.cursor });
        }
        break;
      }
      case "prompt": {
        const lang = v.lang ?? "en";
        if (lang !== "en" && lang !== "zh" && lang !== "ja" && lang !== "ko") throw new Error("Unsupported --lang.");
        data = await createClient().prompt({ messages: [{ role: "user", content: required("text") }], lang });
        break;
      }
      case "export": {
        if (!!v.id === !!v.file) throw new Error("Choose exactly one of --id or --file.");
        const settings: Partial<ProcessSettings> = {};
        for (const [flag, name] of [["frames", "count"], ["pixel-height", "targetHeight"], ["columns", "columns"], ["padding", "padding"], ["tolerance", "tolerance"], ["softness", "softness"]] as const) {
          if (v[flag] !== undefined) settings[name] = number(flag);
        }
        if (v["pixel-height"] !== undefined) settings.pixelate = true;
        if (v["no-align"]) settings.align = false;
        if (v["no-dedupe"]) settings.dedupe = false;
        if (v.palette) settings.palette = v.palette;
        if (v.background && v.background !== "auto") {
          if (!["remove", "keep"].includes(v.background)) throw new Error("--background must be auto, remove or keep.");
          settings.removeBackground = v.background === "remove";
        }
        const exportOptions: ExportOptions & { outputDir: string } = { outputDir: required("out"), name: v.name, fps: v.fps === undefined ? undefined : number("fps"), settings, frames: v["individual-frames"], preview: v.preview };
        data = v.file ? await exportFile(v.file, exportOptions) : await exportGeneration(createClient(), required("id"), exportOptions);
        break;
      }
      default: throw new Error("Unknown command; use --help.");
    }
    process.stdout.write(json ? JSON.stringify({ ok: true, data }) + "\n" : human(data) + "\n");
  } catch (e) {
    const message = safeMessage(e);
    const error = e instanceof ApiError ? { kind: e.kind, code: e.code, message, request_id: e.requestId } : { code: "CLIENT_ERROR", message };
    if (json) process.stdout.write(JSON.stringify({ ok: false, error }) + "\n");
    else process.stderr.write(message + "\n");
    process.exitCode = 1;
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Operation failed.";
  const key = process.env.SPRITESHEETGEN_API_KEY;
  return key ? message.split(key).join("[redacted]") : message;
}
function human(data: unknown): string {
  if (!data || typeof data !== "object") return String(data);
  const d = data as Record<string, unknown>;
  if (typeof d.id === "string" && typeof d.status === "string") return `Generation: ${d.id}\nStatus: ${d.status}\nCharged: ${d.credits_charged} credits${d.refunded ? " (refunded)" : ""}\n${[...(d.images as string[] ?? []), ...(d.videos as string[] ?? [])].join("\n")}`;
  if (typeof d.outputDir === "string") return `Exported ${d.frameCount} frames at ${d.fps} fps (${d.width}×${d.height})\n${d.outputDir}\n${(d.files as string[]).join("\n")}`;
  if (typeof d.credits === "number") return `Estimated cost: ${d.credits} credits\nBalance: ${d.balance} credits\n${JSON.stringify(d.budget, null, 2)}`;
  if (typeof d.reply === "string") return d.reply + (d.prompt ? `\n\nPrompt: ${d.prompt}` : "");
  return JSON.stringify(data, null, 2);
}

/** Reads one line from the terminal without echoing it. */
function askHidden(question: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) return Promise.reject(new Error("No terminal to type into: run login in your own terminal, or pipe the key with --stdin."));
  process.stderr.write(question);
  return new Promise((done, fail) => {
    let value = "";
    let finished = false;
    const wasRaw = input.isRaw;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      input.pause(); input.off("data", onData); input.off("end", onEnd); input.off("error", onError);
      try { input.setRawMode(wasRaw); } catch { error ??= new Error("Could not restore terminal input."); }
      process.stderr.write("\n");
      if (error) fail(error); else done(value);
    };
    const onEnd = () => finish(new Error("Input closed; nothing was saved."));
    const onError = () => finish(new Error("Could not read terminal input; nothing was saved."));
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003" || ch === "\u0004") return finish(new Error("Cancelled."));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    input.on("data", onData); input.once("end", onEnd); input.once("error", onError);
    try { input.setRawMode(true); input.resume(); } catch { finish(new Error("Could not read terminal input; nothing was saved.")); }
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Copies the bundled skill into DIR/spritesheetgen, replacing an older copy of it and nothing else. */
async function installSkill(dir: string): Promise<string> {
  const source = fileURLToPath(new URL("../skill/spritesheetgen/", import.meta.url));
  const target = join(resolve(dir.replace(/^~(?=$|[\\/])/, homedir())), "spritesheetgen");
  const existing = await stat(target).catch(() => undefined);
  if (existing) {
    const ours = await readFile(join(target, "SKILL.md"), "utf8").then((t) => {
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(t)?.[1];
      return frontmatter !== undefined && /^name: spritesheetgen\r?$/m.test(frontmatter);
    }, () => false);
    if (!ours) throw new Error(`${target} exists and is not this skill; not touching it.`);
    await rm(target, { recursive: true });
  }
  await cp(source, target, { recursive: true });
  return target;
}
