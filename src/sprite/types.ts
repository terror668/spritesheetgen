/**
 * Core image types for the sprite pipeline.
 *
 * RGBAImage is structurally identical to the browser's ImageData, so a real
 * ImageData can be passed anywhere an RGBAImage is expected. Keeping the
 * pipeline on this plain shape lets every step run (and be tested) in Node.
 */

export interface RGBAImage {
	width: number;
	height: number;
	/** Row-major RGBA, 4 bytes per pixel, length = width * height * 4 */
	data: Uint8ClampedArray;
}

export interface BBox {
	x: number;
	y: number;
	/** Exclusive width/height; an empty bbox has w = h = 0 */
	w: number;
	h: number;
}

export interface Point {
	x: number;
	y: number;
}

export type RGB = [number, number, number];

export interface FrameRect {
	/** Frame name used in atlas exports, e.g. "walk_00" */
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface PackedSheet {
	image: RGBAImage;
	frames: FrameRect[];
	cellWidth: number;
	cellHeight: number;
	columns: number;
	rows: number;
}
