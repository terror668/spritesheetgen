/**
 * `spritesheetgen mcp`: the same client and local export as the CLI, as an
 * MCP server over stdio for AI coding agents. stdout carries only the
 * protocol; nothing is logged there. The API key comes from the
 * environment (SPRITESHEETGEN_API_KEY) or the file `spritesheetgen login`
 * writes, and is never part of a tool's input or output.
 *
 * Money rules the tools state to the agent: estimate first, show the price,
 * spend only within what the user approved (the key's own budget is the
 * server-side ceiling), one client_key per intended purchase and the same
 * one on every retry of it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiError, createClient } from "./api";
import { exportFile, exportGeneration, type ExportOptions } from "./export";

const VERSION = "0.3.1";
const ACTIONS = ["walk", "run", "idle", "attack", "jump"] as const;
/** One MCP call should not hold the agent for long; longer waits poll again with get_generation. */
const MAX_WAIT_SECONDS = 120;

const clientKey = z
	.string()
	.regex(/^[A-Za-z0-9_-]{8,64}$/)
	.describe("Idempotency key for THIS purchase, 8-64 of A-Z a-z 0-9 _ -. Make a new one per intended purchase; reuse the SAME one when retrying after an error or timeout, so it is never charged twice.");
const maxCredits = z.number().int().nonnegative().describe("Most credits the user approved for this call (from estimate_sprite). The call is refused if the price is higher.");
const cursor = z.string().optional().describe("next_cursor from the previous page.");
const limit = z.number().int().min(1).max(100).optional();

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): Result => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

/** Errors the agent can act on: what kind, and what to tell the user. Never the key or a raw response. */
function fail(e: unknown): Result {
	const body = e instanceof ApiError
		? { error: e.kind, code: e.code, message: e.message, request_id: e.requestId }
		: { error: "client", message: e instanceof Error ? e.message : "Unexpected error." };
	return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
}
async function run(fn: () => Promise<unknown>): Promise<Result> {
	try {
		return ok(await fn());
	} catch (e) {
		return fail(e);
	}
}

/** Read credentials for each call, including after login switches accounts or logout removes the key. */
const client = () => createClient();

