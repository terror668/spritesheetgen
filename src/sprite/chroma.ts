import { createImage } from "./image";
import type { RGB, RGBAImage } from "./types";

/**
 * Guess the background colour by taking the most common (coarsely quantised)
 * colour along the image border. Generated frames are asked to use a flat
 * key colour, so the border is almost entirely background.
 */
export function detectBorderColor(img: RGBAImage, bucket = 16): RGB {
	const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
	const visit = (x: number, y: number) => {
		const i = (y * img.width + x) * 4;
		if (img.data[i + 3] < 128) return;
		const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
		const key = (Math.floor(r / bucket) << 16) | (Math.floor(g / bucket) << 8) | Math.floor(b / bucket);
		const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
		c.n++; c.r += r; c.g += g; c.b += b;
		counts.set(key, c);
	};
	for (let x = 0; x < img.width; x++) {
		visit(x, 0);
		if (img.height > 1) visit(x, img.height - 1);
	}
	for (let y = 1; y < img.height - 1; y++) {
		visit(0, y);
		if (img.width > 1) visit(img.width - 1, y);
	}
	let best: { n: number; r: number; g: number; b: number } | undefined;
	for (const c of counts.values()) if (!best || c.n > best.n) best = c;
	if (!best) return [0, 255, 0];
	return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

export interface ChromaKeyOptions {
	/** Colour to remove. Defaults to the detected border colour. */
	key?: RGB;
	/** Distance (0..441) at or below which a pixel is fully transparent. */
	tolerance?: number;
	/** Extra distance over which alpha ramps from 0 to 255 (soft edge). */
	softness?: number;
	/** Remove the key colour that bleeds into semi-transparent edge pixels. */
	despill?: boolean;
	/**
	 * Extra pass over pixels that touch the transparent area: anything closer
	 * than this distance to the key is un-mixed or removed. Fixes the coloured
	 * outline left by video chroma subsampling (H.264 4:2:0 smears the
	 * background colour 1–2 px into the character). 0 disables it.
	 */
	fringe?: number;
	/**
	 * How readily an edge pixel is treated as a real colour instead of fringe.
	 * One frame cannot tell a smeared edge from an outline whose colour happens
	 * to lie between the key and the body, so this is a trade-off:
	 *  - "strong" (default): cleanest edges on compressed AI video; some
	 *    in-between outline colours get thinned.
	 *  - "gentle": keeps more outline colours; leaves more fringe on video/GIF.
	 */
	edgeCleanup?: EdgeCleanup;
}

export type EdgeCleanup = "strong" | "gentle";

/** Thresholds per mode — see the YCbCr note below. Tuned on synthetic H.264 + GIF fixtures and an outline sweep. */
const EDGE_MODES: Record<EdgeCleanup, { residualRatio: number; disagreement: number }> = {
	strong: { residualRatio: 0.5, disagreement: 0.7 },
	gentle: { residualRatio: 0.35, disagreement: 0.6 },
};

/**
 * Remove a flat background colour.
 *
 * Edge pixels are treated as a mix of foreground and key colour:
 *   observed = a * fg + (1 - a) * key   →   fg = (observed - (1 - a) * key) / a
 * Solving for `fg` ("unmixing") removes the green/magenta halo that a naive
 * threshold leaves around the character.
 */
export function chromaKey(img: RGBAImage, opts: ChromaKeyOptions = {}): RGBAImage {
	const key = opts.key ?? detectBorderColor(img);
	const tolerance = opts.tolerance ?? 60;
	const softness = Math.max(0, opts.softness ?? 40);
	const despill = opts.despill ?? true;
	const out = createImage(img.width, img.height);
	const [kr, kg, kb] = key;

	for (let i = 0; i < img.data.length; i += 4) {
		const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2], a0 = img.data[i + 3];
		const d = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2);
		let alpha: number;
		if (d <= tolerance) alpha = 0;
		else if (softness === 0 || d >= tolerance + softness) alpha = 1;
		else alpha = (d - tolerance) / softness;

		if (alpha === 0) continue; // fully keyed out, leave transparent black

		let or = r, og = g, ob = b;
		if (despill && alpha < 1) {
			or = (r - (1 - alpha) * kr) / alpha;
			og = (g - (1 - alpha) * kg) / alpha;
			ob = (b - (1 - alpha) * kb) / alpha;
		}
		out.data[i] = or;
		out.data[i + 1] = og;
		out.data[i + 2] = ob;
		out.data[i + 3] = Math.round(alpha * a0);
	}
	const fringe = opts.fringe ?? 170;
	if (fringe > tolerance) defringe(out, img, key, tolerance, softness, fringe, EDGE_MODES[opts.edgeCleanup ?? "strong"]);
	return out;
}

/**
 * The fringe test works in YCbCr because H.264/VP9 4:2:0 video keeps luma at
 * full resolution and only smears chroma. A smeared edge pixel therefore has
 * chroma on the key→foreground line, and luma between the two. A real outline
 * breaks at least one of these: a white or pale-pink line around a dark body
 * is brighter than both; a red line around a black body has off-line chroma.
 */
