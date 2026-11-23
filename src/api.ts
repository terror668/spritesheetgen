import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { loadKey } from "./credentials";
import type { ApiRoutes, AgentEstimateRequest, AgentCharacterCreateRequest, AgentActionCreateRequest, AgentCharactersRequest, AgentActionsRequest, PromptAssistRequest, GenerationView } from "./contract";

export type { AgentEstimateRequest, AgentCharacterCreateRequest, AgentActionCreateRequest, AgentCharactersRequest, AgentActionsRequest, PromptAssistRequest, GenerationView };
export type AgentPath = Extract<keyof ApiRoutes, `/api/agent/v1/${string}`>;
export type FailureKind = "auth" | "scope" | "budget" | "price" | "balance" | "permission" | "api" | "network" | "timeout" | "invalid_response";

/** Safe, structured errors. Never includes the key, raw response, or request body. */
export class ApiError extends Error {
  constructor(readonly kind: FailureKind, readonly code: string, message: string, readonly status = 0, readonly requestId?: string) {
    super(message); this.name = "ApiError";
  }
}

function apiFailure(status: number, code: string, message: string, requestId?: string): ApiError {
  if (code === "AUTH_ERROR") return new ApiError("auth", code, "The API key was refused (revoked, expired or mistyped). Create a new one at https://spritesheetgen.com/account/ and run `npx -y @spritesheetgen/cli login` in your own terminal.", status, requestId);
  if (code === "PERMISSION_ERROR") {
    if (message === "API key lacks required scope") return new ApiError("scope", code, "The key lacks the required scope. Update it on the account page.", status, requestId);
    if (message === "API key budget exhausted") return new ApiError("budget", code, "The key budget is exhausted. Ask its owner to adjust the caps.", status, requestId);
    if (message === "current price exceeds max_credits") return new ApiError("price", code, "The price exceeds max_credits. Estimate again before authorizing more.", status, requestId);
    if (message === "not enough credits") return new ApiError("balance", code, "The account has insufficient credits.", status, requestId);
    return new ApiError("permission", code, "This operation is not permitted.", status, requestId);
  }
  if (code === "RESOURCE_NOT_READY") return new ApiError("api", code, "The character image is still being saved. Poll its generation until reference_ready is true, then retry with the SAME client_key. No credits were charged for this refusal.", status, requestId);
  if (code === "VALIDATION_ERROR") return new ApiError("api", code, message || "Invalid request input.", status, requestId);
  return new ApiError("api", code, `Request failed (${code}, HTTP ${status}).`, status, requestId);
}

function apiOrigin(): string {
  const override = process.env.SPRITESHEETGEN_API_BASE_URL;
  if (!override) return "https://spritesheetgen.com";
  const url = new URL(override);
  // The override exists only for local fake servers, never a configurable credential destination.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SPRITESHEETGEN_API_BASE_URL must be an HTTP loopback origin for tests.");
  }
  return url.origin;
}

export interface ClientOptions {
  timeoutMs?: number;
  /** 0..3 retries for reads and idempotent paid requests, never a fresh client_key. */
  retries?: number;
  /** A key to try instead of the stored one (login checks a pasted key before saving it). */
  key?: string;
  /** Test adapter; does not change the allowed origin or Authorization rules. */
  fetch?: typeof globalThis.fetch;
}
export interface WaitOptions { timeoutMs?: number; pollMs?: number; }
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What to tell a user (or their agent) without a key: the key is entered by the user in their own terminal, never in chat. */
export const NO_KEY = "No API key on this machine. Create one at https://spritesheetgen.com/account/ (API keys), then run `npx -y @spritesheetgen/cli login` in your own terminal and paste it there.";

