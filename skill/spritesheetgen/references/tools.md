# Tools

MCP tool names; the CLI has the same commands (`spritesheetgen <command>
--json`, `--help` lists the flags). All answers are JSON. "Free" means no
credits.

| Tool | Cost | Inputs | Returns |
| --- | --- | --- | --- |
| `estimate_sprite` | free | `operation` `character` + `description`, or `action` + `reference`, `action`, `notes?` | `credits` (price), `balance`, `budget` (the key's caps and what it used today/in total), `normalized_inputs` |
| `create_character` | paid | `description`, `client_key`, `max_credits` | a generation (usually `PENDING`) |
| `animate_character` | paid | `reference`, `action` (walk, run, idle, attack, jump), `notes?`, `client_key`, `max_credits` | a generation |
| `get_generation` | free | `id`, `wait_seconds?` (≤ 120) | the generation: `status` (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`), `images` (the character image, or the animation as a GIF) and `videos` (an animation in video form, when there is one), `credits_charged`, `refunded` |
| `list_characters` | free | `source` (`generated` or `uploaded`), `limit?`, `cursor?` | `characters` with their `reference`, `next_cursor` |
| `list_actions` | free | `reference`, `limit?`, `cursor?` | `generations` (both GIF and web video), `kind`, `cli_exportable`, `next_cursor` |
| `improve_prompt` | free (daily quota) | `text`, `lang?` (`en`, `zh`, `ja`, `ko`), `history?` | `reply`, `prompt` (a description ready for `create_character`, or null), `remaining_today` |
| `upload_character` | free | `file_path` (PNG, JPEG, WebP, < 10 MB) | the media with its `reference` (`media:<id>`) |
| `export_sprite_sheet` | free | `id` (or a local GIF `file`), `output_dir` (new folder), `name?` (animation and frame names), `frames?`, `fps?` (1–60), `pixel_height?` (1–512), `columns?`, `background?` (`auto`, `remove`, `keep`), `individual_frames?`, `preview?` | what was written: files, frame count, fps, sizes |

## References

A character is named by its reference:

- `generation:<id>`: a generated character image (`SUCCEEDED` and `reference_ready: true`). Each new
  version of a description is its own reference.
- `media:<id>`: an uploaded image.

Animations are generations too; export takes the animation's `id`.

## Errors

A failed tool call returns `error` (the kind), `code`, `message` and
sometimes `request_id` (give it to support when asking about a charge).

| `error` | Meaning | What to do |
| --- | --- | --- |
| `auth` | key missing, revoked or expired | the user creates a key on the account page and runs `npx -y @spritesheetgen/cli login` in their own terminal |
| `scope` | the key may not do this | the user ticks the permission on the account page |
| `budget` | the key's daily or total budget is spent | the user raises it, or waits for the next UTC day |
| `price` | the price is above `max_credits` | estimate again and ask the user |
| `balance` | not enough credits | the user buys credits |
| `timeout`, `network` | outcome unknown | call again with the same `client_key` |
| `api` | anything else (e.g. `VALIDATION_ERROR`) | read `message`; fix the input |

`RESOURCE_NOT_READY` (HTTP 409) means the owned image is still being copied.
No charge was made for that refusal. Poll its generation until `reference_ready`
is true and retry with the same `client_key`.

`cli_exportable` describes format support, not completion: only a successful GIF
can be packed by this CLI. Video actions remain visible to avoid duplicate
purchases; download `videos[0]` or convert them on the website.
