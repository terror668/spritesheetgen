---
name: spritesheetgen
description: Make a game character and its animations with SpriteSheetGen and drop finished sprite sheets into the game project. Use when the user wants a character, sprite, walk/run/idle/attack/jump animation or sprite sheet generated for a game (Godot, Phaser, Unity, GameMaker, web), or wants to animate a character image they already have.
---

# SpriteSheetGen

SpriteSheetGen generates a character image from a description (or takes the
user's own image) and animates it one action at a time. The animation is
packed into a sprite sheet **on this machine** by the same code the website
uses: `sheet.png`, `sheet.json` (TexturePacker), `animation.tres` (Godot),
`export.json` (what was done), optionally `frames/` + `frames.zip` and
`preview.gif`.

Generating costs the user's credits. Everything else (estimates, listing,
status, uploads, exports, prompt help) is free.

## Setup (once)

Usually done for you by the install prompt (https://spritesheetgen.com/agents/install.txt).

1. The skill: `npx -y @spritesheetgen/cli skill install --dir <your skills folder>`
   (Claude Code `~/.claude/skills`, Codex `~/.codex/skills`).
2. The MCP server, without a key in its configuration:
   - Claude Code: `claude mcp add spritesheetgen -s user -- npx -y @spritesheetgen/cli mcp`
   - Codex: `codex mcp add spritesheetgen -- npx -y @spritesheetgen/cli mcp`
3. The key: the user creates one on <https://spritesheetgen.com/account/>
   (API keys), ticks **Generate characters and actions** and sets a daily
   and a total credit budget (a new key has a budget of 0 and cannot spend).
   Then the user runs `npx -y @spritesheetgen/cli login` in **their own
   terminal** and pastes it there (hidden; stored for that user only). The
   MCP server picks it up on the next call, no restart needed.
4. Without MCP, the same commands exist as a CLI with `--json`:
   `npx -y @spritesheetgen/cli --help`.

If a tool answers `auth`, there is no working key on this machine (none yet,
revoked or expired): ask the user to create a key on the account page and
run the `login` command above in their own terminal, then try again. Never
ask for the key in the chat, never run `login` for them and never print it.

## Before spending

- Find out the engine and where assets live in the project, the character
  (description, or an image the user made or may use), the actions wanted
  (walk, run, idle, attack, jump) and how many credits the user is fine with.
- Look before buying: `list_characters` (both sources) and `list_actions`
  for a character may already have what is needed. Re-exporting an existing
  animation for another engine is free; never generate again for that.
- `estimate_sprite` for every paid step, then tell the user the price, e.g.
  "character image 5 credits, then walk 10 credits: 15 in total". Go ahead
  only after they agree. A user may approve a batch ("up to 50 credits for
  these four actions"): keep count and ask again before going over.

## Making it

1. Character: `create_character` with the description, a new `client_key`
   for this purchase and `max_credits` = the approved price. Or
   `upload_character` with the user's image (free).
2. `get_generation` with `wait_seconds` (up to 120) until `SUCCEEDED`. Show
   the character image to the user and ask whether to animate this one; if
   not, a new version is a new purchase (estimate and ask again).
3. Before animating a generated character, poll `get_generation` until
   `reference_ready` is true (the early preview may still be copying).
   Each action: `animate_character` with the character's `reference`
   (`generation:<id>` or `media:<id>`), one action per call, its own new
   `client_key`. Then `get_generation` until done.
4. `export_sprite_sheet` with the animation's id into a **new** folder
   inside the project (see references/engines.md), e.g.
   `assets/sprites/knight_walk`. The folder must not exist yet; an existing
   one is refused, so nothing of the user's is overwritten.

## Money rules

- One `client_key` per intended purchase. After a timeout, network error or
  5xx, call again with the **same** `client_key` and inputs: the server
  returns the original generation and charges nothing more. Never retry a
  paid call with a new key.
- `FAILED` with `refunded: true` means the credits came back. Trying again
  is a new purchase that needs the user's approval.
- `scope`: the key may not generate; ask the user to tick it on the account
  page. `budget`: the key's daily or total budget is used up; the user raises
  it on the account page (days are UTC; refunds return credits, not
  budget). `price`: the price went up; estimate again and ask. `balance`:
  not enough credits; the user buys more on the pricing page.
- An export never spends. If it fails, change settings and export again.

## Reporting back

Say what was made and what it cost: the character's reference, each
animation's id, credits charged (and any refund), and the files written
with frame count, fps and frame size. Do not call an unfinished generation
downloadable.

## References

- references/tools.md: every tool, its inputs and what it returns.
- references/engines.md: putting the files into Godot, Phaser, Unity and
  others.

`list_actions` includes both GIF and web video animations. Check `kind` and
`cli_exportable`: the CLI packs GIF only; download video MP4s or use the
website to convert them. Do not buy a duplicate just because export is unsupported.
