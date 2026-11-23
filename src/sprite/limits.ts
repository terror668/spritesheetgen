export function fitSize(w: number, h: number, maxSide: number): [number, number] {
	if (Math.max(w, h) <= maxSide) return [w, h];
	const s = maxSide / Math.max(w, h);
	return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/**
 * Upper bound on decoded pixels held in memory (4 bytes each). 40M px ≈ 160 MB
 * for the source frames; processing roughly doubles that at peak.
 */
export const MAX_DECODED_PIXELS = 40_000_000;

export function frameBudget(w: number, h: number, maxFrames: number, maxPixels: number): number {
	return Math.max(1, Math.min(maxFrames, Math.floor(maxPixels / Math.max(1, w * h))));
}

