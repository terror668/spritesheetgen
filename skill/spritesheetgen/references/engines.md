# Putting an export into a game

`export_sprite_sheet` (CLI: `spritesheetgen export`) writes a new folder:

| File | What it is |
| --- | --- |
| `sheet.png` | All frames in a grid, transparent background |
| `sheet.json` | TexturePacker JSON (hash): one rectangle per frame, named `<name>_00`, `<name>_01`, …, plus `animations.<name>` listing them in order and a pivot (feet by default) |
| `animation.tres` | Godot 4 `SpriteFrames` with one looping animation `<name>` at the export's fps, pointing at `sheet.png` next to it |
| `export.json` | `frameCount`, `fps`, `frameWidth`, `frameHeight`, `columns`, `rows`, sheet size and the settings used |
| `frames/`, `frames.zip` | Single frames (with `individual_frames`) |
| `preview.gif` | A looping preview (with `preview`) |

Pass `name` (e.g. `knight_walk`) so the animation and its frames are named
after it; the file names stay fixed. Read `export.json` for frame width, height and fps instead of guessing.
Pixel art: export with `pixel_height` and keep nearest-neighbour filtering
in the engine.

## Godot 4

1. Export into a folder inside the project on disk, e.g.
   `<project>/assets/sprites/knight_walk` (Godot then shows it as
   `res://assets/sprites/knight_walk/`).
2. Add an `AnimatedSprite2D`, set **Sprite Frames** to `animation.tres`, pick
   the animation `<name>`, enable **Autoplay** or call `play("<name>")`.
3. Pixel art: Project Settings → Rendering → Textures → Canvas Textures →
   Default Texture Filter = **Nearest** (or set the node's Texture Filter).
4. More actions of the same character: export each into its own folder, then
   either use one `AnimatedSprite2D` per action or copy the animations into
   one SpriteFrames in the editor.

## Phaser 3

```js
// preload
this.load.atlas("knight_walk", "assets/sprites/knight_walk/sheet.png", "assets/sprites/knight_walk/sheet.json");
// create
this.anims.create({
  key: "knight_walk",
  frames: this.anims.generateFrameNames("knight_walk", { prefix: "knight_walk_", start: 0, end: FRAMES - 1, zeroPad: 2 }),
  frameRate: FPS,
  repeat: -1,
});
this.add.sprite(x, y, "knight_walk").setOrigin(0.5, 1).play("knight_walk");
```

`FRAMES` and `FPS` come from `export.json` (`frameCount`, `fps`). For pixel
art set `pixelArt: true` in the game config.

## Unity

Unity does not read the JSON directly; slice the PNG by grid:

1. Copy `sheet.png` into `Assets/`. In the importer: Texture Type **Sprite
   (2D and UI)**, Sprite Mode **Multiple**, Filter Mode **Point** for pixel
   art, Compression **None**; Apply.
2. Sprite Editor → Slice → Type **Grid By Cell Size**, cell size =
   `frameWidth` × `frameHeight` from `export.json`; Slice, Apply.
3. Select the sliced sprites in order and drag them into the scene; Unity
   makes an Animation clip. Set its sample rate to the export's fps.

Check the project's own pixels-per-unit and import presets before changing
them.

## GameMaker

Create a Sprite → Import → `sheet.png` as a strip: `frameCount`, frames
per row (`columns`) and frame size (`frameWidth` × `frameHeight`) from `export.json`. Set the
sprite speed to the export's fps (frames per second) and the origin to
bottom centre to match the pivot.

## Anything else

Use `sheet.png` + `sheet.json` (most engines and tools read TexturePacker
JSON), or `frames/` for engines that want one image per frame.
