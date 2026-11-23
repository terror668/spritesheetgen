import { createImage, downscaleArea } from "./image";
import type { RGB, RGBAImage } from "./types";

const hex = (s: string): RGB => {
	const n = parseInt(s.replace("#", ""), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Well-known retro palettes. Keys are stable ids used in URLs / presets. */
export const PALETTES: Record<string, { label: string; colors: RGB[] }> = {
	gameboy: {
		label: "Game Boy (4)",
		colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"].map(hex),
	},
	pico8: {
		label: "PICO-8 (16)",
		colors: [
			"#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
			"#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa",
		].map(hex),
	},
	endesga32: {
		label: "Endesga 32",
		colors: [
			"#be4a2f", "#d77643", "#ead4aa", "#e4a672", "#b86f50", "#733e39", "#3e2731", "#a22633",
			"#e43b44", "#f77622", "#feae34", "#fee761", "#63c74d", "#3e8948", "#265c42", "#193c3e",
			"#124e89", "#0099db", "#2ce8f5", "#ffffff", "#c0cbdc", "#8b9bb4", "#5a6988", "#3a4466",
			"#262b44", "#181425", "#ff0044", "#68386c", "#b55088", "#f6757a", "#e8b796", "#c28569",
		].map(hex),
	},
};

/**
 * Build an adaptive palette with median cut over the opaque pixels.
 * Good default when the user has no preferred retro palette: keeps the
 * character's own colours while capping the count like real pixel art.
 */
export function medianCutPalette(img: RGBAImage, size: number, alphaThreshold = 128): RGB[] {
	const pixels: RGB[] = [];
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] >= alphaThreshold) pixels.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
	}
	if (pixels.length === 0 || size <= 0) return [];

	let boxes: RGB[][] = [pixels];
	while (boxes.length < size) {
		// split the box with the widest channel range
		let bestIdx = -1, bestRange = 0, bestCh = 0;
		boxes.forEach((box, idx) => {
			if (box.length < 2) return;
			for (let ch = 0; ch < 3; ch++) {
				let lo = 255, hi = 0;
				for (const p of box) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; }
				if (hi - lo > bestRange) { bestRange = hi - lo; bestIdx = idx; bestCh = ch; }
			}
		});
		if (bestIdx < 0 || bestRange === 0) break;
		const box = boxes[bestIdx].slice().sort((a, b) => a[bestCh] - b[bestCh]);
		const mid = box.length >> 1;
		boxes = [...boxes.slice(0, bestIdx), box.slice(0, mid), box.slice(mid), ...boxes.slice(bestIdx + 1)];
	}

	return boxes.map((box) => {
		const s = box.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
		return [Math.round(s[0] / box.length), Math.round(s[1] / box.length), Math.round(s[2] / box.length)] as RGB;
	});
}

/** Perceptually weighted squared RGB distance ("redmean"); cheap and better than plain RGB. */
function colorDist(r1: number, g1: number, b1: number, c: RGB): number {
	const rm = (r1 + c[0]) / 2;
	const dr = r1 - c[0], dg = g1 - c[1], db = b1 - c[2];
	return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/**
 * Snap every pixel to the nearest palette colour and binarise alpha
 * (pixel art has no semi-transparency).
 */
export function quantize(img: RGBAImage, palette: RGB[], alphaThreshold = 128): RGBAImage {
	const out = createImage(img.width, img.height);
	if (palette.length === 0) return out;
	const cache = new Map<number, RGB>();
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] < alphaThreshold) continue;
		const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
		const k = (r << 16) | (g << 8) | b;
		let best = cache.get(k);
		if (!best) {
			let bd = Infinity;
			for (const c of palette) {
				const d = colorDist(r, g, b, c);
				if (d < bd) { bd = d; best = c; }
			}
			cache.set(k, best!);
		}
		out.data[i] = best![0];
		out.data[i + 1] = best![1];
		out.data[i + 2] = best![2];
		out.data[i + 3] = 255;
	}
	return out;
}

export interface PixelateOptions {
	/** Target height of the content in pixels (e.g. 32, 48, 64). Width keeps aspect. */
	targetHeight: number;
	/** Preset id from PALETTES, or "auto" for median cut, or "none". */
	palette: keyof typeof PALETTES | "auto" | "none";
	/** Colour count when palette = "auto". */
	autoColors?: number;
}

/**
 * Turn smooth frames into pixel art with ONE shared palette so colours do not
 * flicker between frames. All frames must be the same size (call alignFrames first).
 */
export function pixelateFrames(frames: RGBAImage[], opts: PixelateOptions): RGBAImage[] {
	if (frames.length === 0) return [];
	const { width, height } = frames[0];
	const th = Math.max(1, Math.min(opts.targetHeight, height));
	const tw = Math.max(1, Math.round((width * th) / height));
	const small = frames.map((f) => downscaleArea(f, tw, th));

	if (opts.palette === "none") {
		return small.map((f) => {
			const out = createImage(f.width, f.height);
			for (let i = 0; i < f.data.length; i += 4) {
				if (f.data[i + 3] < 128) continue;
				out.data.set([f.data[i], f.data[i + 1], f.data[i + 2], 255], i);
			}
			return out;
		});
	}

	let palette: RGB[];
	if (opts.palette === "auto") {
		// build the palette from all frames together → consistent colours
		const all = createImage(tw, th * small.length);
		small.forEach((f, idx) => all.data.set(f.data, idx * f.data.length));
		palette = medianCutPalette(all, opts.autoColors ?? 16);
	} else {
		palette = PALETTES[opts.palette].colors;
	}
	return small.map((f) => quantize(f, palette));
}