/** Within `fringe` of the key, chroma must miss the line by this much to count as real. */
const MIN_NEAR_KEY_RESIDUAL = 40;
/** Luma slack (0–255) around the [key, foreground] range still counted as a blend. */
const LUMA_SLACK = 24;
/** Chroma coverage at or above this means "already the foreground's colour". */
const CHROMA_MATCHES_FOREGROUND = 0.9;
/** Chroma distance between key and foreground needed before chroma coverage is trusted. */
const MIN_CHROMA_GAP = 16;
/** Below this luma gap, coverage comes from chroma instead (luma is ill-conditioned). */
const MIN_LUMA_GAP = 32;

function ycc(r: number, g: number, b: number): [number, number, number] {
	return [
		0.299 * r + 0.587 * g + 0.114 * b,
		-0.168736 * r - 0.331264 * g + 0.5 * b,
		0.5 * r - 0.418688 * g - 0.081312 * b,
	];
}

/** Rings (in px from the keyed-out area) that the smear can reach. */
const FRINGE_DEPTH = 2;
/** How far to look for the clean interior colour. */
const REF_RADIUS = 3;

/**
 * Distance (4-neighbour steps, capped) of each pixel from the nearest fully
 * transparent pixel. 0 = transparent.
 */
function depthMap(img: RGBAImage, cap: number): Uint8Array {
	const { width: w, height: h } = img;
	const depth = new Uint8Array(w * h).fill(cap);
	let frontier: number[] = [];
	for (let p = 0; p < w * h; p++) if (img.data[p * 4 + 3] === 0) { depth[p] = 0; frontier.push(p); }
	for (let d = 1; d < cap && frontier.length; d++) {
		const next: number[] = [];
		for (const p of frontier) {
			const x = p % w;
			const ns = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
			for (const q of ns) if (q >= 0 && q < w * h && depth[q] > d) { depth[q] = d; next.push(q); }
		}
		frontier = next;
	}
	return depth;
}

/**
 * Un-mix the pixels within FRINGE_DEPTH of the keyed-out area.
 *
 * Each pixel is modelled as a blend of the key colour K and the clean colour F
 * of the character further inside:  P = a·F + (1 − a)·K. It is kept untouched
 * when it cannot be such a blend (see the YCbCr note above); otherwise it gets
 * F's colour and coverage `a` from luma (or chroma when luma can't tell K and
 * F apart). Plain distance-to-key would fail for dark outlines: dark grey +
 * magenta = dark purple, "far" from magenta yet clearly a blend.
 *
 * F is averaged from the *deepest* opaque pixels nearby. Taking any opaque
 * neighbour lets the second smeared ring leak into F and leaves a purple rim.
 *
 * Known limit: a real colour that sits on the K→F line (e.g. purple details
 * next to a magenta key) is indistinguishable from a blend in one frame — pick
 * a key colour the character does not use.
 */
