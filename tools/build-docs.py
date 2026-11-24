#!/usr/bin/env python3
"""Build the GitHub Pages docs (docs/index.html, docs/zh/, docs/ja/, docs/ko/) from one template.

    python3 tools/build-docs.py
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = "https://terror668.github.io/spritesheetgen/"
SITE = "https://spritesheetgen.com"
INSTALL = "https://spritesheetgen.com/agents/install.txt"

LANGS = {
    "en": {"dir": "", "html": "en", "name": "English", "site": ""},
    "zh": {"dir": "zh/", "html": "zh-CN", "name": "简体中文", "site": "/zh"},
    "ja": {"dir": "ja/", "html": "ja", "name": "日本語", "site": "/ja"},
    "ko": {"dir": "ko/", "html": "ko", "name": "한국어", "site": "/ko"},
}

T = {
    "en": {
        "title": "SpriteSheetGen MCP Server and CLI: AI sprite sheets for 2D games",
        "description": "Docs for the SpriteSheetGen MCP server and CLI: let Claude Code, Codex or Cursor generate a 2D game character, animate it and export a sprite sheet, JSON atlas and Godot SpriteFrames into your project.",
        "og_desc": "Generate a 2D game character, animate it and export engine-ready sprite sheets from your AI coding agent.",
        "nav": ["Setup", "Tools", "CLI", "Export files"],
        "lang_label": "Language",
        "kicker": "MCP server + CLI",
        "h1": "AI sprite sheets for 2D games, from your coding agent",
        "lead": "Ask Claude Code, Codex or Cursor for a character and its moves. SpriteSheetGen generates them and drops a sprite sheet, a JSON atlas and a Godot <code>SpriteFrames</code> file into your project.",
        "alts": ["Little knight walk cycle", "Little witch walk cycle", "Baby dragon walk cycle", "Combat mech walk cycle"],
        "caption": "Walk cycles made with SpriteSheetGen (the knight's image is our logo art; only its animation is generated).",
        "cta_setup": "Set it up",
        "cta_site": "Try it in the browser",
        "setup_h2": "Setup",
        "step1": "<strong>Let your agent install it.</strong> Paste this into Claude Code, Codex or another agent with MCP:",
        "prompt": f"Set up SpriteSheetGen for me: follow {INSTALL}",
        "step1_after": "It adds the MCP server and an agent skill that knows the tools, budgets and engine imports.",
        "step2": "<strong>Create an API key</strong> on the <a href=\"{site}/account/\">account page</a>. Each key has its own permissions and a daily and total credit cap; a new key cannot spend until you allow it.",
        "step3": "<strong>Log in from your own terminal</strong>, not the chat (the key is typed hidden):",
        "byhand": "Or add the MCP server by hand",
        "tab_json": "Cursor, Claude Desktop, others",
        "setup_note": "Node.js 20 or newer. The server talks over stdio and reads the key saved by <code>login</code> (or <code>SPRITESHEETGEN_API_KEY</code>), so logging in later needs no restart.",
        "tools_h2": "Tools",
        "th": ["Tool", "Credits", "What it does"],
        "free": "free",
        "paid": "paid",
        "tools": [
            "Price of a character or an action, your balance and the key's remaining budget",
            "Turns a rough idea into a character description that generates well (small daily quota)",
            "One character image from a description",
            "Uses your own PNG, JPEG or WebP character instead",
            "One animation: <code>walk</code>, <code>run</code>, <code>idle</code>, <code>attack</code> or <code>jump</code>",
            "Status and result of a generation; can wait for it",
            "Characters you generated or uploaded",
            "Animations a character already has, so you never pay twice",
            "Packs a finished animation, or a local GIF, into a folder on your machine",
        ],
        "tools_note": "Your agent estimates first, shows you the price and spends only after you say yes. Every paid call carries a <code>max_credits</code> cap and a <code>client_key</code>, so a retried request is never charged twice. New accounts receive 25 credits; current prices are on the <a href=\"{site}/pricing/\">pricing page</a>. The full guide, with engine import steps, is on <a href=\"{site}/game-asset-generator-mcp/\">spritesheetgen.com</a>.",
        "cli_h2": "CLI",
        "cli_intro": "The same features without MCP, with <code>--json</code> output for scripts:",
        "cli_gif": "Packing a GIF you already have needs no key and costs nothing:",
        "export_h2": "What an export contains",
        "sheet_alt": "Little knight walk sprite sheet: 12 frames in one row, transparent background",
        "sample": "The <a href=\"https://github.com/terror668/spritesheetgen/tree/main/samples/little-knight-walk\">sample export</a>: the knight's walk on a green screen, packed by the CLI (background removed, edges cleaned, frames aligned).",
        "th_files": ["File", "Use it in"],
        "files": [
            "Any engine: frames in a row or a grid, transparent background",
            "Phaser, PixiJS and other engines that read TexturePacker JSON (hash), with an <code>animations</code> block",
            "Godot 4: a <code>SpriteFrames</code> resource for <code>AnimatedSprite2D</code>, with speed and looping set",
            "A quick look",
            "The settings used, to repeat the export",
            "Unity, GameMaker or any tool that wants single images (<code>--individual-frames</code>)",
        ],
        "godot": "Put <code>sheet.png</code> and <code>animation.tres</code> in the same folder, add an <code>AnimatedSprite2D</code> and drag <code>animation.tres</code> onto its <strong>Sprite Frames</strong> property.",
        "browser_h2": "No agent? Use the browser",
        "browser": "Everything above also works on <a href=\"{site}/\">spritesheetgen.com</a>, plus free tools that run on your device: <a href=\"{site}/video-to-sprite-sheet/\">video to sprite sheet</a>, <a href=\"{site}/gif-to-sprite-sheet/\">GIF to sprite sheet</a>, <a href=\"{site}/sprite-sheet-maker/\">sprite sheet maker</a>, <a href=\"{site}/sprite-sheet-cutter/\">sprite sheet cutter</a> and <a href=\"{site}/sprite-sheet-to-gif/\">sprite sheet to GIF</a>.",
        "issues": "Issues",
        "license": "This page is MIT licensed. Pixelify Sans is used under the <a href=\"{assets}media/pixelify-sans-OFL.txt\">SIL Open Font License</a>.",
        "copy": ["Copy", "Copied", "Select and copy"],
        "offer": "The CLI and MCP server are free; generation uses credits",
    },
    "zh": {
        "title": "SpriteSheetGen MCP 服务与 CLI：用 AI 助手生成 2D 游戏精灵图",
        "description": "SpriteSheetGen MCP 服务与命令行文档：让 Claude Code、Codex 或 Cursor 生成 2D 游戏角色和动画，并把精灵图、JSON 图集和 Godot SpriteFrames 直接导出到你的项目里。",
        "og_desc": "在 AI 编程助手里生成 2D 游戏角色和动画，导出引擎可直接用的精灵图。",
        "nav": ["安装", "工具", "命令行", "导出文件"],
        "lang_label": "语言",
        "kicker": "MCP 服务 + 命令行",
        "h1": "让 AI 编程助手为你的 2D 游戏做精灵图",
        "lead": "在 Claude Code、Codex 或 Cursor 里说出你要的角色和动作，SpriteSheetGen 生成后把精灵图、JSON 图集和 Godot <code>SpriteFrames</code> 文件直接放进你的项目。",
        "alts": ["小骑士行走动画", "小女巫行走动画", "小龙行走动画", "机甲行走动画"],
        "caption": "以上行走动画均由 SpriteSheetGen 制作（小骑士的形象是我们的 logo 原画，只有动画是生成的）。",
        "cta_setup": "开始安装",
        "cta_site": "在浏览器里试试",
        "setup_h2": "安装",
        "step1": "<strong>让助手帮你装。</strong>把这句话发给 Claude Code、Codex 或其他支持 MCP 的助手：",
        "prompt": f"帮我安装 SpriteSheetGen：按 {INSTALL} 的步骤操作",
        "step1_after": "它会添加 MCP 服务，并装好一份说明（skill），里面写了工具用法、额度规则和各引擎的导入方法。",
        "step2": "在<a href=\"{site}/account/\">账户页</a><strong>创建 API 密钥</strong>。每个密钥有自己的权限和每日、总额度上限；新建的密钥在你允许之前不能消费积分。",
        "step3": "<strong>在你自己的终端里登录</strong>，不要在聊天里粘贴（输入密钥时不会显示）：",
        "byhand": "也可以手动添加 MCP 服务",
        "tab_json": "Cursor、Claude Desktop 等",
        "setup_note": "需要 Node.js 20 或更新版本。服务通过 stdio 通信，读取 <code>login</code> 保存的密钥（或环境变量 <code>SPRITESHEETGEN_API_KEY</code>），之后再登录也不用重启。",
        "tools_h2": "工具",
        "th": ["工具", "积分", "作用"],
        "free": "免费",
        "paid": "付费",
        "tools": [
            "查询生成角色或动作的价格、你的余额和密钥剩余额度",
            "把粗略的想法改写成容易生成好的角色描述（每天有少量免费次数）",
            "根据描述生成一张角色图",
            "改用你自己的 PNG、JPEG 或 WebP 角色图",
            "为角色生成一个动作：<code>walk</code>（走）、<code>run</code>（跑）、<code>idle</code>（待机）、<code>attack</code>（攻击）或 <code>jump</code>（跳）",
            "查看生成任务的状态和结果，可以等待完成",
            "列出你生成或上传过的角色",
            "列出角色已有的动画，避免重复付费",
            "把完成的动画（或本地 GIF）打包到你电脑上的文件夹",
        ],
        "tools_note": "助手会先报价，经你同意后才消费积分。每次付费调用都带 <code>max_credits</code> 上限和 <code>client_key</code>，重试同一请求不会重复扣费。新账户赠送 25 积分，当前价格见<a href=\"{site}/pricing/\">价格页</a>。完整指南（含导入引擎的步骤）在 <a href=\"{site}/game-asset-generator-mcp/\">spritesheetgen.com</a>。",
        "cli_h2": "命令行",
        "cli_intro": "不用 MCP 也能用同样的功能，加 <code>--json</code> 方便脚本处理：",
        "cli_gif": "打包你已有的 GIF 不需要密钥，也不花积分：",
        "export_h2": "导出的文件",
        "sheet_alt": "小骑士行走精灵图：12 帧排成一行，透明背景",
        "sample": "<a href=\"https://github.com/terror668/spritesheetgen/tree/main/samples/little-knight-walk\">示例导出</a>：小骑士在绿幕上的行走动画，由命令行打包（去背景、清理边缘、对齐帧）。",
        "th_files": ["文件", "用途"],
        "files": [
            "任何引擎：帧排成一行或网格，透明背景",
            "Phaser、PixiJS 等读取 TexturePacker JSON（hash）的引擎，带 <code>animations</code> 段",
            "Godot 4：给 <code>AnimatedSprite2D</code> 用的 <code>SpriteFrames</code> 资源，已设好速度和循环",
            "快速预览",
            "本次使用的设置，方便重复导出",
            "Unity、GameMaker 等需要单张图片的工具（<code>--individual-frames</code>）",
        ],
        "godot": "把 <code>sheet.png</code> 和 <code>animation.tres</code> 放在同一个文件夹，添加一个 <code>AnimatedSprite2D</code>，把 <code>animation.tres</code> 拖到它的 <strong>Sprite Frames</strong> 属性上。",
        "browser_h2": "不用助手？在浏览器里用",
        "browser": "以上功能在 <a href=\"{site}/\">spritesheetgen.com</a> 上都能用，另有在你设备上运行的免费工具：<a href=\"{site}/video-to-sprite-sheet/\">视频转精灵图</a>、<a href=\"{site}/gif-to-sprite-sheet/\">GIF 转精灵图</a>、<a href=\"{site}/sprite-sheet-maker/\">精灵图制作</a>、<a href=\"{site}/sprite-sheet-cutter/\">精灵图切割</a>和<a href=\"{site}/sprite-sheet-to-gif/\">精灵图转 GIF</a>。",
        "issues": "问题反馈",
        "license": "本页面采用 MIT 许可。Pixelify Sans 字体依 <a href=\"{assets}media/pixelify-sans-OFL.txt\">SIL Open Font License</a> 使用。",
        "copy": ["复制", "已复制", "请手动复制"],
        "offer": "命令行和 MCP 服务免费，生成消耗积分",
    },
    "ja": {
        "title": "SpriteSheetGen MCP サーバーと CLI：AI エージェントで 2D ゲームのスプライトシート",
        "description": "SpriteSheetGen の MCP サーバーと CLI のドキュメント。Claude Code、Codex、Cursor で 2D ゲームのキャラクターとアニメーションを作り、スプライトシート、JSON アトラス、Godot の SpriteFrames をプロジェクトに書き出します。",
        "og_desc": "AI コーディングエージェントから 2D ゲームのキャラクターとアニメーションを作り、エンジン用スプライトシートを書き出します。",
        "nav": ["セットアップ", "ツール", "CLI", "書き出しファイル"],
        "lang_label": "言語",
        "kicker": "MCP サーバー + CLI",
        "h1": "コーディングエージェントで 2D ゲームのスプライトシートを",
        "lead": "Claude Code、Codex、Cursor にキャラクターと動きを伝えるだけ。SpriteSheetGen が生成し、スプライトシート、JSON アトラス、Godot の <code>SpriteFrames</code> ファイルをプロジェクトに置きます。",
        "alts": ["小さな騎士の歩きアニメーション", "小さな魔女の歩きアニメーション", "子どもドラゴンの歩きアニメーション", "戦闘メカの歩きアニメーション"],
        "caption": "どれも SpriteSheetGen で作った歩きアニメーションです（騎士の画像はロゴのイラストで、アニメーションだけを生成）。",
        "cta_setup": "セットアップ",
        "cta_site": "ブラウザで試す",
        "setup_h2": "セットアップ",
        "step1": "<strong>エージェントにインストールさせる。</strong>Claude Code、Codex など MCP 対応のエージェントにこう送ります：",
        "prompt": f"SpriteSheetGen をセットアップして：{INSTALL} の手順に従って",
        "step1_after": "MCP サーバーと、ツールの使い方・予算・エンジンへの取り込みを知っているスキルが追加されます。",
        "step2": "<a href=\"{site}/account/\">アカウントページ</a>で <strong>API キーを作成</strong>します。キーごとに権限と 1 日・合計のクレジット上限があり、許可するまで新しいキーは消費できません。",
        "step3": "<strong>ご自身のターミナルでログイン</strong>します。チャットには貼らないでください（入力は表示されません）：",
        "byhand": "MCP サーバーを手動で追加する",
        "tab_json": "Cursor、Claude Desktop など",
        "setup_note": "Node.js 20 以上が必要です。サーバーは stdio で動き、<code>login</code> で保存したキー（または <code>SPRITESHEETGEN_API_KEY</code>）を読むので、あとからログインしても再起動は不要です。",
        "tools_h2": "ツール",
        "th": ["ツール", "クレジット", "内容"],
        "free": "無料",
        "paid": "有料",
        "tools": [
            "キャラクターや動作の価格、残高、キーの残り予算を確認",
            "ざっくりしたアイデアを生成しやすいキャラクター説明に整える（1 日の無料回数あり）",
            "説明からキャラクター画像を 1 枚生成",
            "手持ちの PNG・JPEG・WebP のキャラクターを使う",
            "アニメーションを 1 つ生成：<code>walk</code>、<code>run</code>、<code>idle</code>、<code>attack</code>、<code>jump</code>",
            "生成の状態と結果を確認（完了まで待つことも可能）",
            "生成またはアップロードしたキャラクターの一覧",
            "キャラクターが持っているアニメーションの一覧（二重払いを防ぐ）",
            "完成したアニメーション（または手元の GIF）をローカルのフォルダに書き出す",
        ],
        "tools_note": "エージェントはまず見積もりを出し、あなたが了承してから消費します。有料の呼び出しには必ず <code>max_credits</code> の上限と <code>client_key</code> が付くので、再試行しても二重に請求されません。新規アカウントには 25 クレジット。最新の価格は<a href=\"{site}/pricing/\">料金ページ</a>へ。エンジンへの読み込み手順を含む完全なガイドは <a href=\"{site}/game-asset-generator-mcp/\">spritesheetgen.com</a> にあります。",
        "cli_h2": "CLI",
        "cli_intro": "MCP なしでも同じ機能が使えます。スクリプト向けに <code>--json</code> 出力もあります：",
        "cli_gif": "手持ちの GIF の書き出しはキー不要・無料です：",
        "export_h2": "書き出されるファイル",
        "sheet_alt": "小さな騎士の歩きスプライトシート：12 フレームを 1 行、透明背景",
        "sample": "<a href=\"https://github.com/terror668/spritesheetgen/tree/main/samples/little-knight-walk\">サンプル</a>：グリーンバックの騎士の歩きを CLI で書き出したもの（背景除去、エッジ処理、フレーム位置合わせ）。",
        "th_files": ["ファイル", "使い道"],
        "files": [
            "どのエンジンでも：フレームを 1 行またはグリッドに並べた透明 PNG",
            "Phaser、PixiJS など TexturePacker JSON（hash）を読むエンジン（<code>animations</code> 付き）",
            "Godot 4：<code>AnimatedSprite2D</code> 用の <code>SpriteFrames</code> リソース（速度とループ設定済み）",
            "すぐに確認するためのプレビュー",
            "使った設定（同じ書き出しを繰り返すため）",
            "Unity、GameMaker など単体画像を使うツール（<code>--individual-frames</code>）",
        ],
        "godot": "<code>sheet.png</code> と <code>animation.tres</code> を同じフォルダに置き、<code>AnimatedSprite2D</code> を追加して、その <strong>Sprite Frames</strong> に <code>animation.tres</code> をドラッグします。",
        "browser_h2": "エージェントなしならブラウザで",
        "browser": "ここまでの機能はすべて <a href=\"{site}/\">spritesheetgen.com</a> でも使えます。端末内で動く無料ツールもあります：<a href=\"{site}/video-to-sprite-sheet/\">動画からスプライトシート</a>、<a href=\"{site}/gif-to-sprite-sheet/\">GIF からスプライトシート</a>、<a href=\"{site}/sprite-sheet-maker/\">スプライトシート作成</a>、<a href=\"{site}/sprite-sheet-cutter/\">スプライトシート分割</a>、<a href=\"{site}/sprite-sheet-to-gif/\">スプライトシートから GIF</a>。",
        "issues": "Issues",
        "license": "このページは MIT ライセンスです。Pixelify Sans は <a href=\"{assets}media/pixelify-sans-OFL.txt\">SIL Open Font License</a> で使用しています。",
        "copy": ["コピー", "コピーしました", "手動でコピーしてください"],
        "offer": "CLI と MCP サーバーは無料、生成にはクレジットを使います",
    },
    "ko": {
        "title": "SpriteSheetGen MCP 서버와 CLI: AI 에이전트로 2D 게임 스프라이트 시트 만들기",
        "description": "SpriteSheetGen MCP 서버와 CLI 문서: Claude Code, Codex, Cursor에서 2D 게임 캐릭터와 애니메이션을 만들고 스프라이트 시트, JSON 아틀라스, Godot SpriteFrames를 프로젝트로 내보냅니다.",
        "og_desc": "AI 코딩 에이전트에서 2D 게임 캐릭터와 애니메이션을 만들고 엔진용 스프라이트 시트를 내보냅니다.",
        "nav": ["설치", "도구", "CLI", "내보내기 파일"],
        "lang_label": "언어",
        "kicker": "MCP 서버 + CLI",
        "h1": "코딩 에이전트로 만드는 2D 게임 스프라이트 시트",
        "lead": "Claude Code, Codex, Cursor에 원하는 캐릭터와 동작을 말하면 SpriteSheetGen이 만들어 스프라이트 시트, JSON 아틀라스, Godot <code>SpriteFrames</code> 파일을 프로젝트에 넣어 줍니다.",
        "alts": ["꼬마 기사 걷기 애니메이션", "꼬마 마녀 걷기 애니메이션", "아기 드래곤 걷기 애니메이션", "전투 메카 걷기 애니메이션"],
        "caption": "모두 SpriteSheetGen으로 만든 걷기 애니메이션입니다(기사 이미지는 로고 그림이고, 애니메이션만 생성했습니다).",
        "cta_setup": "설치하기",
        "cta_site": "브라우저에서 써 보기",
        "setup_h2": "설치",
        "step1": "<strong>에이전트에게 설치를 맡기세요.</strong> Claude Code, Codex 등 MCP를 지원하는 에이전트에 이 문장을 보내세요:",
        "prompt": f"SpriteSheetGen을 설정해 줘: {INSTALL} 의 단계를 따라 줘",
        "step1_after": "MCP 서버와 함께 도구 사용법, 예산, 엔진 가져오기를 아는 스킬이 설치됩니다.",
        "step2": "<a href=\"{site}/account/\">계정 페이지</a>에서 <strong>API 키를 만드세요</strong>. 키마다 권한과 하루·전체 크레딧 한도가 있고, 허용하기 전까지 새 키는 크레딧을 쓸 수 없습니다.",
        "step3": "<strong>내 터미널에서 로그인하세요.</strong> 채팅에 붙여 넣지 마세요(입력 내용은 보이지 않습니다):",
        "byhand": "MCP 서버를 직접 추가하기",
        "tab_json": "Cursor, Claude Desktop 등",
        "setup_note": "Node.js 20 이상이 필요합니다. 서버는 stdio로 동작하고 <code>login</code>으로 저장한 키(또는 <code>SPRITESHEETGEN_API_KEY</code>)를 읽으므로, 나중에 로그인해도 다시 시작할 필요가 없습니다.",
        "tools_h2": "도구",
        "th": ["도구", "크레딧", "하는 일"],
        "free": "무료",
        "paid": "유료",
        "tools": [
            "캐릭터나 동작의 가격, 잔액, 키의 남은 예산 확인",
            "대략적인 아이디어를 잘 생성되는 캐릭터 설명으로 다듬기(하루 무료 횟수 있음)",
            "설명으로 캐릭터 이미지 1장 생성",
            "직접 가진 PNG, JPEG, WebP 캐릭터 사용",
            "애니메이션 1개 생성: <code>walk</code>, <code>run</code>, <code>idle</code>, <code>attack</code>, <code>jump</code>",
            "생성 상태와 결과 확인(완료까지 기다릴 수 있음)",
            "생성하거나 업로드한 캐릭터 목록",
            "캐릭터가 이미 가진 애니메이션 목록(중복 결제 방지)",
            "완성된 애니메이션(또는 내 GIF)을 내 컴퓨터 폴더로 내보내기",
        ],
        "tools_note": "에이전트는 먼저 가격을 알려 주고, 동의한 뒤에만 크레딧을 씁니다. 유료 호출에는 항상 <code>max_credits</code> 한도와 <code>client_key</code>가 붙어서 다시 시도해도 두 번 청구되지 않습니다. 새 계정은 25 크레딧을 받습니다. 현재 가격은 <a href=\"{site}/pricing/\">요금 페이지</a>에서 확인하세요. 엔진에 넣는 방법까지 담은 전체 안내는 <a href=\"{site}/game-asset-generator-mcp/\">spritesheetgen.com</a>에 있습니다.",
        "cli_h2": "CLI",
        "cli_intro": "MCP 없이도 같은 기능을 쓸 수 있고, 스크립트용 <code>--json</code> 출력도 있습니다:",
        "cli_gif": "가지고 있는 GIF를 내보낼 때는 키가 필요 없고 무료입니다:",
        "export_h2": "내보내기 결과물",
        "sheet_alt": "꼬마 기사 걷기 스프라이트 시트: 12프레임 한 줄, 투명 배경",
        "sample": "<a href=\"https://github.com/terror668/spritesheetgen/tree/main/samples/little-knight-walk\">예시 결과물</a>: 그린 스크린 위 기사의 걷기를 CLI로 내보낸 것(배경 제거, 가장자리 정리, 프레임 정렬).",
        "th_files": ["파일", "쓰는 곳"],
        "files": [
            "모든 엔진: 프레임을 한 줄 또는 격자로 배치한 투명 PNG",
            "Phaser, PixiJS 등 TexturePacker JSON(hash)을 읽는 엔진(<code>animations</code> 포함)",
            "Godot 4: <code>AnimatedSprite2D</code>용 <code>SpriteFrames</code> 리소스(속도와 반복 설정 포함)",
            "빠른 미리 보기",
            "사용한 설정(같은 내보내기를 반복할 때)",
            "Unity, GameMaker 등 낱장 이미지가 필요한 도구(<code>--individual-frames</code>)",
        ],
        "godot": "<code>sheet.png</code>와 <code>animation.tres</code>를 같은 폴더에 두고 <code>AnimatedSprite2D</code>를 추가한 뒤, <code>animation.tres</code>를 <strong>Sprite Frames</strong> 속성으로 끌어다 놓으세요.",
        "browser_h2": "에이전트가 없다면 브라우저에서",
        "browser": "위 기능은 모두 <a href=\"{site}/\">spritesheetgen.com</a>에서도 쓸 수 있고, 내 기기에서 돌아가는 무료 도구도 있습니다: <a href=\"{site}/video-to-sprite-sheet/\">동영상을 스프라이트 시트로</a>, <a href=\"{site}/gif-to-sprite-sheet/\">GIF를 스프라이트 시트로</a>, <a href=\"{site}/sprite-sheet-maker/\">스프라이트 시트 만들기</a>, <a href=\"{site}/sprite-sheet-cutter/\">스프라이트 시트 자르기</a>, <a href=\"{site}/sprite-sheet-to-gif/\">스프라이트 시트를 GIF로</a>.",
        "issues": "이슈",
        "license": "이 페이지는 MIT 라이선스입니다. Pixelify Sans는 <a href=\"{assets}media/pixelify-sans-OFL.txt\">SIL Open Font License</a>에 따라 사용합니다.",
        "copy": ["복사", "복사됨", "직접 복사하세요"],
        "offer": "CLI와 MCP 서버는 무료이고, 생성에는 크레딧을 씁니다",
    },
}

TOOLS = ["estimate_sprite", "improve_prompt", "create_character", "upload_character", "animate_character", "get_generation", "list_characters", "list_actions", "export_sprite_sheet"]
PAID = {"create_character", "animate_character"}
FILES = ["sheet.png", "sheet.json", "animation.tres", "preview.gif", "export.json", "frames/*.png"]
CAST = [("knight-walk", 149), ("witch-walk", 175), ("dragon-walk", 164), ("mech-walk", 183)]

CSS = (ROOT / "tools" / "docs.css").read_text()

CLI_BLOCK = """spritesheetgen estimate --description "a small beetle knight" --json
spritesheetgen character --description "a small beetle knight" --client-key my-key-0001 --max-credits 5 --json
spritesheetgen animate --reference generation:CHARACTER_ID --action walk --client-key my-key-0002 --max-credits 10 --json
spritesheetgen export --id ANIMATION_ID --out ./assets/beetle-walk --name walk --individual-frames --preview --json"""

PHASER = """this.load.atlas("knight", "sheet.png", "sheet.json");
this.anims.create({
  key: "walk",
  frames: this.anims.generateFrameNames("knight", { prefix: "knight_walk_", end: 11, zeroPad: 2 }),
  frameRate: 14,
  repeat: -1,
});"""

MCP_JSON = """{
  "mcpServers": {
    "spritesheetgen": {
      "command": "npx",
      "args": ["-y", "@spritesheetgen/cli", "mcp"]
    }
  }
}"""


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def page(lang: str) -> str:
    t, meta = T[lang], LANGS[lang]
    url = PAGES + meta["dir"]
    assets = "../" if meta["dir"] else ""
    site = SITE + meta["site"]
    fill = lambda s: s.replace("{site}", site).replace("{assets}", assets)
    alternates = "\n".join(
        f'<link rel="alternate" hreflang="{m["html"]}" href="{PAGES}{m["dir"]}">' for m in LANGS.values()
    ) + f'\n<link rel="alternate" hreflang="x-default" href="{PAGES}">'
    switch = " ".join(
        f'<a href="{assets}{m["dir"]}" hreflang="{m["html"]}" lang="{m["html"]}"' + (' aria-current="page"' if k == lang else "") + f'>{m["name"]}</a>'
        for k, m in LANGS.items()
    )
    jsonld = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "SpriteSheetGen MCP server and CLI",
        "description": t["description"],
        "inLanguage": meta["html"],
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "Windows, macOS, Linux (Node.js 20+)",
        "url": url,
        "downloadUrl": "https://www.npmjs.com/package/@spritesheetgen/cli",
        "sameAs": ["https://github.com/terror668/spritesheetgen", "https://www.npmjs.com/package/@spritesheetgen/cli"],
        "publisher": {"@type": "Organization", "name": "SpriteSheetGen", "url": SITE + "/"},
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD", "description": t["offer"]},
    }
    cast = "\n      ".join(
        f'<img src="{assets}media/{name}.webp" alt="{esc(alt)}" width="{w}" height="200">' for (name, w), alt in zip(CAST, t["alts"])
    )
    tool_rows = "\n        ".join(
        f'<tr><td><code>{name}</code></td><td class="{"paid" if name in PAID else "free"}">{t["paid"] if name in PAID else t["free"]}</td><td>{desc}</td></tr>'
        for name, desc in zip(TOOLS, t["tools"])
    )
    file_rows = "\n        ".join(f"<tr><td><code>{f}</code></td><td>{d}</td></tr>" for f, d in zip(FILES, t["files"]))
    nav = t["nav"]
    copy = json.dumps(t["copy"], ensure_ascii=False)
    return f"""<!doctype html>
