# SpriteSheetGen

[English](README.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md)

[![npm](https://img.shields.io/npm/v/@spritesheetgen/cli?label=%40spritesheetgen%2Fcli)](https://www.npmjs.com/package/@spritesheetgen/cli)

为 2D 游戏生成精灵图的 AI 工具，提供 **MCP 服务**和**命令行**。描述一个角色，让它动起来（走、跑、待机、攻击、跳），引擎可直接用的文件就会放进你的项目文件夹：精灵图 PNG、TexturePacker JSON 图集、Godot 4 `SpriteFrames` 资源、单帧图片和 GIF 预览。

**产品：[spritesheetgen.com](https://spritesheetgen.com/zh/)** · **文档：[terror668.github.io/spritesheetgen/zh](https://terror668.github.io/spritesheetgen/zh/)**

浏览器里的免费工具：[视频转精灵图](https://spritesheetgen.com/zh/video-to-sprite-sheet/)、[GIF 转精灵图](https://spritesheetgen.com/zh/gif-to-sprite-sheet/)、[精灵图制作](https://spritesheetgen.com/zh/sprite-sheet-maker/)、[精灵图切割](https://spritesheetgen.com/zh/sprite-sheet-cutter/)、[精灵图转 GIF](https://spritesheetgen.com/zh/sprite-sheet-to-gif/)

<p align="center">
  <img src="docs/media/knight-walk.webp" alt="小骑士行走动画" height="160">
  <img src="docs/media/witch-walk.webp" alt="小女巫行走动画" height="160">
  <img src="docs/media/dragon-walk.webp" alt="小龙行走动画" height="160">
  <img src="docs/media/mech-walk.webp" alt="机甲行走动画" height="160">
</p>

## 让 AI 助手帮你装

把这句话发给 Claude Code、Codex 或其他支持 MCP 的助手：

```text
帮我安装 SpriteSheetGen：按 https://spritesheetgen.com/agents/install.txt 的步骤操作
```

助手会装好 MCP 服务和配套说明（skill）。然后在 <https://spritesheetgen.com/zh/account/> 创建一个 API 密钥，并在**你自己的终端**里保存它（输入时不显示，不要粘贴到聊天里）：

```sh
npx -y @spritesheetgen/cli login
```

## 手动添加 MCP 服务

```sh
# Claude Code
claude mcp add spritesheetgen -s user -- npx -y @spritesheetgen/cli mcp

# Codex
codex mcp add spritesheetgen -- npx -y @spritesheetgen/cli mcp
```

Claude Desktop、Cursor、Windsurf 等读取 `mcpServers` 配置文件的客户端（[examples/mcp.json](examples/mcp.json)）：

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

需要 Node.js 20 或更新版本。服务通过 stdio 通信，读取 `login` 保存的密钥（或环境变量 `SPRITESHEETGEN_API_KEY`），之后再登录也不用重启。

## 工具

| 工具 | 积分 | 作用 |
| --- | --- | --- |
| `estimate_sprite` | 免费 | 查询生成角色或动作的价格、你的余额和密钥剩余额度 |
| `improve_prompt` | 免费（每天少量次数） | 把粗略的想法改写成容易生成好的角色描述 |
| `create_character` | 付费 | 根据描述生成一张角色图 |
| `upload_character` | 免费 | 改用你自己的 PNG、JPEG 或 WebP 角色图 |
| `animate_character` | 付费 | 为角色生成一个动作：`walk`、`run`、`idle`、`attack` 或 `jump` |
| `get_generation` | 免费 | 查看生成任务的状态和结果（可以等待完成） |
| `list_characters` | 免费 | 列出你生成或上传过的角色 |
| `list_actions` | 免费 | 列出角色已有的动画，避免重复付费 |
| `export_sprite_sheet` | 免费 | 把完成的动画（或本地 GIF）打包到你电脑上的文件夹 |

助手总是先报价，经你同意后才消费积分。每次付费调用都带 `max_credits` 上限和 `client_key`，重试同一请求不会重复扣费。

## API 密钥和消费上限

在[账户页](https://spritesheetgen.com/zh/account/)创建密钥。每个密钥有自己的权限和每日、总额度上限；新建的密钥在你允许之前不能消费积分。密钥保存在 `~/.config/spritesheetgen/credentials`（Windows 在 `%APPDATA%`），只有你能读取；`logout` 会删除它。

新账户赠送 25 积分。当前价格见[价格页](https://spritesheetgen.com/zh/pricing/)，报价工具返回的永远是实时价格。

## 命令行

不用 MCP 也能用同样的功能：

```sh
npx -y @spritesheetgen/cli --help

spritesheetgen estimate --description "a small beetle knight" --json
spritesheetgen character --description "a small beetle knight" --client-key my-unique-key-0001 --max-credits 5 --json
spritesheetgen animate --reference generation:CHARACTER_ID --action walk --client-key my-unique-key-0002 --max-credits 10 --json
spritesheetgen export --id ANIMATION_ID --out ./assets/beetle-walk --name walk --individual-frames --preview --json
```

打包你已有的 GIF 不需要密钥，也不花积分：

```sh
npx -y @spritesheetgen/cli export --file ./walk.gif --out ./assets/walk --name hero_walk --preview
```

## 导出的文件

示例见 [samples/little-knight-walk](samples/little-knight-walk)：小骑士在绿幕上的行走动画，由命令行打包（去背景、清理边缘、对齐帧）。

| 文件 | 用途 |
| --- | --- |
| `sheet.png` | 任何引擎：帧排成一行（或网格），透明背景 |
| `sheet.json` | Phaser、PixiJS 等读取 TexturePacker JSON（hash）的引擎，带 `animations` 段 |
| `animation.tres` | Godot 4：给 `AnimatedSprite2D` 用的 `SpriteFrames` 资源，已设好速度和循环 |
| `preview.gif` | 快速预览 |
| `export.json` | 本次使用的设置，方便重复导出 |
| `frames/*.png`、`frames.zip` | Unity、GameMaker 等需要单张图片的工具（`--individual-frames`） |

Phaser 3：

```js
this.load.atlas("knight", "sheet.png", "sheet.json");
this.anims.create({ key: "walk", frames: this.anims.generateFrameNames("knight", { prefix: "knight_walk_", end: 11, zeroPad: 2 }), frameRate: 14, repeat: -1 });
```

Godot 4：把 `sheet.png` 和 `animation.tres` 放在同一个文件夹，再把 `animation.tres` 拖到 `AnimatedSprite2D` 的 **Sprite Frames** 上。

## 源代码

`src/` 是 npm 包 `@spritesheetgen/cli` 的源码：命令行、MCP 服务，以及在你电脑上打包精灵图的处理流程（去背景、清理边缘、对齐帧、像素风、导出 PNG/JSON/Godot）。生成在 spritesheetgen.com 上进行，这里的代码用你的密钥调用它的 API。

```sh
npm ci
npm test          # 单元测试，不联网
npm run build     # 生成 dist/index.js，单个自包含文件
node dist/index.js mcp
```

`Dockerfile` 用 stdio 运行 MCP 服务。把项目目录挂载到 `/work`，导出的文件会写在那里：

```sh
docker build -t spritesheetgen .
docker run -i --rm -e SPRITESHEETGEN_API_KEY -v "$PWD:/work" --user "$(id -u):$(id -g)" spritesheetgen
```

## 关于本仓库

这里的代码在每次发版时从我们的主代码库复制过来，所以 pull request 会由我们阅读后手动合入主库。问题和 bug 欢迎提到 [issues](../../issues)，或发邮件到 support@spritesheetgen.com。

采用 [MIT 许可](LICENSE)。
