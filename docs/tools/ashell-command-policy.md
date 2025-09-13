# a-Shell Command Policy v1.0 (Working Copy Edition)

この文書は **iOS の a-Shell** で“確実に動く”実行だけに絞り、**Git 操作は *Working Copy* に全面委任**する運用方針です。
目的は **Copy & Paste しても壊れにくい手順**で、初心者でも迷わず再現できること。

---

## 0. 前提（このプロジェクトの約束）

- **Git は使わない**（a‑Shell 側では `git` / `lg` / `lg2` を前提にしない）。  
  バージョン管理・コミット・プッシュは **Working Copy** アプリで行う。
- a‑Shell は **ローカル作業（編集/整形/テスト/簡易サーバ）専用**。  
  長文の投入には **エディタ（pico/vim）** または **クリップボード（pbpaste）** を使う。
- 外部フォルダは **Sandbox/ブックマーク** 機能で開く（`pickFolder` → `bookmark` → `jump` / `cd ~<mark>`）。
- 利用可能コマンドは端末で `help -l` して現物確認する。

---

## 1. ゴールデンルール

1) **VCS を a‑Shell に持ち込まない**  
   - “Git っぽい”コマンドを探さない。**Working Copy でやる**と決める。
2) **未搭載/相性悪コマンドの代替を常備**  
   - `which` → **Python**: `import shutil; print(shutil.which("cmd"))`
   - `printf` → **Python**: `print(...)`（または単純用途は `echo`）
   - `nl` → **awk**: `awk '{print NR, $0}'`
   - `test` / `[ … ]` → **Python**: `from pathlib import Path; print(Path("x").exists())`
3) **長文は Heredoc 乱用を避ける**  
   - 画面で貼るなら **pico/vim**、他アプリからは **pbpaste > file** が安全。
4) **外部フォルダはブックマーク経由**  
   - `pickFolder` → `bookmark spk` → 次回から `jump spk` / `cd ~spk`。

---

## 2. 推奨・非推奨（抜粋）

| 用途 | 非推奨（または不使用） | 採用方針 / 代替 |
|---|---|---|
| バージョン管理 | `git`, `lg`, `lg2` | **Working Copy** でコミット/プッシュ |
| 位置検索 | `which` | **Python** `shutil.which` |
| 行番号付加 | `nl` | **awk** `awk '{print NR, $0}'` |
| 整形 | `printf` | **Python** `print()` / `echo` |
| 条件分岐 | `test` / `[ … ]` | **Python** `pathlib.Path(...).exists()` |
| 長文投入 | `cat <<'EOF' ... EOF` | **pico/vim** または **pbpaste > file** |
| 外部フォルダ移動 | 生パス直指定 | **`pickFolder`→`bookmark`→`jump`/`cd ~mark`** |

> 端末差を吸収するため、**Python/awk ベース**の代替を標準化します。

---

## 3. よく使うスニペット（1行ずつ安全に）

### 3.1 ブックマークで目的地を開く（初回のみ）
```sh
pickFolder
```
```sh
bookmark spk
```
> 次回以降は：
```sh
jump spk        # または  cd ~spk
```

### 3.2 長文ファイルの作成
**エディタ方式**
```sh
mkdir -p docs/tools
```
```sh
pico docs/tools/ashell-command-policy.md    # 貼り付け → Ctrl+O → Enter → Ctrl+X
```

**クリップボード方式**
```sh
mkdir -p docs/tools
```
```sh
pbpaste > docs/tools/ashell-command-policy.md
```

### 3.3 代替コマンド例（現物確認）
```sh
help -l | grep bookmark
```
```sh
python3 - <<'PY'
import shutil; print(shutil.which("python3"))
PY
```
```sh
echo "a
b
c" | awk '{print NR, $0}'
```

---

## 4. a‑Shell でやること / Working Copy でやること

### a‑Shell（やる）
- `python3 -m http.server 8080` でローカル検証（`Ctrl+C` で停止）
- 簡易スクリプト実行、ファイル整形、テキスト前処理
- `pico` や `pbpaste` での文書作成・編集

### Working Copy（やる）
- 変更の **ステージ/コミット/プッシュ（VCS 全般）**
- ブランチ、差分確認、リモート管理

> “**編集と検証は a‑Shell**、**履歴管理は Working Copy**”に役割分担。迷いを断ちます。

---

## 5. トラブル対処（FAQ）

- `which: command not found` → Python で代替：  
  `python3 -c "import shutil; print(shutil.which('cmd'))"`
- Heredoc で貼り付けが固まる → **Ctrl+C** で抜け、**pico/pbpaste** に切り替える。
- 改行・インデント崩れ → **1 行ずつのコードブロック貼り**を徹底する。

---

## 6. 運用の型（Next Step）

1. **docs 直下の「運用索引」へ本ポリシーへのリンクを追記**  
2. 端末の `help -l` 出力を `docs/tools/ashell-command-inventory.md` に **append-only** で保存  
3. README の “長文貼り付けの作法” を **pico/pbpaste 推奨**で簡潔に明記

---

*このポリシーは “壊れない実行” を最優先に設計されています。必要に応じてアップデートしてください。*
