import { alignFrames, bodyAnchor } from "./align";
import { chromaKey, removeSpecks, type EdgeCleanup } from "./chroma";
import { packGrid } from "./pack";
import { PALETTES, pixelateFrames } from "./pixelate";
import { dedupeSimilar, sampleUniform } from "./select";
import type { PackedSheet, Point, RGB, RGBAImage } from "./types";
import { UserError } from "../user-error";

export type PaletteId = keyof typeof PALETTES | "auto" | "none";

export interface ProcessSettings {
	/** Inclusive start / exclusive end index into the source frames. */
	start: number;
	end: number;
	/** Number of frames in the final animation. */
	count: number;
	dedupe: boolean;
	removeBackground: boolean;
	/** Optional manual key colour; auto-detected from the border otherwise. */
	keyColor?: RGB;
	tolerance: number;
	softness: number;
	/** Fringe removal on the character's edge: see ChromaKeyOptions.edgeCleanup. */
	edgeCleanup: EdgeCleanup | "off";
	align: boolean;
	padding: number;
	pixelate: boolean;
	targetHeight: number;
	palette: PaletteId;
	autoColors: number;
	/** Grid columns; 0 = single row strip. */
	columns: number;
	/** A one-off move (attack, jump): sampling keeps its first and last frame, not a loop's evenly spaced cycle. */
	ends?: boolean;
	/** What alignment keeps still: the bounding box's middle (default) or the body's middle (weapons and capes reaching out move it less). */
	anchor?: "body" | "box";
}

/** Largest sheet side we produce; most GPUs / engines cap textures at 8192 or 16384. */
export const MAX_SHEET_SIDE = 8192;

export const DEFAULT_SETTINGS: ProcessSettings = {
	start: 0,
	end: Number.MAX_SAFE_INTEGER,
	count: 8,
	dedupe: true,
	removeBackground: true,
	tolerance: 60,
	softness: 40,
	edgeCleanup: "strong",
	align: true,
	padding: 2,
	pixelate: false,
	targetHeight: 64,
	palette: "auto",
	autoColors: 16,
	columns: 0,
};

export interface ProcessResult {
	frames: RGBAImage[];
	sheet: PackedSheet;
	pivot?: Point;
}

/** True when the image border is mostly transparent (background already removed). */
export function hasTransparentBorder(img: RGBAImage): boolean {
	let transparent = 0, total = 0;
	const check = (x: number, y: number) => {
		total++;
		if (img.data[(y * img.width + x) * 4 + 3] < 16) transparent++;
	};
	for (let x = 0; x < img.width; x++) { check(x, 0); check(x, img.height - 1); }
	for (let y = 0; y < img.height; y++) { check(0, y); check(img.width - 1, y); }
	return total > 0 && transparent / total > 0.9;
}

/**
 * The whole post-processing pipeline:
 *   range → dedupe → sample N → key background → align → pixelate → pack
 * Pure and synchronous so it can move into a Web Worker unchanged.
 */
export function processFrames(source: RGBAImage[], s: ProcessSettings): ProcessResult {
	if (source.length === 0) throw new UserError("no_frames");
	const start = Math.max(0, Math.min(s.start, source.length - 1));
	const end = Math.max(start + 1, Math.min(s.end, source.length));
	let frames = source.slice(start, end);
	if (s.dedupe) frames = dedupeSimilar(frames);
	frames = sampleUniform(frames, Math.max(1, s.count), 0, frames.length, s.ends);

	if (s.removeBackground) {
		frames = frames.map((f) =>
			removeSpecks(chromaKey(f, {
				key: s.keyColor ?? undefined, tolerance: s.tolerance, softness: s.softness,
				...(s.edgeCleanup === "off" ? { fringe: 0 } : { edgeCleanup: s.edgeCleanup }),
			})),
		);
	}

	let pivot: Point | undefined;
	if (s.align) {
		const aligned = alignFrames(frames, { padding: s.padding, ...(s.anchor === "body" ? { anchorFn: bodyAnchor } : {}) });
		frames = aligned.frames;
		pivot = aligned.pivot;
	}

	if (s.pixelate) {
		const before = frames[0];
		frames = pixelateFrames(frames, { targetHeight: s.targetHeight, palette: s.palette, autoColors: s.autoColors });
		if (pivot && before) {
			pivot = {
				x: Math.round((pivot.x * frames[0].width) / before.width),
				y: Math.round((pivot.y * frames[0].height) / before.height),
			};
		}
	}

	const columns = s.columns > 0 ? s.columns : frames.length;
	const cols = Math.min(columns, frames.length);
	const sheetW = cols * frames[0].width, sheetH = Math.ceil(frames.length / cols) * frames[0].height;
	if (Math.max(sheetW, sheetH) > MAX_SHEET_SIDE) {
		throw new UserError("sheet_too_large", { w: sheetW, h: sheetH, limit: MAX_SHEET_SIDE });
	}
	// frame names are applied at export time (renameFrames) so renaming never reprocesses
	const sheet = packGrid(frames, { columns, name: "frame" });
	return { frames, sheet, pivot };
}