function defringe(
	out: RGBAImage, src: RGBAImage, key: RGB, tolerance: number, softness: number, fringe: number,
	/** residualRatio: chroma share off the key→foreground line above which a pixel is a real colour.
	 *  disagreement: largest |luma coverage − chroma coverage| still counted as a (smeared) blend. */
	mode: { residualRatio: number; disagreement: number },
): void {
	const { width: w, height: h } = out;
	const [kr, kg, kb] = key;
	const [yk, bk, rk] = ycc(kr, kg, kb);
	const depth = depthMap(out, FRINGE_DEPTH + REF_RADIUS + 1);
	const updates: Array<[number, number, number, number, number]> = [];
	for (let p = 0; p < w * h; p++) {
		const dp = depth[p];
		if (dp === 0 || dp > FRINGE_DEPTH) continue;
		const i = p * 4;
		const r = src.data[i], g = src.data[i + 1], b = src.data[i + 2];
		const x = p % w, y = (p / w) | 0;

		// reference colour: the deepest opaque pixels within REF_RADIUS
		const x0 = Math.max(0, x - REF_RADIUS), x1 = Math.min(w - 1, x + REF_RADIUS);
		const y0 = Math.max(0, y - REF_RADIUS), y1 = Math.min(h - 1, y + REF_RADIUS);
		let best = dp;
		for (let yy = y0; yy <= y1; yy++)
			for (let xx = x0; xx <= x1; xx++) {
				const q = yy * w + xx;
				if (depth[q] > best && out.data[q * 4 + 3] === 255) best = depth[q];
			}
		let fr = 0, fg = 0, fb = 0, n = 0;
		if (best > dp) {
			for (let yy = y0; yy <= y1; yy++)
				for (let xx = x0; xx <= x1; xx++) {
					const q = yy * w + xx;
					if (depth[q] !== best || out.data[q * 4 + 3] !== 255) continue;
					fr += out.data[q * 4]; fg += out.data[q * 4 + 1]; fb += out.data[q * 4 + 2]; n++;
				}
		}

		const offset = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2);
		let a: number, cr: number, cg: number, cb: number;
		/** how far the colour already is from the key towards the clean colour (1 = clean) */
		let colourT: number;
		if (n > 0) {
			fr /= n; fg /= n; fb /= n;
			const [yp, bp, rp] = ycc(r, g, b);
			const [yf, bf, rf] = ycc(fr, fg, fb);
			// Inside the key's own soft ramp a pixel is too close to the key to be
			// trusted as a real outline (GIF dither and palette noise live here).
			const nearKey = offset < tolerance + softness;
			// luma outside the key↔foreground range: not a blend of the two
			if (!nearKey && (yp < Math.min(yk, yf) - LUMA_SLACK || yp > Math.max(yk, yf) + LUMA_SLACK)) continue;
			// chroma: project onto the key→foreground segment, measure what is left over
			const ub = bf - bk, ur = rf - rk, uu = ub * ub + ur * ur;
			const pb = bp - bk, pr = rp - rk;
			const t = uu < 1 ? 0 : Math.min(1, Math.max(0, (pb * ub + pr * ur) / uu));
			const chromaOffset = Math.hypot(pb, pr);
			const chromaResidual = Math.hypot(pb - t * ub, pr - t * ur);
			// off the line = a real colour. Near the key (palette/dither noise in
			// GIFs) a small absolute miss is not enough evidence on its own.
			const offLine = chromaOffset > 4 && chromaResidual / chromaOffset > mode.residualRatio;
			if (!nearKey && offLine && (offset >= fringe || chromaResidual > MIN_NEAR_KEY_RESIDUAL)) continue;
			// Chroma already matches the clean colour: the pixel carries no key cast,
			// so there is no fringe to remove. Its luma difference is real detail
			// (a grey outline round a black body, shading) — keep it as is.
			if (!nearKey && uu >= MIN_CHROMA_GAP ** 2 && t >= CHROMA_MATCHES_FOREGROUND) continue;
			// Luma and chroma must tell roughly the same coverage story. 4:2:0 smear
			// can make them disagree by up to ~0.75 (one pixel of a 2×2 chroma block);
			// a grey line around a black body on magenta disagrees completely
			// (luma says "background", chroma says "body") — that is a real colour.
			const lumaT = Math.abs(yf - yk) >= MIN_LUMA_GAP ? Math.min(1, Math.max(0, (yp - yk) / (yf - yk))) : t;
			if (!nearKey && uu >= MIN_CHROMA_GAP ** 2 && Math.abs(lumaT - t) > mode.disagreement) continue;
			// coverage: luma is full-resolution in 4:2:0 video, so trust it when it can tell K and F apart
			if (Math.abs(yf - yk) >= MIN_LUMA_GAP) a = lumaT;
			else if (nearKey && offLine) a = 0; // noise next to the key with no usable signal: drop it
			else if (uu >= 1) a = t;
			else continue; // foreground looks like the key in every channel: leave it alone
			colourT = t;
			cr = fr; cg = fg; cb = fb;
		} else {
			// thin feature with no clean interior: fall back to distance from the key
			if (dp > 1 || offset >= fringe) continue;
			a = Math.max(0, (offset - tolerance) / (fringe - tolerance));
			cr = a > 0 ? (r - (1 - a) * kr) / a : r;
			cg = a > 0 ? (g - (1 - a) * kg) / a : g;
			cb = a > 0 ? (b - (1 - a) * kb) / a : b;
			colourT = a;
		}
		// fully covered and already the clean colour: nothing to fix. (A pixel can be
		// fully covered by luma yet still carry the key's chroma — fix its colour.)
		if (a > 0.97 && colourT > 0.9) continue;
		const alpha = a < 0.2 ? 0 : a > 0.97 ? out.data[i + 3] : Math.min(out.data[i + 3], Math.round(a * src.data[i + 3]));
		updates.push([i, cr, cg, cb, alpha]);
	}
	// apply after scanning so references are not affected by this pass
	for (const [i, cr, cg, cb, alpha] of updates) {
		out.data[i] = cr; out.data[i + 1] = cg; out.data[i + 2] = cb; out.data[i + 3] = alpha;
	}
}

/**
 * Drop isolated specks: any opaque pixel with fewer than `minNeighbors` opaque
 * 8-neighbours becomes transparent. Cheap cleanup for video compression noise
 * that survives the chroma key.
 */
export function removeSpecks(img: RGBAImage, minNeighbors = 2, alphaThreshold = 8): RGBAImage {
	const out = createImage(img.width, img.height);
	out.data.set(img.data);
	const opaque = (x: number, y: number) =>
		x >= 0 && y >= 0 && x < img.width && y < img.height &&
		img.data[(y * img.width + x) * 4 + 3] > alphaThreshold;
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			if (!opaque(x, y)) continue;
			let n = 0;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++)
					if ((dx || dy) && opaque(x + dx, y + dy)) n++;
			if (n < minNeighbors) out.data[(y * img.width + x) * 4 + 3] = 0;
		}
	}
	return out;
}
