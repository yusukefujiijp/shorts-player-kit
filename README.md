# shorts-player-kit (iOS-first)

短編プレイヤーの**最小デモ**。iOS（Textastic × Working Copy × a-Shell）だけで、**小粒に編集 → すぐ Push → すぐ検証**。  
本リポジトリは **Activation Gate**／**visualViewport 連携**／**Render Contract v1.1** を核に、TTS 読了優先の体験を提供します。

- **Live**: https://yusukefujiijp.github.io/shorts-player-kit/
- **Docs**: see [`docs/`](./docs)
  - [Playbook](./docs/README.playbook.md) — 日々の運用ガイド（Heartbeat 含む）
  - [Commits](./docs/COMMITS.md) — Conventional Commits + 日本語 Detail 規範
  - [Pages](./docs/PAGES.md) — GitHub Pages（Actions）手順
  - [Assets](./docs/ASSETS.md) — OG 画像 / Twitter カード / Favicon
  - [a-Shell](./docs/ASHELL.md) — iCloud パス & ワンライナー集

---

## What’s inside（最重要だけ）
- **Activation Gate**：初回タップで TTS/Audio を解錠（Safari の自動再生要件を単一ジェスチャで満たす）
- **Render Contract v1.1**：HTML 構造は固定、見た目は `style.css` が単一ソース、JS は状態遷移と属性付与のみ
- **visualViewport × dvh × safe-area**：オンスクリーンキーボードや UI の出入りでも“潜らない下端”
- **TTS 読了保証**：句点で分割 → 再生 → “静寂ゲート”で読了確認 → `postDelayMs` → 次シーン

> 仕様詳細は `js/` の README を参照 → [`js/README.md`](./js/README.md)

---

## Quick Start（local on iOS）
```bash
# a-Shell
cd ~/Documents/shorts-player-kit
python3 -m http.server 8080
# Safari → http://127.0.0.1:8080/