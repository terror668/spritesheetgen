import type { BBox, RGBAImage } from "./types";

export const EMPTY_BBOX: BBox = { x: 0, y: 0, w: 0, h: 0 };

/** Tight bounding box of pixels whose alpha is above `alphaThreshold`. */
export function alphaBBox(img: RGBAImage, alphaThreshold = 8): BBox {
	let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			if (img.data[(y * img.width + x) * 4 + 3] > alphaThreshold) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) return { ...EMPTY_BBOX };
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function isEmptyBBox(b: BBox): boolean {
	return b.w <= 0 || b.h <= 0;
}

export function unionBBox(boxes: BBox[]): BBox {
	const valid = boxes.filter((b) => !isEmptyBBox(b));
	if (valid.length === 0) return { ...EMPTY_BBOX };
	const x0 = Math.min(...valid.map((b) => b.x));
	const y0 = Math.min(...valid.map((b) => b.y));
	const x1 = Math.max(...valid.map((b) => b.x + b.w));
	const y1 = Math.max(...valid.map((b) => b.y + b.h));
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
