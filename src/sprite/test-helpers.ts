import { createImage } from "./image";
import type { RGB, RGBAImage } from "./types";

/** Image filled with an opaque background colour. */
export function solid(w: number, h: number, c: RGB): RGBAImage {
	const img = createImage(w, h);
	for (let i = 0; i < img.data.length; i += 4) img.data.set([c[0], c[1], c[2], 255], i);
	return img;
}

/** Paint an opaque rectangle. */
export function rect(img: RGBAImage, x: number, y: number, w: number, h: number, c: RGB): RGBAImage {
	for (let yy = y; yy < y + h; yy++)
		for (let xx = x; xx < x + w; xx++)
			img.data.set([c[0], c[1], c[2], 255], (yy * img.width + xx) * 4);
	return img;
}

export function alphaAt(img: RGBAImage, x: number, y: number): number {
	return img.data[(y * img.width + x) * 4 + 3];
}
