# shorts-player-kit — *AI-New Era Playbook v2* (iOS-first)

> **目的**: iOS（Textastic × Working Copy × a‑Shell）だけで “短編プレイヤー” を**小粒に日課化**して育てる。  
> **運用原則**: 「**Move 37**（一歩先の工夫）を**毎日1フェーズ**」。**小さく編集 → すぐPush → すぐ検証**。

- **公開URL**（GitHub Pages / プロジェクトサイト）  
  `https://yusukefujiijp.github.io/shorts-player-kit/`
- **Source**: `main`（単独運用のため基本1ブランチ運用）
- **検証端末**: iOS / Safari

---

## 🫀 Heartbeat（空コミット代替の“接触記録” / Append-only）
<!-- APPEND-ONLY: heartbeat -->
- **Last touched (JST)**: 2025-09-10 06:19:15 UTC+09:00
- *使い方*: 差分が無い日も **上行の時刻だけを更新**して Commit → Push。Working Copy でも空コミット相当が実現できる。  
- *補助スクリプト（a‑Shell任意）*:
  ```bash
  python3 - <<'PY'
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
stamp = datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S JST")
p = "README.md"
tgt = "*Last touched (JST)*:"
lines = open(p, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if tgt in line:
        lines[i] = f"- **Last touched (JST)**: {stamp}"
        break
open(p, "w", encoding="utf-8").write("\n".join(lines)+"\n")
print("updated:", stamp)
PY
  ```

---

## 🧭 追記場所ガイド（迷わないための地図）

> **ここを見れば、何をどこに書くか一目で判る。** 追記は**該当セクションの「Append-only」ブロックへ**。