/** Bearer-only client; the key is read once per client from SPRITESHEETGEN_API_KEY or the login file. */
export class SpriteClient {
  #key: string;
  #origin: string;
  #fetch: typeof globalThis.fetch;
  #timeout: number;
  #retries: number;
  constructor(options: ClientOptions = {}) {
    const key = options.key ?? loadKey();
    if (!key || /\s/.test(key)) throw new ApiError("auth", "AUTH_ERROR", NO_KEY);
    this.#key = key; this.#origin = apiOrigin(); this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeout = options.timeoutMs ?? 30_000; this.#retries = options.retries ?? 2;
    if (!Number.isFinite(this.#timeout) || this.#timeout < 1 || !Number.isInteger(this.#retries) || this.#retries < 0 || this.#retries > 3) throw new Error("Invalid client timeout or retries.");
  }

  async #post<P extends AgentPath>(path: P, body: ApiRoutes[P]["req"], retry = true, timeout = this.#timeout): Promise<ApiRoutes[P]["res"]> {
    const encoded = JSON.stringify(body); // exact same client_key and payload on every attempt
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let error: ApiError;
      try {
        const response = await this.#fetch(this.#origin + path, {
          method: "POST", redirect: "error", signal: controller.signal,
          headers: { authorization: `Bearer ${this.#key}`, "content-type": "application/json" }, body: encoded,
        });
        let value: unknown;
        try { value = await response.json(); } catch (e) { if (controller.signal.aborted) throw e; throw new ApiError("invalid_response", "INVALID_RESPONSE", "The server returned an invalid response.", response.status); }
        if (!value || typeof value !== "object" || !("ok" in value)) throw new ApiError("invalid_response", "INVALID_RESPONSE", "The server returned an invalid envelope.", response.status);
        const envelope = value as { ok: unknown; data?: unknown; error?: { code?: unknown; message?: unknown }; request_id?: unknown };
        if (envelope.ok === true && response.ok && "data" in envelope) return envelope.data as ApiRoutes[P]["res"];
        const code = typeof envelope.error?.code === "string" && /^[A-Z_]{1,64}$/.test(envelope.error.code) ? envelope.error.code : "INVALID_RESPONSE";
        throw apiFailure(response.status, code, typeof envelope.error?.message === "string" ? envelope.error.message.split(this.#key).join("[redacted]").slice(0, 500) : "", typeof envelope.request_id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(envelope.request_id) ? envelope.request_id : undefined);
      } catch (e) {
        error = e instanceof ApiError ? e : new ApiError(controller.signal.aborted ? "timeout" : "network", controller.signal.aborted ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", "The request outcome is unknown. Retry with the SAME client_key; do not start a replacement generation.");
      } finally { clearTimeout(timer); }
      const transient = error.kind === "network" || error.kind === "timeout" || error.status >= 500;
      if (!retry || !transient || attempt >= this.#retries) throw error;
      await pause(100 * 2 ** attempt);
    }
  }

  /** Free validation/price estimate; does not reserve credits. */
  estimate(body: AgentEstimateRequest) { return this.#post("/api/agent/v1/estimate", body); }
  /** Paid. The caller must persist client_key before invoking this method. */
  character(body: AgentCharacterCreateRequest) { validatePaid(body); return this.#post("/api/agent/v1/characters/create", body); }
  /** Paid single action, never an automatic batch. */
  animate(body: AgentActionCreateRequest) { validatePaid(body); return this.#post("/api/agent/v1/actions/create", body); }
  get(id: string) { return this.#post("/api/agent/v1/generations/get", { id }); }
  listCharacters(body: AgentCharactersRequest) { return this.#post("/api/agent/v1/characters/list", body); }
  listActions(body: AgentActionsRequest) { return this.#post("/api/agent/v1/actions/list", body); }
  /** Zero credits, consumes the shared daily prompt quota. Not automatically retried. */
  prompt(body: PromptAssistRequest) { return this.#post("/api/agent/v1/prompt-assist", body, false); }
  complete(media_id: string) { return this.#post("/api/agent/v1/media/complete", { media_id }); }

  /** Returns a terminal generation, including FAILED/refunded. Timeout never cancels it. */
  async wait(id: string, options: WaitOptions = {}): Promise<GenerationView> {
    const timeout = options.timeoutMs ?? 900_000, poll = options.pollMs ?? 2_000;
    if (!Number.isFinite(timeout) || timeout < 1 || !Number.isFinite(poll) || poll < 1) throw new Error("Invalid polling timeout or interval.");
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      let generation: GenerationView;
      try { generation = await this.#post("/api/agent/v1/generations/get", { id }, false, Math.min(this.#timeout, deadline - Date.now())); }
      catch (e) { if (e instanceof ApiError && e.kind === "timeout" && Date.now() >= deadline) break; throw e; }
      if (generation.status === "SUCCEEDED" || generation.status === "FAILED") return generation;
      await pause(Math.min(poll, Math.max(0, deadline - Date.now())));
    }
    throw new ApiError("timeout", "POLL_TIMEOUT", "Polling timed out. Generation may still be running; use status with the same id.");
  }

  /** Upload a local PNG/JPEG/WebP via signed PUT; the API key never accompanies storage requests. */
  async uploadFile(file: string) {
    const content_type = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[extname(file).toLowerCase()];
    const info = await stat(file);
    if (!content_type || !info.isFile() || info.size < 1 || info.size > 10_000_000) throw new Error("Upload a PNG, JPEG or WebP file of 1..10,000,000 bytes.");
    const data = await readFile(file);
    if (data.length > 10_000_000) throw new Error("Upload file is too large.");
    const upload = await this.#post("/api/agent/v1/media/upload", { content_type, bytes: data.length }, false);
    const url = new URL(upload.put_url);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid upload URL.");
    const headers = new Headers(upload.headers);
    // Signed storage headers are data from the API, never a reason to forward a Bearer token.
    headers.delete("authorization"); headers.delete("cookie");
    let response: Response;
    try { response = await this.#fetch(url, { method: "PUT", headers, body: data, redirect: "error", signal: AbortSignal.timeout(this.#timeout) }); }
    catch { throw new Error("Upload transport failed. No generation was requested."); }
    if (!response.ok) throw new Error(`Storage upload failed (HTTP ${response.status}).`);
    return this.complete(upload.media_id);
  }
}

function validatePaid(body: { client_key: string; max_credits: number }) {
  if (typeof body.client_key !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(body.client_key) || !Number.isSafeInteger(body.max_credits) || body.max_credits < 0) {
    throw new Error("Paid calls require client_key (8..64 letters/digits/-/_) and nonnegative safe-integer max_credits.");
  }
}
export function createClient(options?: ClientOptions): SpriteClient { return new SpriteClient(options); }