export function createMcpServer(): McpServer {
	const server = new McpServer(
		{ name: "spritesheetgen", version: VERSION },
		{
			instructions: [
				"SpriteSheetGen makes game characters and their animations, then you pack them into sprite sheets locally.",
				"Flow: estimate_sprite -> tell the user the price and get approval -> create_character -> get_generation until SUCCEEDED -> show the image -> animate_character for each action the user wants -> get_generation -> export_sprite_sheet into the user's project.",
				"Never spend without the user's approval of the price. Never retry a paid call with a new client_key: reuse the same one. A FAILED generation is refunded; trying again is a new purchase that needs approval.",
				"An export never generates again; if it fails, fix the settings and export again.",
				"If a tool answers error=auth, the user has no working key on this machine: ask them to create one on https://spritesheetgen.com/account/ and run `npx -y @spritesheetgen/cli login` in their own terminal, then call the tool again. Never ask for the key in the chat.",
			].join("\n"),
		},
	);

	server.registerTool(
		"estimate_sprite",
		{
			title: "Estimate a character or an action",
			description: "Free. Validates a request and returns its price in credits, the balance and the key's remaining budget. Call before any paid tool and show the price to the user.",
			inputSchema: {
				operation: z.enum(["character", "action"]),
				description: z.string().optional().describe("For operation=character: the character, e.g. 'a small knight with a red cape'."),
				reference: z.string().optional().describe("For operation=action: the character's reference (generation:… or media:…)."),
				action: z.enum(ACTIONS).optional().describe("For operation=action."),
				notes: z.string().max(200).optional().describe("For operation=action: optional motion notes."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(a) =>
			run(async () => {
				if (a.operation === "character") {
					if (!a.description) throw new Error("description is required for operation=character.");
					return client().estimate({ operation: "character", description: a.description });
				}
				if (!a.reference || !a.action) throw new Error("reference and action are required for operation=action.");
				return client().estimate({ operation: "action", reference: a.reference, action: a.action, notes: a.notes });
			}),
	);

	server.registerTool(
		"create_character",
		{
			title: "Create a character image (paid)",
			description: "Spends credits. Starts one character image from a description and returns its generation right away (usually PENDING); poll get_generation. Only after the user approved the estimated price.",
			inputSchema: { description: z.string().min(3), client_key: clientKey, max_credits: maxCredits },
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		},
		(a) => run(() => client().character(a)),
	);

	server.registerTool(
		"animate_character",
		{
			title: "Animate a character (paid)",
			description: "Spends credits. Starts one animation (one action) of a character, generated or uploaded, and returns its generation right away; poll get_generation. One action per call; only after the user approved the estimated price.",
			inputSchema: {
				reference: z.string().describe("The character: generation:<id> of a SUCCEEDED character image, or media:<id> of an upload."),
				action: z.enum(ACTIONS),
				notes: z.string().max(200).optional(),
				client_key: clientKey,
				max_credits: maxCredits,
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		},
		(a) => run(() => client().animate(a)),
	);

	server.registerTool(
		"get_generation",
		{
			title: "Check a generation",
			description: `Free. The generation's status, images or animation, credits charged and whether a failure was refunded. With wait_seconds (at most ${MAX_WAIT_SECONDS}) it waits until it is done or the time is up; then call again.`,
			inputSchema: { id: z.string(), wait_seconds: z.number().int().min(0).max(MAX_WAIT_SECONDS).optional() },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(a) =>
			run(async () => {
				if (!a.wait_seconds) return client().get(a.id);
				try {
					return await client().wait(a.id, { timeoutMs: a.wait_seconds * 1000 });
				} catch (e) {
					// still running when the time is up: report where it is, not an error
					if (e instanceof ApiError && e.code === "POLL_TIMEOUT") return client().get(a.id);
					throw e;
				}
			}),
	);

	server.registerTool(
		"list_characters",
		{
			title: "List the user's characters",
			description: "Free. Characters the user generated or uploaded (one source per call), newest first, each with the reference animate_character takes.",
			inputSchema: { source: z.enum(["generated", "uploaded"]), limit, cursor },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(a) => run(() => client().listCharacters(a)),
	);

	server.registerTool(
		"list_actions",
		{
			title: "List a character's animations",
			description: "Free. All GIF and web video animations from one character reference, newest first. Check here before paying for an action the character may already have. kind distinguishes image/video; cli_exportable is true for GIF. Videos cannot be packed by this CLI: download the MP4 or use the website.",
			inputSchema: { reference: z.string(), limit, cursor },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(a) => run(() => client().listActions(a)),
	);

	server.registerTool(
		"improve_prompt",
		{
			title: "Improve a character description",
			description: "No credits (a small free daily quota shared with the website). Turns a rough idea into a description that generates well; returns the reply and, when ready, a prompt to use with create_character.",
			inputSchema: {
				text: z.string().min(1).describe("The idea or the user's answer."),
				lang: z.enum(["en", "zh", "ja", "ko"]).optional().describe("Language of the reply; default en."),
				history: z
					.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
					.optional()
					.describe("Earlier turns of this conversation, oldest first."),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		(a) => run(() => client().prompt({ messages: [...(a.history ?? []), { role: "user", content: a.text }], lang: a.lang ?? "en" })),
	);

	server.registerTool(
		"upload_character",
		{
			title: "Upload the user's own character image",
			description: "Free. Uploads a local PNG, JPEG or WebP (under 10 MB, one whole character on a plain background, made by the user or licensed to them) and returns its media reference for animate_character.",
			inputSchema: { file_path: z.string().describe("Path to the image on this machine.") },
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		(a) => run(() => client().uploadFile(a.file_path)),
	);

	server.registerTool(
		"export_sprite_sheet",
		{
			title: "Export a sprite sheet into a folder",
			description: "No credits. Downloads a SUCCEEDED animation (or reads a local GIF) and packs it on this machine: sheet.png, sheet.json (TexturePacker, for Phaser and others), a Godot SpriteFrames .tres, and optionally single frames and a preview GIF. Never generates again. output_dir must not exist yet: it is created, and an existing folder is refused, so nothing of the user's is ever overwritten.",
			inputSchema: {
				id: z.string().optional().describe("The animation's generation id."),
				file: z.string().optional().describe("Or a local GIF to pack (no key needed)."),
				output_dir: z.string().describe("A new folder, e.g. assets/sprites/knight_walk; it must not exist yet."),
				name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional().describe("Name of the animation and its frames (knight_walk -> knight_walk_00, …); the files keep their fixed names."),
				frames: z.number().int().min(1).max(64).optional().describe("Frames to keep (default: the action's own)."),
				fps: z.number().int().min(1).max(60).optional(),
				pixel_height: z.number().int().min(1).max(512).optional().describe("Pixelate to this height (pixel art)."),
				columns: z.number().int().min(1).max(64).optional(),
				background: z.enum(["auto", "remove", "keep"]).optional().describe("Background removal; auto by default."),
				individual_frames: z.boolean().optional(),
				preview: z.boolean().optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		(a) =>
			run(async () => {
				if (!!a.id === !!a.file) throw new Error("Give exactly one of id or file.");
				const settings: ExportOptions["settings"] = {};
				if (a.frames !== undefined) settings.count = a.frames;
				if (a.pixel_height !== undefined) {
					settings.targetHeight = a.pixel_height;
					settings.pixelate = true;
				}
				if (a.columns !== undefined) settings.columns = a.columns;
				if (a.background && a.background !== "auto") settings.removeBackground = a.background === "remove";
				const options = { outputDir: a.output_dir, name: a.name, fps: a.fps, settings, frames: a.individual_frames, preview: a.preview };
				return a.file ? exportFile(a.file, options) : exportGeneration(client(), a.id!, options);
			}),
	);

	return server;
}

/** Serve over stdio until the client disconnects. */
export async function runMcp(): Promise<void> {
	const server = createMcpServer();
	await server.connect(new StdioServerTransport());
}
