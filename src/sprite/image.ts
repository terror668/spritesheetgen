import type { BBox, RGBAImage } from "./types";

export function createImage(width: number, height: number): RGBAImage {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
		throw new Error(`invalid image size ${width}x${height}`);
	}
	return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImage(img: RGBAImage): RGBAImage {
	return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** Copy a rectangle out of `img`. Parts outside the source become transparent. */
export function crop(img: RGBAImage, rect: BBox): RGBAImage {
	const out = createImage(rect.w, rect.h);
	for (let y = 0; y < rect.h; y++) {
		const sy = rect.y + y;
		if (sy < 0 || sy >= img.height) continue;
		for (let x = 0; x < rect.w; x++) {
			const sx = rect.x + x;
			if (sx < 0 || sx >= img.width) continue;
			const si = (sy * img.width + sx) * 4;
			const di = (y * rect.w + x) * 4;
			out.data[di] = img.data[si];
			out.data[di + 1] = img.data[si + 1];
			out.data[di + 2] = img.data[si + 2];
			out.data[di + 3] = img.data[si + 3];
		}
	}
	return out;
}

/**
 * Draw `src` onto `dst` at integer offset (dx, dy) using source-over alpha
 * compositing. Pixels falling outside `dst` are clipped.
 */
export function blit(dst: RGBAImage, src: RGBAImage, dx: number, dy: number): void {
	for (let y = 0; y < src.height; y++) {
		const ty = y + dy;
		if (ty < 0 || ty >= dst.height) continue;
		for (let x = 0; x < src.width; x++) {
			const tx = x + dx;
			if (tx < 0 || tx >= dst.width) continue;
			const si = (y * src.width + x) * 4;
			const sa = src.data[si + 3];
			if (sa === 0) continue;
			const di = (ty * dst.width + tx) * 4;
			if (sa === 255) {
				dst.data[di] = src.data[si];
				dst.data[di + 1] = src.data[si + 1];
				dst.data[di + 2] = src.data[si + 2];
				dst.data[di + 3] = 255;
				continue;
			}
			const a = sa / 255;
			const da = dst.data[di + 3] / 255;
			const outA = a + da * (1 - a);
			for (let c = 0; c < 3; c++) {
				const sc = src.data[si + c];
				const dc = dst.data[di + c];
				dst.data[di + c] = Math.round((sc * a + dc * da * (1 - a)) / outA);
			}
			dst.data[di + 3] = Math.round(outA * 255);
		}
	}
}

export function flipHorizontal(img: RGBAImage): RGBAImage {
	const out = createImage(img.width, img.height);
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			const si = (y * img.width + x) * 4;
			const di = (y * img.width + (img.width - 1 - x)) * 4;
			out.data[di] = img.data[si];
			out.data[di + 1] = img.data[si + 1];
			out.data[di + 2] = img.data[si + 2];
			out.data[di + 3] = img.data[si + 3];
		}
	}
	return out;
}

/** Nearest-neighbour resize — the only resize that keeps pixel art crisp. */
export function resizeNearest(img: RGBAImage, width: number, height: number): RGBAImage {
	const out = createImage(width, height);
	for (let y = 0; y < height; y++) {
		const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height));
		for (let x = 0; x < width; x++) {
			const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width));
			const si = (sy * img.width + sx) * 4;
			const di = (y * width + x) * 4;
			out.data[di] = img.data[si];
			out.data[di + 1] = img.data[si + 1];
			out.data[di + 2] = img.data[si + 2];
			out.data[di + 3] = img.data[si + 3];
		}
	}
	return out;
}

/**
 * Area-weighted downscale: every source pixel contributes in proportion to how
 * much of it falls inside the destination pixel (fractional coverage), with
 * colour weighted by alpha. Keeps thin outlines evenly toned at non-integer
 * scales, unlike nearest-neighbour or integer-bucket averaging.
 */
