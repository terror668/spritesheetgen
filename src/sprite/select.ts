import { changedCount, downscaleArea, meanAbsDiff } from "./image";
import type { RGBAImage } from "./types";

/**
 * Evenly pick `count` frames from [start, end) (end exclusive). A loop leaves
 * out the last frame (it leads back into the first); with `ends` the first and
 * last frames are both kept, as a one-off move needs its follow-through.
 */
export function sampleUniform<T>(items: T[], count: number, start = 0, end = items.length, ends = false): T[] {
	const lo = Math.max(0, start);
	const hi = Math.min(items.length, end);
	const span = hi - lo;
	if (span <= 0 || count <= 0) return [];
	if (count >= span) return items.slice(lo, hi);
	const out: T[] = [];
	if (ends && count >= 2) {
		for (let i = 0; i < count; i++) out.push(items[lo + Math.round((i * (span - 1)) / (count - 1))]);
		return out;
	}
	for (let i = 0; i < count; i++) out.push(items[lo + Math.floor((i * span) / count)]);
	return out;
}

const THUMB = 48;
function thumb(img: RGBAImage): RGBAImage {
	const scale = Math.min(1, THUMB / Math.max(img.width, img.height));
	return downscaleArea(img, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
}

/**
 * Drop frames that are nearly identical to the previously kept one.
 * Video models often hold a pose for several frames at the start/end of a
 * clip; those duplicates make a loop stutter.
 *
 * A frame counts as new when at least `minPixels` pixels changed noticeably
 * (a channel moved by 32+). The count is absolute rather than a share of the
 * frame, because a share gets diluted when a small character moves on a large
 * static background.
 *
 * The default adapts to the clip: 10% of the typical (75th-percentile) change
 * between neighbouring frames, clamped to 2–16 px. Real motion sets that
 * scale — a 4×4 sprite stepping 1px changes 8 px, a full-size walk thousands —
 * while held poses change ~0 px, so they fall below it whatever the canvas size.
 */
export function dedupeSimilar(frames: RGBAImage[], minPixels?: number): RGBAImage[] {
	if (frames.length === 0) return [];
	const min = minPixels ?? defaultMinChangedPixels(frames);
	const kept = [0];
	for (let i = 1; i < frames.length; i++) {
		if (changedCount(frames[kept[kept.length - 1]], frames[i]) >= min) kept.push(i);
	}
	return kept.map((i) => frames[i]);
}

export function defaultMinChangedPixels(frames: RGBAImage[]): number {
	const counts: number[] = [];
	for (let i = 1; i < frames.length; i++) counts.push(changedCount(frames[i - 1], frames[i]));
	if (counts.length === 0) return 2;
	counts.sort((a, b) => a - b);
	const typical = counts[Math.floor(0.75 * (counts.length - 1))];
	return Math.min(16, Math.max(2, Math.round(typical * 0.1)));
}

/**
 * Find where the motion returns closest to `frames[start]`, i.e. the natural
 * end of one cycle. Returns an exclusive end index so that
 * frames.slice(start, end) is one loop without a duplicated closing frame.
 * Only considers cycles of at least `minLength` frames.
 */
export function findLoopEnd(frames: RGBAImage[], start = 0, minLength = 4): { end: number; score: number } {
	if (frames.length - start <= minLength) return { end: frames.length, score: Infinity };
	const thumbs = frames.map(thumb);
	const ref = thumbs[start];
	let best = { end: frames.length, score: Infinity };
	for (let j = start + minLength; j < frames.length; j++) {
		const score = meanAbsDiff(ref, thumbs[j]);
		if (score < best.score) best = { end: j, score };
	}
	return best;
}
