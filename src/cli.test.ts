// @vitest-environment node
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./cli";
const originalExit = process.exitCode;
afterEach(() => { process.exitCode = originalExit; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("CLI prompt uses the contract's zh and keeps JSON stdout parseable", async () => {
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  vi.stubEnv("SPRITESHEETGEN_API_KEY", "private-test-key");
  vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", "");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, data: { reply: "hello", prompt: null, remaining_today: 19 } }));
  vi.stubGlobal("fetch", fetcher);
  await runCli(["prompt", "--text", "knight", "--lang", "zh", "--json"]);
  expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).lang).toBe("zh");
  expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({ ok: true, data: { reply: "hello" } });
  expect(err).not.toHaveBeenCalled();
});

it("paid CLI refuses missing client-key without sending a request", async () => {
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.stubEnv("SPRITESHEETGEN_API_KEY", "private-test-key");
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
  await runCli(["character", "--description", "knight", "--max-credits", "5", "--json"]);
  expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({ ok: false });
  expect(fetcher).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it("mcp dispatch yields stdout ownership to the injected server", async () => {
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const mcp = vi.fn(async () => {});
  await runCli(["mcp"], { mcp });
  expect(mcp).toHaveBeenCalledTimes(1);
  expect(out).not.toHaveBeenCalled();
});

describe("login and skill install", () => {
  const KEY = "ak_8f0c5cb3b4986a808e86.abcdefghijklmnopqrstuvwxyz_-0123456789AB";
  const stdinOf = (text: string) => vi.spyOn(process, "stdin", "get").mockReturnValue(Readable.from([Buffer.from(text)]) as unknown as typeof process.stdin);

  it("login --stdin checks the key with the server, then saves it for this user", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ssg-login-"));
    vi.stubEnv("XDG_CONFIG_HOME", dir); vi.stubEnv("SPRITESHEETGEN_API_KEY", ""); vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", "");
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stdinOf(KEY + "\n");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, data: { credits: 5, balance: 1, budget: {}, normalized_inputs: {} } }));
    vi.stubGlobal("fetch", fetcher);
    await runCli(["login", "--stdin", "--json"]);
    expect((fetcher.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({ ok: true });
    expect((await readFile(join(dir, "spritesheetgen", "credentials"), "utf8")).trim()).toBe(KEY);
    expect(String(out.mock.calls[0][0])).not.toContain(KEY);
  });

  it("login refuses a key the server rejects and saves nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ssg-login-"));
    vi.stubEnv("XDG_CONFIG_HOME", dir); vi.stubEnv("SPRITESHEETGEN_API_KEY", ""); vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", "");
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stdinOf(KEY);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error: { code: "AUTH_ERROR", message: "invalid API key" } }, { status: 401 })));
    await runCli(["login", "--stdin", "--json"]);
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({ ok: false, error: { kind: "auth" } });
    await expect(stat(join(dir, "spritesheetgen", "credentials"))).rejects.toThrow();
    expect(process.exitCode).toBe(1);
  });

  it("skill install copies the bundled skill, updates its own copy and leaves a foreign folder alone", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ssg-skill-"));
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runCli(["skill", "install", "--dir", dir, "--json"]);
    expect(await readFile(join(dir, "spritesheetgen", "SKILL.md"), "utf8")).toMatch(/^name: spritesheetgen$/m);
    await stat(join(dir, "spritesheetgen", "references", "engines.md"));
    await writeFile(join(dir, "spritesheetgen", "stale.md"), "old");
    await runCli(["skill", "install", "--dir", dir, "--json"]);
    await expect(stat(join(dir, "spritesheetgen", "stale.md"))).rejects.toThrow();

    const other = await mkdtemp(join(tmpdir(), "ssg-skill-"));
    await mkdir(join(other, "spritesheetgen"));
    await writeFile(join(other, "spritesheetgen", "notes.md"), "mine");
    await runCli(["skill", "install", "--dir", other, "--json"]);
    expect(process.exitCode).toBe(1);
    expect(await readFile(join(other, "spritesheetgen", "notes.md"), "utf8")).toBe("mine");
  });
});

it.each([503, 404, 429])("login preserves the previous key on HTTP %s", async (status) => {
  const dir = await mkdtemp(join(tmpdir(), "ssg-login-"));
  vi.stubEnv("XDG_CONFIG_HOME", dir); vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", "");
  const file = join(dir, "spritesheetgen", "credentials");
  await mkdir(join(dir, "spritesheetgen")); await writeFile(file, "previous-key");
  vi.spyOn(process, "stdin", "get").mockReturnValue(Readable.from([Buffer.from("ak_test.abcdefghijklmnop")]) as unknown as typeof process.stdin);
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status })));
  await runCli(["login", "--stdin", "--json"]);
  expect(JSON.parse(String(out.mock.calls[0][0])).ok).toBe(false);
  expect(await readFile(file, "utf8")).toBe("previous-key");
});

it.each(["ctrl-c", "ctrl-d", "end", "error"])("hidden login cleans up on %s without echo or a request", async (event) => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn((raw: boolean): void => { input.isRaw = raw; }) });
  vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as typeof process.stdin);
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const pending = runCli(["login", "--json"]);
  input.emit("data", Buffer.from("ak_secret.abcdefghijklmnop"));
  if (event === "ctrl-c" || event === "ctrl-d") input.emit("data", Buffer.from(event === "ctrl-c" ? "\u0003" : "\u0004"));
  else input.emit(event, new Error("input failure"));
  await pending;
  expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
  for (const name of ["data", "end", "error"]) expect(input.listenerCount(name)).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
  expect(JSON.parse(String(out.mock.calls[0][0])).ok).toBe(false);
  expect(JSON.stringify([out.mock.calls, err.mock.calls])).not.toContain("ak_secret");
});

it("skill install does not identify another skill by a name example in its body", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ssg-skill-"));
  const target = join(dir, "spritesheetgen");
  await mkdir(target);
  const content = "---\nname: my-skill\n---\nExample:\nname: spritesheetgen\n";
  await writeFile(join(target, "SKILL.md"), content);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await runCli(["skill", "install", "--dir", dir, "--json"]);
  expect(process.exitCode).toBe(1);
  expect(await readFile(join(target, "SKILL.md"), "utf8")).toBe(content);
});
