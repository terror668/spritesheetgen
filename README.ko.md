# SpriteSheetGen

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어**

[![npm](https://img.shields.io/npm/v/@spritesheetgen/cli?label=%40spritesheetgen%2Fcli)](https://www.npmjs.com/package/@spritesheetgen/cli)

2D 게임용 스프라이트 시트를 만드는 AI 도구로, **MCP 서버**와 **CLI**로 쓸 수 있습니다. 캐릭터를 설명하고 움직이게 하면(걷기, 달리기, 대기, 공격, 점프) 엔진에서 바로 쓸 수 있는 파일이 프로젝트 폴더에 들어갑니다: 스프라이트 시트 PNG, TexturePacker JSON 아틀라스, Godot 4 `SpriteFrames` 리소스, 낱장 프레임, GIF 미리 보기.

**제품: [spritesheetgen.com](https://spritesheetgen.com/ko/)** · **문서: [terror668.github.io/spritesheetgen/ko](https://terror668.github.io/spritesheetgen/ko/)**

브라우저에서 쓰는 무료 도구: [동영상을 스프라이트 시트로](https://spritesheetgen.com/ko/video-to-sprite-sheet/), [GIF를 스프라이트 시트로](https://spritesheetgen.com/ko/gif-to-sprite-sheet/), [스프라이트 시트 만들기](https://spritesheetgen.com/ko/sprite-sheet-maker/), [스프라이트 시트 자르기](https://spritesheetgen.com/ko/sprite-sheet-cutter/), [스프라이트 시트를 GIF로](https://spritesheetgen.com/ko/sprite-sheet-to-gif/)

<p align="center">
  <img src="docs/media/knight-walk.webp" alt="꼬마 기사 걷기 애니메이션" height="160">
  <img src="docs/media/witch-walk.webp" alt="꼬마 마녀 걷기 애니메이션" height="160">
  <img src="docs/media/dragon-walk.webp" alt="아기 드래곤 걷기 애니메이션" height="160">
  <img src="docs/media/mech-walk.webp" alt="전투 메카 걷기 애니메이션" height="160">
</p>

## AI 에이전트로 설치하기

Claude Code, Codex 등 MCP를 지원하는 에이전트에 이 문장을 보내세요:

```text
SpriteSheetGen을 설정해 줘: https://spritesheetgen.com/agents/install.txt 의 단계를 따라 줘
```

에이전트가 MCP 서버와 스킬을 설치합니다. 그다음 <https://spritesheetgen.com/ko/account/>에서 API 키를 만들고 **내 터미널**에서 저장하세요(입력 내용은 보이지 않으며, 채팅에 붙여 넣지 마세요):

```sh
npx -y @spritesheetgen/cli login
```

## MCP 서버 직접 추가하기

```sh
# Claude Code
claude mcp add spritesheetgen -s user -- npx -y @spritesheetgen/cli mcp

# Codex
codex mcp add spritesheetgen -- npx -y @spritesheetgen/cli mcp
```

Claude Desktop, Cursor, Windsurf 등 `mcpServers` 설정 파일을 읽는 클라이언트([examples/mcp.json](examples/mcp.json)):

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

Node.js 20 이상이 필요합니다. 서버는 stdio로 동작하고 `login`으로 저장한 키(또는 `SPRITESHEETGEN_API_KEY`)를 읽으므로, 나중에 로그인해도 다시 시작할 필요가 없습니다.

## 도구

| 도구 | 크레딧 | 하는 일 |
| --- | --- | --- |
| `estimate_sprite` | 무료 | 캐릭터나 동작의 가격, 잔액, 키의 남은 예산 확인 |
| `improve_prompt` | 무료(하루 횟수 제한) | 대략적인 아이디어를 잘 생성되는 캐릭터 설명으로 다듬기 |
| `create_character` | 유료 | 설명으로 캐릭터 이미지 1장 생성 |
| `upload_character` | 무료 | 직접 가진 PNG, JPEG, WebP 캐릭터 사용 |
| `animate_character` | 유료 | 애니메이션 1개 생성: `walk`, `run`, `idle`, `attack`, `jump` |
| `get_generation` | 무료 | 생성 상태와 결과 확인(완료까지 기다릴 수 있음) |
| `list_characters` | 무료 | 생성하거나 업로드한 캐릭터 목록 |
| `list_actions` | 무료 | 캐릭터가 이미 가진 애니메이션 목록(중복 결제 방지) |
| `export_sprite_sheet` | 무료 | 완성된 애니메이션(또는 내 GIF)을 내 컴퓨터 폴더로 내보내기 |

에이전트는 항상 먼저 가격을 알려 주고, 동의한 뒤에만 크레딧을 씁니다. 유료 호출에는 `max_credits` 한도와 `client_key`가 붙어서 다시 시도해도 두 번 청구되지 않습니다.

## API 키와 사용 한도

키는 [계정 페이지](https://spritesheetgen.com/ko/account/)에서 만듭니다. 키마다 권한과 하루·전체 크레딧 한도가 있고, 허용하기 전까지 새 키는 크레딧을 쓸 수 없습니다. 키는 `~/.config/spritesheetgen/credentials`(Windows는 `%APPDATA%`)에 저장되며 본인만 읽을 수 있고, `logout`으로 삭제합니다.

새 계정은 25 크레딧을 받습니다. 현재 가격은 [요금 페이지](https://spritesheetgen.com/ko/pricing/)에 있고, 견적 도구는 항상 현재 가격을 알려 줍니다.

## CLI

MCP 없이도 같은 기능을 쓸 수 있습니다:

```sh
npx -y @spritesheetgen/cli --help

spritesheetgen estimate --description "a small beetle knight" --json
spritesheetgen character --description "a small beetle knight" --client-key my-unique-key-0001 --max-credits 5 --json
spritesheetgen animate --reference generation:CHARACTER_ID --action walk --client-key my-unique-key-0002 --max-credits 10 --json
spritesheetgen export --id ANIMATION_ID --out ./assets/beetle-walk --name walk --individual-frames --preview --json
```

가지고 있는 GIF를 내보낼 때는 키가 필요 없고 무료입니다:

```sh
npx -y @spritesheetgen/cli export --file ./walk.gif --out ./assets/walk --name hero_walk --preview
```

## 내보내기 결과물

예시는 [samples/little-knight-walk](samples/little-knight-walk): 그린 스크린 위 기사의 걷기를 CLI로 내보낸 것입니다(배경 제거, 가장자리 정리, 프레임 정렬).

| 파일 | 쓰는 곳 |
| --- | --- |
| `sheet.png` | 모든 엔진: 프레임을 한 줄(또는 격자)로 배치한 투명 PNG |
| `sheet.json` | Phaser, PixiJS 등 TexturePacker JSON(hash)을 읽는 엔진(`animations` 포함) |
| `animation.tres` | Godot 4: `AnimatedSprite2D`용 `SpriteFrames` 리소스(속도와 반복 설정 포함) |
| `preview.gif` | 빠른 미리 보기 |
| `export.json` | 사용한 설정(같은 내보내기를 반복할 때) |
| `frames/*.png`, `frames.zip` | Unity, GameMaker 등 낱장 이미지가 필요한 도구(`--individual-frames`) |

Phaser 3:

```js
this.load.atlas("knight", "sheet.png", "sheet.json");
this.anims.create({ key: "walk", frames: this.anims.generateFrameNames("knight", { prefix: "knight_walk_", end: 11, zeroPad: 2 }), frameRate: 14, repeat: -1 });
```

Godot 4: `sheet.png`와 `animation.tres`를 같은 폴더에 두고, `animation.tres`를 `AnimatedSprite2D`의 **Sprite Frames**로 끌어다 놓으세요.

## 이 저장소에 대해

npm 패키지 `@spritesheetgen/cli`의 문서, 설정 예시, 내보내기 예시를 담고 있습니다. 질문과 버그는 [issues](../../issues) 또는 support@spritesheetgen.com으로 보내 주세요.

이 저장소의 내용은 [MIT 라이선스](LICENSE)로 공개합니다.