export function downscaleArea(img: RGBAImage, width: number, height: number): RGBAImage {
	const out = createImage(width, height);
	if (width === 0 || height === 0) return out;
	const sx = img.width / width;
	const sy = img.height / height;
	for (let y = 0; y < height; y++) {
		const fy0 = y * sy, fy1 = (y + 1) * sy;
		for (let x = 0; x < width; x++) {
			const fx0 = x * sx, fx1 = (x + 1) * sx;
			let r = 0, g = 0, b = 0, a = 0, area = 0;
			for (let yy = Math.floor(fy0); yy < Math.min(img.height, Math.ceil(fy1)); yy++) {
				const wy = Math.min(fy1, yy + 1) - Math.max(fy0, yy);
				if (wy <= 0) continue;
				for (let xx = Math.floor(fx0); xx < Math.min(img.width, Math.ceil(fx1)); xx++) {
					const wx = Math.min(fx1, xx + 1) - Math.max(fx0, xx);
					if (wx <= 0) continue;
					const wgt = wx * wy;
					const i = (yy * img.width + xx) * 4;
					const pa = img.data[i + 3] * wgt;
					r += img.data[i] * pa;
					g += img.data[i + 1] * pa;
					b += img.data[i + 2] * pa;
					a += pa;
					area += wgt;
				}
			}
			const di = (y * width + x) * 4;
			if (a > 0) {
				out.data[di] = Math.round(r / a);
				out.data[di + 1] = Math.round(g / a);
				out.data[di + 2] = Math.round(b / a);
			}
			out.data[di + 3] = area > 0 ? Math.round(a / area) : 0;
		}
	}
	return out;
}

/** Mean absolute per-channel difference (0..255), alpha included. */
export function meanAbsDiff(a: RGBAImage, b: RGBAImage): number {
	if (a.width !== b.width || a.height !== b.height) {
		throw new Error("meanAbsDiff: size mismatch");
	}
	let sum = 0;
	for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i] - b.data[i]);
	return a.data.length === 0 ? 0 : sum / a.data.length;
}

/**
 * Number of pixels where any channel differs by more than `pixelThreshold`.
 * An absolute count (not a fraction of the image) so a small character on a
 * large static background is not diluted away.
 */
export function changedCount(a: RGBAImage, b: RGBAImage, pixelThreshold = 32): number {
	if (a.width !== b.width || a.height !== b.height) {
		throw new Error("changedCount: size mismatch");
	}
	let changed = 0;
	for (let i = 0; i < a.data.length; i += 4) {
		if (
			Math.abs(a.data[i] - b.data[i]) > pixelThreshold ||
			Math.abs(a.data[i + 1] - b.data[i + 1]) > pixelThreshold ||
			Math.abs(a.data[i + 2] - b.data[i + 2]) > pixelThreshold ||
			Math.abs(a.data[i + 3] - b.data[i + 3]) > pixelThreshold
		) changed++;
	}
	return changed;
}

/**
 * Put frames of different sizes on one shared canvas (largest width × largest
 * height), bottom-centred, so frames drawn as separate PNGs keep their feet on
 * the same line. Frames that already share a size are returned unchanged.
 */
export function padToCommonSize(frames: RGBAImage[]): RGBAImage[] {
	if (frames.length === 0) return frames;
	const width = Math.max(...frames.map((f) => f.width));
	const height = Math.max(...frames.map((f) => f.height));
	if (frames.every((f) => f.width === width && f.height === height)) return frames;
	return frames.map((f) => {
		if (f.width === width && f.height === height) return f;
		const out = createImage(width, height);
		blit(out, f, Math.floor((width - f.width) / 2), height - f.height);
		return out;
	});
}

/**
 * How many leading frames fit in `budget` pixels once every frame is padded
 * to the largest width × height seen so far (what padToCommonSize allocates).
 * Lets the caller stop decoding before the big canvases are created.
 */
export function framesWithinBudget(sizes: { width: number; height: number }[], budget: number): number {
	let w = 0, h = 0;
	for (let i = 0; i < sizes.length; i++) {
		w = Math.max(w, sizes[i].width);
		h = Math.max(h, sizes[i].height);
		// decoded originals stay alive while padded copies are made: count both
		if ((i + 1) * w * h * 2 > budget) return i;
	}
	return sizes.length;
}
