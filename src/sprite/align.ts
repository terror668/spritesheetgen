import { alphaBBox, isEmptyBBox } from "./bbox";
import { blit, createImage, crop } from "./image";
import type { BBox, Point, RGBAImage } from "./types";

/**
 * Pick the point of a frame that should stay fixed across the whole animation.
 *
 * Game engines draw every frame at the same position, so if this point drifts
 * between frames the character visibly "wobbles" or slides. Vertically it is
 * where the feet touch the ground (the bottom of the silhouette).
 *
 * Horizontally it is the body's middle: each row's centre, then the median
 * of those over the rows. A sword, an axe or a cape reaching out covers only
 * some rows, so it moves the median little or not at all, while the bounding
 * box's middle jumps toward it and the character appears to slide backwards.
 * Legs swinging both ways in a walk keep their rows' centres near the hips.
 * `img` is the keyed (transparent-background) frame, `bbox` its tight bounds.
 */
export function bodyAnchor(img: RGBAImage, bbox: BBox, alphaThreshold = 8): Point {
	const centres: number[] = [];
	for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
		let sum = 0, n = 0;
		for (let x = bbox.x; x < bbox.x + bbox.w; x++) {
			if (img.data[(y * img.width + x) * 4 + 3] > alphaThreshold) { sum += x + 0.5; n++; }
		}
		if (n) centres.push(sum / n);
	}
	centres.sort((p, q) => p - q);
	const m = centres.length >> 1;
	const x = centres.length === 0 ? bbox.x + bbox.w / 2 : centres.length % 2 ? centres[m] : (centres[m - 1] + centres[m]) / 2;
	return { x, y: bbox.y + bbox.h };
}

/** The bounding box's bottom-centre (the default): fine while the outline keeps its width; a weapon reaching out pulls it along. */
export function bboxAnchor(_img: RGBAImage, bbox: BBox): Point {
	return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h };
}

export interface AlignOptions {
	/** Transparent margin around the content in every cell. */
	padding?: number;
	alphaThreshold?: number;
	/** Override the anchor function (e.g. for tests or per-animation presets). */
	anchorFn?: (img: RGBAImage, bbox: BBox) => Point;
}

export interface AlignedFrames {
	frames: RGBAImage[];
	cellWidth: number;
	cellHeight: number;
	/** Where the anchor sits inside every cell — export this as the pivot. */
	pivot: Point;
}

/**
 * Crop each frame to its content and place all of them in equally sized cells
 * so that their anchors coincide. Empty frames become empty cells.
 */
export function alignFrames(input: RGBAImage[], opts: AlignOptions = {}): AlignedFrames {
	const padding = opts.padding ?? 2;
	const alphaThreshold = opts.alphaThreshold ?? 8;

	const info = input.map((img) => {
		const bbox = alphaBBox(img, alphaThreshold);
		if (isEmptyBBox(bbox)) return { img, bbox, anchor: { x: 0, y: 0 } };
		const a = opts.anchorFn ? opts.anchorFn(img, bbox) : bboxAnchor(img, bbox);
		return { img, bbox, anchor: { x: Math.round(a.x), y: Math.round(a.y) } };
	});

	let left = 0, right = 0, top = 0, bottom = 0;
	for (const { bbox, anchor } of info) {
		if (isEmptyBBox(bbox)) continue;
		left = Math.max(left, anchor.x - bbox.x);
		right = Math.max(right, bbox.x + bbox.w - anchor.x);
		top = Math.max(top, anchor.y - bbox.y);
		bottom = Math.max(bottom, bbox.y + bbox.h - anchor.y);
	}

	const cellWidth = Math.max(1, left + right + padding * 2);
	const cellHeight = Math.max(1, top + bottom + padding * 2);
	const pivot = { x: padding + left, y: padding + top };

	const frames = info.map(({ img, bbox, anchor }) => {
		const cell = createImage(cellWidth, cellHeight);
		if (isEmptyBBox(bbox)) return cell;
		const content = crop(img, bbox);
		blit(cell, content, pivot.x - (anchor.x - bbox.x), pivot.y - (anchor.y - bbox.y));
		return cell;
	});

	return { frames, cellWidth, cellHeight, pivot };
}
