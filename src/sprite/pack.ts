import { blit, createImage } from "./image";
import type { FrameRect, PackedSheet, Point, RGBAImage } from "./types";

export interface PackOptions {
	/** Columns in the grid. Defaults to all frames in one row (a strip). */
	columns?: number;
	/** Transparent gap between cells (some engines bleed without it). */
	spacing?: number;
	/** Frame name prefix, e.g. "walk" → walk_00, walk_01 … */
	name?: string;
}

/** Same sheet with frames renamed `${name}_00…` (naming is cheap; no repacking). */
export function renameFrames(sheet: PackedSheet, name: string): PackedSheet {
	const pad = Math.max(2, String(sheet.frames.length - 1).length);
	return { ...sheet, frames: sheet.frames.map((f, i) => ({ ...f, name: `${name}_${String(i).padStart(pad, "0")}` })) };
}

/** Pack equally sized frames into a grid sheet. */
export function packGrid(frames: RGBAImage[], opts: PackOptions = {}): PackedSheet {
	if (frames.length === 0) throw new Error("packGrid: no frames");
	const cw = frames[0].width, ch = frames[0].height;
	for (const f of frames) {
		if (f.width !== cw || f.height !== ch) throw new Error("packGrid: frames must share one size (run alignFrames first)");
	}
	const columns = Math.max(1, Math.min(opts.columns ?? frames.length, frames.length));
	const rows = Math.ceil(frames.length / columns);
	const spacing = Math.max(0, opts.spacing ?? 0);
	const width = columns * cw + (columns - 1) * spacing;
	const height = rows * ch + (rows - 1) * spacing;
	const image = createImage(width, height);
	const prefix = opts.name ?? "frame";
	const pad = Math.max(2, String(frames.length - 1).length);

	const rects: FrameRect[] = frames.map((f, i) => {
		const x = (i % columns) * (cw + spacing);
		const y = Math.floor(i / columns) * (ch + spacing);
		blit(image, f, x, y);
		return { name: `${prefix}_${String(i).padStart(pad, "0")}`, x, y, w: cw, h: ch };
	});

	return { image, frames: rects, cellWidth: cw, cellHeight: ch, columns, rows };
}

export interface AtlasMeta {
	/** File name of the PNG the atlas points to. */
	imageName: string;
	animationName: string;
	fps: number;
	loop: boolean;
	/** Pivot inside a cell in pixels (from alignFrames). */
	pivot?: Point;
}

/**
 * TexturePacker "JSON Hash" format. Loads directly in Phaser
 * (`this.load.atlas`), PixiJS and most JS engines; Unity importers accept it too.
 * The extra `animations` block is ignored by loaders that don't know it.
 */
export function toTexturePackerJSON(sheet: PackedSheet, meta: AtlasMeta): string {
	const pivot = meta.pivot
		? { x: +(meta.pivot.x / sheet.cellWidth).toFixed(4), y: +(meta.pivot.y / sheet.cellHeight).toFixed(4) }
		: { x: 0.5, y: 1 };
	const frames: Record<string, unknown> = {};
	for (const r of sheet.frames) {
		frames[r.name] = {
			frame: { x: r.x, y: r.y, w: r.w, h: r.h },
			rotated: false,
			trimmed: false,
			spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
			sourceSize: { w: r.w, h: r.h },
			pivot,
			duration: Math.round(1000 / meta.fps),
		};
	}
	return JSON.stringify(
		{
			frames,
			animations: { [meta.animationName]: sheet.frames.map((r) => r.name) },
			meta: {
				app: "sprite-studio",
				version: "1.0",
				image: meta.imageName,
				format: "RGBA8888",
				size: { w: sheet.image.width, h: sheet.image.height },
				scale: "1",
				frameRate: meta.fps,
				loop: meta.loop,
			},
		},
		null,
		2,
	);
}

/** Godot 4 SpriteFrames resource (.tres) referencing the sheet as AtlasTextures. */
export function toGodotSpriteFrames(sheet: PackedSheet, meta: AtlasMeta & { resPath?: string }): string {
	// relative path: Godot resolves it next to the .tres, wherever the ZIP is unpacked
	const texPath = meta.resPath ?? meta.imageName;
	const lines: string[] = [];
	lines.push(`[gd_resource type="SpriteFrames" load_steps=${sheet.frames.length + 2} format=3]`, "");
	lines.push(`[ext_resource type="Texture2D" path="${texPath}" id="1_sheet"]`, "");
	sheet.frames.forEach((r, i) => {
		lines.push(`[sub_resource type="AtlasTexture" id="AtlasTexture_${i}"]`);
		lines.push(`atlas = ExtResource("1_sheet")`);
		lines.push(`region = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})`, "");
	});
	const frameEntries = sheet.frames
		.map((_, i) => `{\n"duration": 1.0,\n"texture": SubResource("AtlasTexture_${i}")\n}`)
		.join(", ");
	lines.push("[resource]");
	lines.push(
		`animations = [{\n"frames": [${frameEntries}],\n"loop": ${meta.loop},\n"name": &"${meta.animationName}",\n"speed": ${meta.fps.toFixed(1)}\n}]`,
	);
	return lines.join("\n") + "\n";
}