1. **決定事項の更新** → [0. いまの決定事項](#0-いまの決定事項source-of-truth) の **Append-only**。  
2. **Git/コミット運用ルール** → [4. Git/GitHub 運用規範](#4-gitgithub-運用規範コミット規範--ai-commit-master)。  
3. **Pages公開の作業記録** → [5. Pages デプロイ](#5-pages-デプロイgithub-actions) の **Deployment Journal**。  
4. **OG画像/ファビコン等の資産更新** → [6. アセット運用](#6-アセット運用og画像favicon-他) の **Assets Journal**。  
5. **日次の到達点・学び** → [10. 日次チェックポイント](#10-日次チェックポイントappend-only) の **Append-only**。  
6. **不具合や対処メモ** → [7. トラブル対処集](#7-トラブル対処集faq--troubleshooting)。  
7. **次の一手（ロードマップ）** → [9. フェーズ別ロードマップ](#9-フェーズ別ロードマップone-phase-per-day)。

---

## 0. いまの決定事項（Source of Truth）

- **TTS 速度規範**: 役割別**絶対レート**のみ使用（`0.5–2.0`, step `0.1`, 既定 `1.4`）。UIは **Role Rate ×** のみ。  
- **ページ規約**: `Page 1 = Play専用`。Opening/Transition/Closing は**純エフェクト**（title/narr/symbolなし）。  
- **スキーマ**: `schema v2.7` 系。`scenes.json` 一元読み込み（インラインJSON禁止）。  
- **iOS動作**: `file://` は避け、**a‑Shell の http.server** で `http://127.0.0.1:8080` から開く。  
- **公開**: GitHub Pages（Source=**GitHub Actions**）。`static.yml` でルート全配信（`path: '.'`）。  
- **ドメイン**: すべて **yusukefujiijp** に統一（誤綴り `yusukefuijijp` を禁止）。

<!-- APPEND-ONLY: decisions -->
- *(Append here / ここに決定事項を箇条書きで追記する)*

---

## 1. フォルダ構成（現状スナップショット）

```
shorts-player-kit/
├─ assets/           # 画像・音源など（og-image.png, favicon.svg/.ico など）
├─ backup/           # 旧ファイルの退避先（zip等） ※公開除外
├─ content/          # 台本のアーカイブ群（DayX_YYYYMMDD.json など）
├─ dev/              # 開発メモ、テンプレ、検証用ファイル
├─ docs/             # 仕様や手順メモ（外部共有向け）
├─ js/
│  ├─ _archives/                 # 旧版JSの保管
│  ├─ debug_config.js            # デバッグUIのゲーティング設定（コードのみで切替）
│  ├─ debug_panel.js             # 底部デバッグパネル本体（Role Rate× / Voice など）
│  ├─ global-zoom-guard.js       # （任意）iOS向けズーム/セーフエリアの軽ガード
│  ├─ player.core.js             # プレイヤ中枢（再生・待機・TTS結線）
│  ├─ README.md                  # jsフォルダ専用 README（最新仕様）
│  ├─ scene-effects.js           # エフェクトレジストリ（light-in / flame-out 等）
│  └─ tts-voice-utils.js         # 声カタログ & 役割別レート・エンジン
├─ releases/        # 配布物やタグ候補（空でもOK）
├─ index.html       # エントリ（script 読み込み順は 3. を厳守）
├─ scenes.json      # 現行の台本（例：第六日 / Day6）
├─ schema.json      # スキーマ（v2.7 相当）
└─ style.css        # 最小スタイル
```

> **メモ**: 最新時点で `scenes.json` は **第六日（Day6）**。`content/` に日付入りでアーカイブ。

---

## 2. 主要コンセプト

- **役割別レート一本化**  
  - 実行系: `rateFor(role)` → `tts-voice-utils.getRateForRole(1.0, role)`  
  - 範囲: **0.5–2.0**, 既定 **1.4**, step **0.1**。  
- **Voice UI の統合**  
  - `Voice: [✓] Tag <select>  [✓] TitleKey <select> …` の一列配置。  
  - `Auto` は `__ttsUtils.pick(role)` に委任（安定ID: `voiceURI > lang|name > name`）。
- **Move 37 運用**  
  - *Always Be Shipping*: 小粒（1–10ファイル）で**即Push/即検証**。  
  - 破壊的変更は短命ブランチで隔離→速やかにmerge。

---

## 3. `<script>` の読み込み順（必ずこの順）

```html
<!-- 1) TTS voice catalog & chooser -->
<script src="./js/tts-voice-utils.js" defer></script>
<!-- 2) Visual effects engine (Promise-based) -->
<script src="./js/scene-effects.js" defer></script>
<!-- 3) Player core (fetch scenes.json, render, playback, TTS) -->
<script src="./js/player.core.js" defer></script>
<!-- 4) Debug config (code-side gating; read-only) -->
<script src="./js/debug_config.js" defer></script>
<!-- 5) Debug UI (collapsible panel; respects config) -->
<script src="./js/debug_panel.js" defer></script>
<!-- 6) Host zoom/gesture guard (recording-friendly) -->
<script src="./js/global-zoom-guard.js" defer></script>
```

---

## 4. Git/GitHub 運用規範（コミット規範 & AI-Commit Master）

- **Summary（英語1行）**: `<type>(<scope>)<!>: <imperative>`（句点なし／50字目安／72字上限）。  
- **Detail（日本語）**: 先頭に **日本語版Summary（直訳）** を必ず置く。  
- **主要type**: `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|deps`。  
- **ミニ辞書**: *feat=機能*, *fix=修正*, *docs=文書*, *style=体裁*, *refactor=作り替え*, *test=テスト*, *chore=雑務*…  
- **テンプレ**:

```
Summary: <type>(<scope>)<!>: <imperative English summary>
Detail:
【直訳】<type和訳>(<scope>): <和訳Summary>
【要約】<1行で>
【理由】<課題/選定理由/代替案却下理由>
【学び・Nuance】<英語typeの意図/検証結果/再発防止>
```

> **Working Copy** は空コミット不可。**Heartbeat の時刻を更新**すれば小差分でコミット可能（推奨）。

---

## 5. Pages デプロイ（GitHub Actions）

- **設定**: Settings → Pages → Source: **GitHub Actions**。  
- **workflow**: `.github/workflows/static.yml`（`path: '.'` でルート配信）。  
- **成功判定**: ActionsのRunが緑**Success** かつ **Deploy to GitHub Pages** が緑。  
- **URL**: `https://yusukefujiijp.github.io/shorts-player-kit/`。

### Deployment Journal（Append-only）
<!-- APPEND-ONLY: deploy -->
- 2025-09-10: Meta/Twitterカード検証済み（FB/Twitterとも正常）。

---

## 6. アセット運用（OG画像／Favicon 他）

- **OG画像**: `assets/og-image.png`（推奨: 1200×630, 16:9 もOK, 500KB以下）。  
- **favicon**: `assets/favicon.svg`（SVG推奨、`.ico` も併用可）。  
- **HTMLヘッダー**（`index.html`）の要点:  
  - `<link rel="canonical" href="https://yusukefujiijp.github.io/shorts-player-kit/">`  
  - `<meta property="og:url" content="…/shorts-player-kit/">`  
  - `<meta property="og:image" content="…/assets/og-image.png">`  
  - `<meta name="twitter:image" content="…/assets/og-image.png">`（**og:image と同一**）

### Assets Journal（Append-only）
<!-- APPEND-ONLY: assets -->
- 2025-09-10: OG画像とTwitter画像のURLを統一／SVGファビコンをSPK版に最適化。

---

## 7. トラブル対処集（FAQ & Troubleshooting）

- **404（公開URL）**: `index.html` がリポ直下か、`static.yml` の `path: '.'` を確認。  
- **ドメイン誤記**: `yusukefujiijp` への統一（誤: `yusukefuijijp`）。  
- **カードが古い**: Facebook Debuggerの **Scrape Again** ／ Twitter Cardの再検証。  
- **Actionsで失敗**: どのステップで赤×か確認（`Upload artifact` の path ミスなど）。  
- **iOSでTTS無音**: 初回タップ未実行／サイレントモード／TTSフラグOFF。

---

## 8. iOS ローカル検証（Textastic × Working Copy × a‑Shell）

1. **編集**: Textastic で Working Copy の `shorts-player-kit` を直接編集。  
2. **サーバ**: a‑Shell で以下を実行。  
   ```bash
   cd ~/Documents/shorts-player-kit
   python3 -m http.server 8080
   ```
3. **再生**: Safari で `http://127.0.0.1:8080/index.html` を開く（`file://` 禁止）。  
4. **ループ**: Textasticで保存 → Safariでリロード。初回は任意クリックでTTS解錠。

---

## 9. フェーズ別ロードマップ（One Phase Per Day）

- **Phase 0**: 公開URL/Meta/Actions 成功の確認（完了）。  
- **Phase 1**: `.gitignore` 追補（`backup/**`, `*.zip`, `.DS_Store` 等）＋ 404 に「トップへ戻る」。  
- **Phase 2**: `scenes.json` を Day7 へ差替え、Day6 を `content/` にアーカイブ。  
- **Phase 3**: デバッグUIの既定値再確認（役割別のみ／基準レートUIは非表示）。  
- **Phase 4**: Voice固定マップ導入（再現性向上）。  
- **Phase 5**: 最小E2E検証スクリプト（再生/停止/シーン遷移）。

<!-- APPEND-ONLY: roadmap -->
- *(Append here / 以降のPhase計画を追記)*

---

## 10. 日次チェックポイント（Append-only）

> **書式**: `YYYY-MM-DD: <一行の到達点> — <学び/課題/次アクション>`

<!-- APPEND-ONLY: daily -->
- 2025-09-10: Pages公開/OG/Twitterカード検証を記録 — 次は `.gitignore` と 404 を整備。

---

## 11. SNSメタタグ検証ログ（完成判定の根拠）

- **Facebook Sharing Debugger**: `og:url/title/description/image` 正常。`fb:app_id` 未設定は運用上無視可。  
- **Twitter Card Validator**: `summary_large_image` 認識・プレビュー正常。  
- **整合性**: canonical / og:url / og:image / twitter:image の**完全一致**。

---

## 12. 用語集（Glossary）

- **Move 37**: “定跡を一歩外す最小の創造”。小さく早い改良を日々積む姿勢。  
- **Role Rate ×**: 役割別の絶対レートをUIで直接調整する方式。

---

## 13. ライセンス / 著作

- © 2025 shorts-player-kit authors. All rights reserved.  
- 公開ポリシーは後日 `LICENSE` に明記（現状は私的検証用途）。
