import { readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Where the API key lives on this machine. The environment wins (CI, an MCP
 * host's own env); otherwise `spritesheetgen login` stores it in a file only
 * the user can read, so the key never has to pass through an agent's chat,
 * an MCP configuration or shell history.
 */
export const KEY_ENV = "SPRITESHEETGEN_API_KEY";

export function credentialsPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  const base = platform === "win32"
    ? env.APPDATA || join(homedir(), "AppData", "Roaming")
    : env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "spritesheetgen", "credentials");
}

/** The key to use, or undefined. Read on every new client, so a login takes effect without restarting the MCP server. */
export function loadKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = env[KEY_ENV];
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(credentialsPath(env), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Keys are issued as ak_<id>.<token>; anything else is a paste mistake. */
export function checkKeyShape(raw: string): string {
  const key = raw.trim();
  if (!/^ak_[A-Za-z0-9]+\.[A-Za-z0-9_-]{16,}$/.test(key)) throw new Error("That does not look like a SpriteSheetGen API key (it starts with ak_).");
  return key;
}

export async function saveKey(key: string, file = credentialsPath()): Promise<string> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await chmod(dirname(file), 0o700);
  // Create privately before replacing: never write a secret into an old readable file or follow its symlink.
  const staging = await mkdtemp(join(dirname(file), ".credentials-"));
  try {
    const next = join(staging, "credentials");
    await writeFile(next, key + "\n", { mode: 0o600, flag: "wx" });
    await rename(next, file);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return file;
}

export async function forgetKey(file = credentialsPath()): Promise<string> {
  await rm(file, { force: true });
  return file;
}
