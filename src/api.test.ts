// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiError, createClient } from "./api";
const KEY = "test-api-secret-not-for-output";
const ok = (data: unknown) => Response.json({ ok: true, data, request_id: "test-request" });
beforeEach(() => { vi.stubEnv("SPRITESHEETGEN_API_KEY", KEY); vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("API failure guidance", () => {
  it.each([
    ["PERMISSION_ERROR", "API key lacks required scope", "scope"],
    ["PERMISSION_ERROR", "API key budget exhausted", "budget"],
    ["PERMISSION_ERROR", "current price exceeds max_credits", "price"],
    ["PERMISSION_ERROR", "not enough credits", "balance"],
    ["AUTH_ERROR", "invalid API key", "auth"],
  ])("maps %s / %s to %s without exposing raw data", async (code, message, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error: { code, message }, request_id: "req-1" }, { status: 403 }));
    const client = createClient({ fetch: fetcher });
    await expect(client.get("opaque")).rejects.toMatchObject({ kind, code, requestId: "req-1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(client)).not.toContain(KEY);
  });
  it("does not repeat a validation refusal or expose the provider's body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error: { code: "VALIDATION_ERROR", message: KEY } }, { status: 400 }));
    await expect(createClient({ fetch: fetcher }).get("x")).rejects.toSatisfy((e: Error) => !e.message.includes(KEY));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("retries a timed-out paid call with identical client_key and body", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted")))))
    .mockResolvedValueOnce(ok({ id: "generation", status: "PENDING" }));
  const request = { description: "knight", client_key: "persisted-request-key", max_credits: 5 };
  const result = await createClient({ fetch: fetcher, timeoutMs: 10 }).character(request);
  expect(result.id).toBe("generation");
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [url, init] of fetcher.mock.calls) {
    expect(url).toBe("https://spritesheetgen.com/api/agent/v1/characters/create");
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(init?.body as string)).toEqual(request);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
  }
});

it("does not send a key to an arbitrary base URL or follow an API redirect", async () => {
  vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", "https://evil.test");
  expect(() => createClient()).toThrow("loopback");
  const paths: string[] = [];
  const server = createServer((req, res) => { paths.push(req.url!); res.writeHead(302, { location: "/credential-sink" }); res.end(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  vi.stubEnv("SPRITESHEETGEN_API_BASE_URL", `http://127.0.0.1:${address.port}`);
  try {
    await expect(createClient({ retries: 0 }).get("x")).rejects.toBeInstanceOf(ApiError);
    expect(paths).toEqual(["/api/agent/v1/generations/get"]);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

it("upload signed PUT is key-free, then completes the original upload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sprite-upload-"));
  await writeFile(join(dir, "character.png"), new Uint8Array([137, 80, 78, 71]));
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(ok({ media_id: "media", put_url: "https://store.example/signed", headers: { "content-type": "image/png" } }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(ok({ media_id: "media", reference: "media:media" }));
  try {
    expect((await createClient({ fetch: fetcher }).uploadFile(join(dir, "character.png"))).reference).toBe("media:media");
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).has("authorization")).toBe(false);
    expect(fetcher.mock.calls[1][1]?.redirect).toBe("error");
    expect(JSON.parse(fetcher.mock.calls[2][1]?.body as string)).toEqual({ media_id: "media" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("polls to terminal failure without generating and times out without replacing the job", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(ok({ status: "RUNNING" })).mockResolvedValueOnce(ok({ status: "FAILED", refunded: true }));
  expect(await createClient({ fetch: fetcher }).wait("same-id", { pollMs: 1, timeoutMs: 1000 })).toMatchObject({ status: "FAILED", refunded: true });
  expect(fetcher.mock.calls.every(([url]) => String(url).endsWith("/generations/get"))).toBe(true);
  const pending = vi.fn<typeof fetch>().mockImplementation(async () => ok({ status: "PENDING" }));
  await expect(createClient({ fetch: pending }).wait("same-id", { pollMs: 20, timeoutMs: 5 })).rejects.toMatchObject({ code: "POLL_TIMEOUT" });
  expect(pending).toHaveBeenCalledTimes(1);
});

it("a timeout while reading the response body also retries the original paid request", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockImplementationOnce(async (_url, init) => new Response(new ReadableStream({ start(controller) { init!.signal!.addEventListener("abort", () => controller.error(new Error("body aborted"))); } })))
    .mockResolvedValueOnce(ok({ id: "same-generation" }));
  const body = { description: "knight", client_key: "persisted-body-key", max_credits: 5 };
  await expect(createClient({ fetch: fetcher, timeoutMs: 10 }).character(body)).resolves.toMatchObject({ id: "same-generation" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
});

it("lists both GIF and web video actions without discarding capability flags", async () => {
  const result = { generations: [
    { id: "gif", tool: "sprite_video", kind: "image", cli_exportable: true },
    { id: "video", tool: "sprite_motion", kind: "video", cli_exportable: false, videos: ["https://media.test/clip.mp4"] },
  ], next_cursor: null };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(result));
  expect(await createClient({ fetch: fetcher }).listActions({ reference: "generation:character" })).toEqual(result);
  expect(String(fetcher.mock.calls[0][0])).toContain("/actions/list");
});

it("explains a reference readiness refusal without classifying it as an unknown charge", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error: { code: "RESOURCE_NOT_READY", message: "Character image is still being saved. Retry shortly." } }, { status: 409 }));
  await expect(createClient({ fetch: fetcher }).animate({ reference: "generation:character", action: "walk", client_key: "persisted-key-123", max_credits: 10 })).rejects.toMatchObject({ code: "RESOURCE_NOT_READY", status: 409, message: expect.stringContaining("No credits were charged") });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
