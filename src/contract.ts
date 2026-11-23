// Request and response types of the SpriteSheetGen agent API (POST https://spritesheetgen.com/api/agent/v1/*).
// Generated from the service contract; do not edit by hand.

export type ErrorCode = "VALIDATION_ERROR" | "AUTH_ERROR" | "PERMISSION_ERROR" | "NOT_FOUND" | "RATE_LIMITED" | "DATABASE_ERROR" | "INTERNAL_ERROR" | "PROVIDER_ERROR" | "PROVIDER_TIMEOUT" | "PROVIDER_RATE_LIMIT" | "CONFIGURATION_ERROR" | "PROVISIONING_ERROR" | "RESOURCE_NOT_READY" | "PRICE_CHANGED" | "SITE_UNAVAILABLE" | "PROVIDER_UNAVAILABLE";

export type AiKind = "text" | "image" | "video";

export type PromptAssistRole = "user" | "assistant";

export type PromptAssistLang = "en" | "zh" | "ja" | "ko";

export type PromptAssistMessage = { role: PromptAssistRole, content: string, };

export type PromptAssistRequest = { messages: Array<PromptAssistMessage>, lang: PromptAssistLang, };

export type PromptAssistResponse = { reply: string, prompt: string | null, remaining_today: number, };

export type GenerationStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type GenerationView = { 
/**
 * Opaque public id (never the internal sequential id).
 */
id: string, tool: string, 
/**
 * Validated user inputs, without the rendered prompt or provider metadata.
 */
inputs: Record<string, string>, kind: AiKind, status: GenerationStatus, 
/**
 * Whether this image can be used as a generation reference. Preview URLs
 * may be available before the durable media copy finishes.
 */
reference_ready?: boolean, text: string | null, images: Array<string>, 
/**
 * Video generations (mp4 URLs); empty otherwise.
 */
videos: Array<string>, credits_charged: number, refunded: boolean, error_code: ErrorCode | null, error_message: string | null, created_at: string, };

export type GenerationRequest = { 
/**
 * `GenerationView.id`.
 */
id: string, };

export type MediaUploadRequest = { 
/**
 * `image/png`, `image/jpeg` or `image/webp`.
 */
content_type: string, 
/**
 * Exact file size; the upload URL accepts only this many bytes.
 */
bytes: number, };

export type MediaUploadResponse = { media_id: string, put_url: string, 
/**
 * Headers the `PUT` must send (exactly these values).
 */
headers: Record<string, string>, };

export type MediaCompleteRequest = { media_id: string, };

export type MediaView = { media_id: string, url: string, reference: string, content_type: string, bytes: number, created_at: string, };

export type MediaListRequest = { 
/**
 * Defaults to 20, clamped to 1..=100; newest upload first.
 */
limit?: number, 
/**
 * Opaque `next_cursor` from the previous page.
 */
cursor?: string, };

export type MediaListResponse = { media: Array<MediaView>, next_cursor: string | null, };

export type ApiKeyBudgetView = { key_id: string, day: string, daily_cap_credits: number, total_cap_credits: number, daily_used_credits: number, total_used_credits: number, };

export type AgentEstimateRequest = { "operation": "character", description: string, } | { "operation": "action", reference: string, action: string, notes?: string, };

export type AgentEstimateResponse = { credits: number, balance: number, normalized_inputs: Record<string, string>, budget: ApiKeyBudgetView, estimated_at: string, };

export type AgentCharacterCreateRequest = { description: string, client_key: string, max_credits: number, };

export type AgentActionCreateRequest = { reference: string, action: string, notes?: string, client_key: string, max_credits: number, };

export type AgentCharacterSource = "generated" | "uploaded";

export type AgentCharactersRequest = { source: AgentCharacterSource, limit?: number, cursor?: string, };

export type AgentCharacter = { "source": "generated", reference: string, generation: GenerationView, } | { "source": "uploaded", reference: string, media: MediaView, };

export type AgentCharactersResponse = { characters: Array<AgentCharacter>, next_cursor: string | null, };

export type AgentActionsRequest = { reference: string, limit?: number, cursor?: string, };

export type AgentActionsResponse = { generations: Array<AgentActionView>, next_cursor: string | null, };

export type AgentActionView = { 
/**
 * The CLI supports GIF animations, not video. This describes the format;
 * the generation must still succeed before it can be exported.
 */
cli_exportable: boolean, 
/**
 * Opaque public id (never the internal sequential id).
 */
id: string, tool: string, 
/**
 * Validated user inputs, without the rendered prompt or provider metadata.
 */
inputs: Record<string, string>, kind: AiKind, status: GenerationStatus, 
/**
 * Whether this image can be used as a generation reference. Preview URLs
 * may be available before the durable media copy finishes.
 */
reference_ready?: boolean, text: string | null, images: Array<string>, 
/**
 * Video generations (mp4 URLs); empty otherwise.
 */
videos: Array<string>, credits_charged: number, refunded: boolean, error_code: ErrorCode | null, error_message: string | null, created_at: string, };

/** Agent API routes: POST path -> request/response body. */
export interface ApiRoutes {
  "/api/agent/v1/media/list": { req: MediaListRequest; res: MediaListResponse };
  "/api/agent/v1/media/upload": { req: MediaUploadRequest; res: MediaUploadResponse };
  "/api/agent/v1/media/complete": { req: MediaCompleteRequest; res: MediaView };
  "/api/agent/v1/estimate": { req: AgentEstimateRequest; res: AgentEstimateResponse };
  "/api/agent/v1/characters/create": { req: AgentCharacterCreateRequest; res: GenerationView };
  "/api/agent/v1/actions/create": { req: AgentActionCreateRequest; res: GenerationView };
  "/api/agent/v1/generations/get": { req: GenerationRequest; res: GenerationView };
  "/api/agent/v1/characters/list": { req: AgentCharactersRequest; res: AgentCharactersResponse };
  "/api/agent/v1/actions/list": { req: AgentActionsRequest; res: AgentActionsResponse };
  "/api/agent/v1/prompt-assist": { req: PromptAssistRequest; res: PromptAssistResponse };
}
