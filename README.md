# SpriteSheetGen

[![npm](https://img.shields.io/npm/v/@spritesheetgen/cli?label=%40spritesheetgen%2Fcli)](https://www.npmjs.com/package/@spritesheetgen/cli)

AI sprite sheet generator for 2D games, as an **MCP server** and a **CLI**. Describe a character, animate it (walk, run, idle, attack, jump), and get engine-ready files in your project folder: a sprite sheet PNG, a TexturePacker JSON atlas, a Godot 4 `SpriteFrames` resource, single frames and a GIF preview.

Website: **[spritesheetgen.com](https://spritesheetgen.com/)** · Free browser tools: [video to sprite sheet](https://spritesheetgen.com/video-to-sprite-sheet/), [GIF to sprite sheet](https://spritesheetgen.com/gif-to-sprite-sheet/), [sprite sheet maker](https://spritesheetgen.com/sprite-sheet-maker/), [cutter](https://spritesheetgen.com/sprite-sheet-cutter/), [sprite sheet to GIF](https://spritesheetgen.com/sprite-sheet-to-gif/)

<p align="center">
  <img src="docs/media/knight-walk.webp" alt="Little knight walk cycle" height="160">
  <img src="docs/media/witch-walk.webp" alt="Little witch walk cycle" height="160">
  <img src="docs/media/dragon-walk.webp" alt="Baby dragon walk cycle" height="160">
  <img src="docs/media/mech-walk.webp" alt="Combat mech walk cycle" height="160">
</p>

**Docs: [terror668.github.io/spritesheetgen](https://terror668.github.io/spritesheetgen/)**

## Quick start with an AI agent

Paste this into Claude Code, Codex or another agent with MCP:

```text
Set up SpriteSheetGen for me: follow https://spritesheetgen.com/agents/install.txt
```

The agent installs the MCP server and the agent skill. You then create an API key on <https://spritesheetgen.com/account/> and store it in **your own terminal** (it is typed hidden, never pasted into the chat):

```sh
npx -y @spritesheetgen/cli login
```

## Add the MCP server by hand

```sh
# Claude Code
claude mcp add spritesheetgen -s user -- npx -y @spritesheetgen/cli mcp

# Codex
codex mcp add spritesheetgen -- npx -y @spritesheetgen/cli mcp
```

Claude Desktop, Cursor, Windsurf and other clients that read an `mcpServers` file ([examples/mcp.json](examples/mcp.json)):

```json
{
  "mcpServers": {
    "spritesheetgen": {
      "command": "npx",
      "args": ["-y", "@spritesheetgen/cli", "mcp"]
    }
  }
}
```

Node.js 20 or newer. The server runs over stdio and reads the key saved by `login` (or `SPRITESHEETGEN_API_KEY`), so logging in later needs no restart.

## Tools

| Tool | Credits | What it does |
| --- | --- | --- |
| `estimate_sprite` | free | Price of a character or an action, your balance and the key's remaining budget |
| `improve_prompt` | free (small daily quota) | Turns a rough idea into a character description that generates well |
| `create_character` | paid | One character image from a description |
| `upload_character` | free | Uses your own PNG, JPEG or WebP character instead |
| `animate_character` | paid | One animation of a character: `walk`, `run`, `idle`, `attack` or `jump` |
| `get_generation` | free | Status and result of a generation (can wait for it) |
| `list_characters` | free | Characters you generated or uploaded |
| `list_actions` | free | Animations a character already has, so you never pay twice |
| `export_sprite_sheet` | free | Packs a finished animation (or a local GIF) into a folder on your machine |

An agent always estimates first, shows you the price and spends only after you approve it. Every paid call carries a `max_credits` cap and a `client_key`, so a retried request is never charged twice.

## API keys and spending limits

Keys are created on the [account page](https://spritesheetgen.com/account/). Each key has its own permissions and a daily and total credit cap; a new key cannot spend until you allow it. The key is stored in `~/.config/spritesheetgen/credentials` (`%APPDATA%` on Windows), readable only by you; `logout` removes it.

New accounts receive 25 credits. Current prices are on the [pricing page](https://spritesheetgen.com/pricing/); the estimate tool always returns the live price.

## CLI

The same features without MCP:

```sh
npx -y @spritesheetgen/cli --help

spritesheetgen estimate --description "a small beetle knight" --json
spritesheetgen character --description "a small beetle knight" --client-key my-unique-key-0001 --max-credits 5 --json
spritesheetgen animate --reference generation:CHARACTER_ID --action walk --client-key my-unique-key-0002 --max-credits 10 --json
spritesheetgen export --id ANIMATION_ID --out ./assets/beetle-walk --name walk --individual-frames --preview --json
```

Exporting a GIF you already have needs no key and costs nothing:

```sh
npx -y @spritesheetgen/cli export --file ./walk.gif --out ./assets/walk --name hero_walk --preview
```

## What an export contains

See [samples/little-knight-walk](samples/little-knight-walk): the knight's walk on a green screen, packed by the CLI (background removed, edges cleaned, frames aligned).

| File | Use it in |
| --- | --- |
| `sheet.png` | Any engine: frames in a row (or a grid), transparent background |
| `sheet.json` | Phaser, PixiJS and other engines that read TexturePacker JSON (hash), with an `animations` block |
| `animation.tres` | Godot 4: a `SpriteFrames` resource for `AnimatedSprite2D`, with speed and looping set |
| `preview.gif` | A quick look |
| `export.json` | The settings used, to repeat the export |
| `frames/*.png`, `frames.zip` | Unity, GameMaker or any tool that wants single images (`--individual-frames`) |

Phaser 3:

```js
this.load.atlas("knight", "sheet.png", "sheet.json");
this.anims.create({ key: "walk", frames: this.anims.generateFrameNames("knight", { prefix: "knight_walk_", end: 11, zeroPad: 2 }), frameRate: 14, repeat: -1 });
```

Godot 4: put `sheet.png` and `animation.tres` in the same folder, then drag `animation.tres` onto an `AnimatedSprite2D`'s **Sprite Frames**.

## About this repository

This repository holds the documentation, configuration examples and sample output for the `@spritesheetgen/cli` package on npm. Questions and bug reports are welcome in [issues](../../issues) or at support@spritesheetgen.com.

The contents of this repository are released under the [MIT license](LICENSE).
