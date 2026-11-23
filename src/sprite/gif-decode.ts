/**
 * Animated GIF decoder in plain TypeScript: the fallback for browsers without
 * WebCodecs ImageDecoder (Safari before 27.3, per MDN browser-compat-data
 * 2026-11-12). The AI animation step returns a GIF, so a paid result must
 * open everywhere, not only in Chrome, Edge and Firefox.
 *
 * Frames come out composited the way a browser shows them (disposal 0-3,
 * transparency, interlacing), each the size of the logical screen.
 */
import type { RGBAImage } from "./types";
import { UserError } from "../user-error";

/** Largest logical screen or frame accepted (4096 × 4096): a forged header must not make us allocate gigabytes. */
export const MAX_GIF_PIXELS = 4096 * 4096;

export interface GifFrame {
	image: RGBAImage;
	/** Display time; 0-1 cs is shown as 100 ms, like browsers do. */
	delayMs: number;
}

export interface DecodedGif {
	width: number;
	height: number;
	frames: RGBAImage[];
	/** Display time of each decoded frame; 0-1 cs is shown as 100 ms, like browsers do. */
	delaysMs: number[];
	/** Frames in the file, including those beyond `maxFrames`. */
	totalFrames: number;
}

const bad = () => new UserError("gif_corrupt");

/** Decode a whole GIF at once (see `gifFrames`). */
export function decodeGif(bytes: Uint8Array, opts: { maxFrames?: number } = {}): DecodedGif {
	const it = gifFrames(bytes, opts);
	const frames: RGBAImage[] = [];
	const delaysMs: number[] = [];
	for (let r = it.next(); ; r = it.next()) {
		if (r.done) return { ...r.value, frames, delaysMs };
		frames.push(r.value.image);
		delaysMs.push(r.value.delayMs);
	}
}

/**
 * Frames one at a time, so a caller can yield to the page and stop between
 * them. Returns the screen size and how many frames the file holds (frames
 * past `maxFrames` are counted, not decoded).
 */
export function* gifFrames(
	bytes: Uint8Array,
	opts: { maxFrames?: number } = {},
): Generator<GifFrame, { width: number; height: number; totalFrames: number }> {
	const maxFrames = opts.maxFrames ?? Infinity;
	let decoded = 0;
	let pos = 0;
	const u8 = () => {
		if (pos >= bytes.length) throw bad();
		return bytes[pos++];
	};
	const u16 = () => u8() | (u8() << 8);
	/** Concatenated data sub-blocks (each length-prefixed, ended by a 0 length). */
	const subBlocks = (keep: boolean): Uint8Array => {
		const parts: Uint8Array[] = [];
		let total = 0;
		for (let n = u8(); n !== 0; n = u8()) {
			if (pos + n > bytes.length) throw bad();
			if (keep) parts.push(bytes.subarray(pos, pos + n));
			total += n;
			pos += n;
		}
		if (!keep) return new Uint8Array(0);
		const out = new Uint8Array(total);
		let o = 0;
		for (const p of parts) { out.set(p, o); o += p.length; }
		return out;
	};
	const palette = (size: number): Uint8Array => {
		if (pos + size * 3 > bytes.length) throw bad();
		const p = bytes.slice(pos, pos + size * 3);
		pos += size * 3;
		return p;
	};

	const sig = String.fromCharCode(...bytes.subarray(0, 6));
	if (sig !== "GIF87a" && sig !== "GIF89a") throw bad();
	pos = 6;
	const width = u16();
	const height = u16();
	const screen = u8();
	pos += 2; // background index, aspect ratio
	if (width === 0 || height === 0 || width * height > MAX_GIF_PIXELS) throw bad();
	const globalPalette = screen & 0x80 ? palette(2 << (screen & 7)) : null;

	const canvas = new Uint8ClampedArray(width * height * 4); // transparent start, as browsers do
	let totalFrames = 0;
	// graphic control extension for the next image
	let disposal = 0, delayCs = 0, transparent = -1;
	// what the previous frame asked to be done before the next one is drawn
	let pending: { disposal: number; x: number; y: number; w: number; h: number; saved: Uint8ClampedArray | null } | null = null;

	for (;;) {
		const block = pos < bytes.length ? u8() : 0x3b; // a truncated file ends like a trailer
		if (block === 0x3b) break;
		if (block === 0x21) {
			const label = u8();
			if (label === 0xf9) {
				const data = subBlocks(true);
				if (data.length >= 4) {
					disposal = (data[0] >> 2) & 7;
					delayCs = data[1] | (data[2] << 8);
					transparent = data[0] & 1 ? data[3] : -1;
				}
			} else {
				subBlocks(false);
			}
			continue;
		}
		if (block !== 0x2c) throw bad();

		const x = u16(), y = u16(), w = u16(), h = u16();
		const flags = u8();
		const localPalette = flags & 0x80 ? palette(2 << (flags & 7)) : null;
		const minCodeSize = u8();
		totalFrames++;
		if (w * h > MAX_GIF_PIXELS) throw bad();
		const decode = decoded < maxFrames;
		const data = subBlocks(decode);
		if (decode) {
			const colors = localPalette ?? globalPalette;
			// the spec caps it at 8, which keeps every literal a byte (< 256)
			if (!colors || minCodeSize < 2 || minCodeSize > 8) throw bad();
			// undo the previous frame per its disposal
			if (pending?.disposal === 2) clearRect(canvas, width, height, pending);
			else if (pending?.disposal === 3 && pending.saved) canvas.set(pending.saved);
			const saved = disposal === 3 ? canvas.slice() : null;

			// a 0×0 image draws nothing but still takes its time, as in browsers
			const indices = w * h > 0 ? lzw(minCodeSize, data, w * h) : new Uint8Array(0);
			const rows = flags & 0x40 ? interlacedRows(h) : null;
			for (let r = 0; r < h; r++) {
				const cy = y + (rows ? rows[r] : r);
				if (cy >= height) continue;
				for (let c = 0; c < w; c++) {
					const cx = x + c;
					if (cx >= width) break;
					const idx = indices[r * w + c];
					if (idx === transparent) continue;
					if (idx * 3 + 2 >= colors.length) throw bad(); // index past the palette
					const o = (cy * width + cx) * 4;
					canvas[o] = colors[idx * 3];
					canvas[o + 1] = colors[idx * 3 + 1];
					canvas[o + 2] = colors[idx * 3 + 2];
					canvas[o + 3] = 255;
				}
			}
			pending = { disposal, x, y, w, h, saved };
			decoded++;
			yield { image: { width, height, data: canvas.slice() }, delayMs: delayCs <= 1 ? 100 : delayCs * 10 };
		}
		disposal = 0; delayCs = 0; transparent = -1; // a GCE applies to one image only
	}
	if (totalFrames === 0) throw bad();
	return { width, height, totalFrames };
}