<html lang="{meta['html']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(t['title'])}</title>
<meta name="description" content="{esc(t['description'])}">
<link rel="canonical" href="{url}">
{alternates}
<link rel="icon" href="{assets}favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(t['title'])}">
<meta property="og:description" content="{esc(t['og_desc'])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{PAGES}og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="dark">
<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>
<style>
@font-face {{ font-family: "Pixelify Sans"; src: url("{assets}media/pixelify-sans-500.woff2") format("woff2"); font-weight: 500; font-display: swap; }}
{CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="{site}/"><img src="{assets}favicon.svg" alt="SpriteSheetGen logo" width="28" height="28">SpriteSheetGen</a>
    <nav class="links" aria-label="Docs">
      <a href="#setup">{nav[0]}</a><a href="#tools">{nav[1]}</a><a href="#cli">{nav[2]}</a><a href="#export">{nav[3]}</a>
      <a href="https://github.com/terror668/spritesheetgen">GitHub</a><a href="https://www.npmjs.com/package/@spritesheetgen/cli">npm</a>
    </nav>
  </header>
  <nav class="langs" aria-label="{t['lang_label']}">{switch}</nav>

  <div class="hero">
    <p class="kicker">{t['kicker']}</p>
    <h1>{t['h1']}</h1>
    <p class="lead">{t['lead']}</p>
    <div class="stage">
      {cast}
    </div>
    <p class="caption">{t['caption']}</p>
    <div class="cta">
      <a class="btn" href="#setup">{t['cta_setup']}</a>
      <a class="btn ghost" href="{site}/">{t['cta_site']}</a>
    </div>
  </div>

  <section id="setup">
    <h2>{t['setup_h2']}</h2>
    <ol class="steps">
      <li>{t['step1']}
        <pre><code>{esc(t['prompt'])}</code></pre>
        {t['step1_after']}</li>
      <li>{fill(t['step2'])}</li>
      <li>{t['step3']}
        <pre><code>npx -y @spritesheetgen/cli login</code></pre></li>
    </ol>

    <h3>{t['byhand']}</h3>
    <div class="tabs" role="tablist" aria-label="MCP client">
      <button role="tab" aria-selected="true" aria-controls="t-claude" id="b-claude">Claude Code</button>
      <button role="tab" aria-selected="false" aria-controls="t-codex" id="b-codex">Codex</button>
      <button role="tab" aria-selected="false" aria-controls="t-json" id="b-json">{t['tab_json']}</button>
    </div>
    <div class="panel" role="tabpanel" id="t-claude" aria-labelledby="b-claude"><pre><code>claude mcp add spritesheetgen -s user -- npx -y @spritesheetgen/cli mcp</code></pre></div>
    <div class="panel" role="tabpanel" id="t-codex" aria-labelledby="b-codex" hidden><pre><code>codex mcp add spritesheetgen -- npx -y @spritesheetgen/cli mcp</code></pre></div>
    <div class="panel" role="tabpanel" id="t-json" aria-labelledby="b-json" hidden><pre><code>{esc(MCP_JSON)}</code></pre></div>
    <p class="muted">{t['setup_note']}</p>
  </section>

  <section id="tools">
    <h2>{t['tools_h2']}</h2>
    <div class="table"><table>
      <thead><tr><th>{t['th'][0]}</th><th>{t['th'][1]}</th><th>{t['th'][2]}</th></tr></thead>
      <tbody>
        {tool_rows}
      </tbody>
    </table></div>
    <p>{fill(t['tools_note'])}</p>
  </section>

  <section id="cli">
    <h2>{t['cli_h2']}</h2>
    <p>{t['cli_intro']}</p>
    <pre><code>{esc(CLI_BLOCK)}</code></pre>
    <p>{t['cli_gif']}</p>
    <pre><code>npx -y @spritesheetgen/cli export --file ./walk.gif --out ./assets/walk --name hero_walk --preview</code></pre>
  </section>

  <section id="export">
    <h2>{t['export_h2']}</h2>
    <div class="sheet"><img src="https://raw.githubusercontent.com/terror668/spritesheetgen/main/samples/little-knight-walk/sheet.png" alt="{esc(t['sheet_alt'])}" width="1260" height="140" loading="lazy"></div>
    <p class="muted">{t['sample']}</p>
    <div class="table"><table>
      <thead><tr><th>{t['th_files'][0]}</th><th>{t['th_files'][1]}</th></tr></thead>
      <tbody>
        {file_rows}
      </tbody>
    </table></div>
    <h3>Phaser 3</h3>
    <pre><code>{esc(PHASER)}</code></pre>
    <h3>Godot 4</h3>
    <p>{t['godot']}</p>
  </section>

  <section>
    <h2>{t['browser_h2']}</h2>
    <p>{fill(t['browser'])}</p>
  </section>

  <footer>
    <p>SpriteSheetGen · <a href="{site}/">spritesheetgen.com</a> · <a href="https://github.com/terror668/spritesheetgen/issues">{t['issues']}</a> · <a href="mailto:support@spritesheetgen.com">support@spritesheetgen.com</a></p>
    <p>{fill(t['license'])}</p>
  </footer>
</div>
<script>
var COPY = {copy};
document.querySelectorAll("pre").forEach(function (pre) {{
  var b = document.createElement("button");
  b.className = "copy"; b.type = "button"; b.textContent = COPY[0];
  b.addEventListener("click", function () {{
    var text = pre.querySelector("code").innerText;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {{
      b.textContent = COPY[1]; setTimeout(function () {{ b.textContent = COPY[0]; }}, 1500);
    }}).catch(function () {{ b.textContent = COPY[2]; }});
  }});
  pre.appendChild(b);
}});
var tabs = document.querySelectorAll('[role="tab"]');
tabs.forEach(function (tab) {{
  tab.addEventListener("click", function () {{
    tabs.forEach(function (t) {{
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }});
  }});
}});
</script>
</body>
</html>
"""


for lang, meta in LANGS.items():
    out = ROOT / "docs" / meta["dir"] / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page(lang))
    print("wrote", out.relative_to(ROOT))
