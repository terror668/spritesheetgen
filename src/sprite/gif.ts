import { GIFEncoder, nearestColorIndex, quantize, type Palette } from "gifenc";
import type { RGBAImage } from "./types";

export interface GifOptions {
	fps: number;
	/** 0 = loop forever, -1 = play once */
	repeat?: number;
	/** Pixels with alpha below this are written as the transparent index. */
	alphaThreshold?: number;
}

/**
 * Encode equally sized frames as an animated GIF with 1-bit transparency.
 *
 * One global palette is built from the opaque pixels of ALL frames (255
 * colours) and palette slot 255 is reserved for transparency. A per-frame
 * palette would make colours shimmer between frames.
 */
export function encodeGif(frames: RGBAImage[], opts: GifOptions): Uint8Array {
	if (frames.length === 0) throw new Error("encodeGif: no frames");
	const { width, height } = frames[0];
	const threshold = opts.alphaThreshold ?? 128;

	let opaqueCount = 0;
	for (const f of frames) for (let i = 3; i < f.data.length; i += 4) if (f.data[i] >= threshold) opaqueCount++;
	const opaque = new Uint8Array(Math.max(1, opaqueCount) * 4);
	let o = 0;
	for (const f of frames) {
		for (let i = 0; i < f.data.length; i += 4) {
			if (f.data[i + 3] < threshold) continue;
			opaque[o++] = f.data[i]; opaque[o++] = f.data[i + 1]; opaque[o++] = f.data[i + 2]; opaque[o++] = 255;
		}
	}
	const palette: Palette = opaqueCount > 0 ? quantize(opaque, 255) : [[0, 0, 0]];
	const transparentIndex = palette.length;
	const fullPalette: Palette = [...palette, [0, 0, 0]];

	const gif = GIFEncoder();
	const delay = Math.round(1000 / Math.max(1, opts.fps));
	const cache = new Map<number, number>();
	frames.forEach((f, frameIdx) => {
		if (f.width !== width || f.height !== height) throw new Error("encodeGif: frames must share one size");
		const index = new Uint8Array(width * height);
		for (let p = 0, i = 0; p < index.length; p++, i += 4) {
			if (f.data[i + 3] < threshold) { index[p] = transparentIndex; continue; }
			const key = (f.data[i] << 16) | (f.data[i + 1] << 8) | f.data[i + 2];
			let idx = cache.get(key);
			if (idx === undefined) {
				idx = nearestColorIndex(palette, [f.data[i], f.data[i + 1], f.data[i + 2]]);
				cache.set(key, idx);
			}
			index[p] = idx;
		}
		gif.writeFrame(index, width, height, {
			palette: frameIdx === 0 ? fullPalette : undefined,
			delay,
			repeat: opts.repeat ?? 0,
			transparent: true,
			transparentIndex,
			dispose: 2,
		});
	});
	gif.finish();
	return gif.bytes();
}