function clearRect(canvas: Uint8ClampedArray, width: number, height: number, r: { x: number; y: number; w: number; h: number }) {
	for (let y = r.y; y < Math.min(height, r.y + r.h); y++) {
		const start = (y * width + r.x) * 4;
		const end = (y * width + Math.min(width, r.x + r.w)) * 4;
		if (end > start) canvas.fill(0, start, end);
	}
}

/** Row `i` of an interlaced image lands on output row `rows[i]` (passes of 8/8/4/2 starting at 0/4/2/1). */
function interlacedRows(h: number): Int32Array {
	const rows = new Int32Array(h);
	let i = 0;
	for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows[i++] = y;
	return rows;
}

/** GIF variable-length LZW. Stops at `count` pixels; a stream that ends early or holds an impossible code is corrupt. */
export function lzw(minCodeSize: number, data: Uint8Array, count: number): Uint8Array {
	const out = new Uint8Array(count);
	const clear = 1 << minCodeSize;
	const end = clear + 1;
	const prefix = new Int16Array(4096);
	const suffix = new Uint8Array(4096);
	const stack = new Uint8Array(4097);
	for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; }

	let size = minCodeSize + 1;
	let next = end + 1;
	let prev = -1;
	let first = 0;
	let acc = 0, bits = 0, pos = 0, op = 0;
	while (op < count) {
		while (bits < size) {
			if (pos >= data.length) throw bad(); // ran out before the image was full
			acc |= data[pos++] << bits;
			bits += 8;
		}
		const code = acc & ((1 << size) - 1);
		acc >>>= size;
		bits -= size;
		if (code === clear) { size = minCodeSize + 1; next = end + 1; prev = -1; continue; }
		if (code === end) throw bad(); // end code before the image was full
		if (prev === -1) {
			if (code >= clear) throw bad(); // must start with a literal
			out[op++] = code;
			prev = first = code;
			continue;
		}
		if (code > next) throw bad();
		let sp = 0;
		let cur = code;
		if (code === next) { stack[sp++] = first; cur = prev; } // the KwKwK case: prev's string + its first byte
		while (cur >= clear) { stack[sp++] = suffix[cur]; cur = prefix[cur]; }
		stack[sp++] = cur;
		first = cur;
		while (sp > 0 && op < count) out[op++] = stack[--sp];
		if (next < 4096) {
			prefix[next] = prev;
			suffix[next] = first;
			next++;
			if (next === 1 << size && size < 12) size++;
		}
		prev = code;
	}
	return out;
}
