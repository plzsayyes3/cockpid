# 作業台 / Workbench

Repository: `plzsayyes3/cockpid`  
Former user-facing name: `COCKPID`

作業台は、個人の記録・Knowledge Systemそのものではなく、必要な道具や状態へ入るための **display / interaction layer** です。

- 方針の正本: [`DIRECTION.md`](./DIRECTION.md)
- 現在の実装棚卸し: [`SURFACES.md`](./SURFACES.md)
- Projectの正本: `plzsayyes3/my-storage-note/objects/projects/cockpid.md`

このREADMEは2026-09-15に現行Workbenchへ合わせて更新しました。旧Mission Control時代の詳細はGit履歴に残っています。

## Architecture

```text
SOURCE
  plzsayyes3/mynotebook
       │
       ▼
AI KNOWLEDGE SYSTEM
  plzsayyes3/my-storage-note
  ├─ brain
  ├─ objects
  ├─ memory
  └─ views
       │
       ▼
DISPLAY / INTERACTION
  plzsayyes3/cockpid
  └─ workbench/
```

### `mynotebook`

人間の一次記録の正本です。

主な利用先:

- `01_Daily/YYYY-MM-DD.md` — Daily Note
- `02_techo/` — My System Techo
- `00_inbox/` — Memo / Stan Voice Memo等の入口
- `09_taskchute/` — TaskLiner / TaskChute系データ

### `my-storage-note`

AIが整理したKnowledge Systemの正本です。

主な利用先:

- `brain/` — rules / coordination
- `objects/` — Canonical Project / Assignment / Task / Idea / Reference
- `memory/` — derived data / state
- `views/` — Cockpit等が読むread model
- `advice/` — daily advice

Project表示は原則 `views/` を利用し、Canonical Project MarkdownをCockpit側へ複製しません。

### `cockpid`

表示・操作層です。HOMEへすべての機能を詰め込まず、独立Appへ入るための静かな作業台として扱います。

## Live entry point

GitHub Pagesのroot `index.html` は `./workbench/` へリダイレクトします。
`workbench.html` という単一の入口ファイルは存在しません。実際の入口は
`workbench/index.html` です。

現行HOME:

- `workbench/index.html`

Runtime routingの正本:

- `workbench/app-routing.js`

現在のDock / routing:

| Key | App | Route / behavior |
|---|---|---|
| 1 | Calendar | `workbench/calendar.html` |
| 2 | Tasks | `workbench/taskliner-bridge.html` → external TaskLiner |
| 3 | Zen | external `zen-note` |
| 4 | News | external `My_Internet_place` |
| — | Advice | Dock外。Mail Statusから `workbench/advice.html` |
| 5 | On Hand | `workbench/onhand.html` |
| 6 | Dictionary | `workbench/dictionary.js` / StickS3 Voice Capture dictionary editor |
| 7 | Projects | `workbench/backstage.html` — Overview / Town status |
| 8 | Thinking | `workbench/thinking.html` — ideas / themes / questions / hypotheses / actions |
| — | Project Town | `workbench/project-town.html` — standalone compatibility view |
| 9 | Keyboard | external `https://plzsayyes3.github.io/Keyboard/?v=c83f529` — 作業台App枠内に薙刀式練習サイトを直接表示 |
| 0 | Secret Desk | local easter egg |

`5=On Hand / 6=Dictionary / 7=Projects / 8=Thinking / 9=Keyboard` が現在値です。Stanはヘッダーの電池型Settingsアイコン横にあるマイクアイコンから開けます。Project Townは7番の詳細画面に統合し、旧URLは互換用に残しています。旧Boardはヘッダーのステータスボタンから開けます。

## HOME principle

HOMEは「全部を監視するMission Control」ではなく、必要な道具を必要なときだけ出す作業面です。

- HOMEへ各Appの詳細機能を重複実装しない
- 今日・今・入口として意味のある情報だけを置く
- Projectの正本をCockpitへ複製しない
- 各Appは必要に応じて直接URLでも開ける
- スマートフォンでは独立Appを全画面で扱える構造を基本とする

## Project surfaces

### Area-first Project entry

Projects, Assignments, and Tasks are read from the Area projection when
`my-storage-note/views/areas.json` is available. The Project surface groups
sibling records under declared Areas and keeps records without an Area in an
explicit unassigned section. Backstage is intentionally a Project-only index and
detail/handoff surface; Assignment and Task siblings remain visible through the
Area/Project Town views and are not silently promoted into Backstage's Project
list. The adapter preserves the legacy Project detail and handoff behavior; if
the Area projection cannot be loaded, it falls back to the configured Project
source without changing source data. A custom Project source always wins over
Area-first loading for compatibility.

### Projects / Backstage

Projectの一覧・詳細画面です。旧Backstageを親画面として、OverviewとTown / Statusを切り替えます。BackstageはArea-firstのProject-only index/detail/handoffで、Assignment・Taskの兄弟はArea/Project Town側の導線で確認します。実装内にlegacyの `gpts/projects` ラベルが残る箇所がありますが、`project-source-adapter.js` が標準設定では `my-storage-note/views/projects.json` へ読み替えます。カスタムProject source設定がある場合は既存sourceを優先します。

Canonical Projectは `my-storage-note/objects/projects/` です。

### Project Town / Status

Projectのactivity / momentum等を眺める表示です。Projectsの詳細画面に統合され、Project read modelはBackstageと同じKnowledge Systemを基準にします。`workbench/project-town.html` は既存ブックマーク向けの独立入口として残します。

### Memo Area routing

WorkbenchのMemo / Inboxでは、Area選択後にProject / Assignment / Task / Reference / Principleの分岐を記録・表示します。routeはブラウザの`cockpid.memo-routes.v1` sidecarに保存し、Inbox本文・ファイル名・保存先の既存semanticsは変更しません。

## Stan / スタンちゃん

`workbench/stan/` はヘッダーのマイクアイコンから開く独立全画面のstandby surfaceです。9番は `Keyboard` の薙刀式練習サイトを作業台App枠内に直接表示します。`workbench/keyboard.html` は既存ブックマーク向けの互換リダイレクトとして残します。

現在実装済み:

- ピクセル風の両目
- 自律視線・微細な動き・不規則な瞬き
- 任意のフロントカメラ
- MediaPipe Face Detectorによる顔位置検出と視線追従
- カメラOFF / 拒否 / 失敗時の自律フォールバック
- 待機中シングルタップでStanメニュー
- 待機中ダブルタップでWeb Speech Recognition開始
- 最大3分の音声セッション
- `end` / `no-speech` 後、期限内なら認識再開を試みるsession wrapper
- 録音中シングルタップで一時停止 / 再開。一時停止中は残り時間も停止
- 録音中ダブルタップで終了
- 左HUDに `REC / PAUSE` と残り時間
- 目の下に1行のライブ文字起こし。全文は内部保持
- 終了または3分上限で `mynotebook/00_inbox` へ自動保存
- 保存失敗時は未送信文字列と送信先ファイル名をlocalStorageへ保持し、オンライン復帰・再フォーカス・次回録音開始時に同じファイル名で再送
- 5分ごとの更新確認。録音・送信・メニュー操作中はリロードを保留

`送る` ボタンはありません。音声メモのファイル名はJSTの
`YYYYMMDDHHMMSSmmm.md` とし、同一秒内の送信衝突を避けます。この形式はWorkbenchの
Inbox → Daily統合でも処理対象です。

iPhone Safariで長めの無音区間を挟んだ際のSpeech Recognition再開可否など、
ブラウザ依存挙動は実機で問題が出た場合に再確認します。Stan領域自体は現在いったん完了扱いです。

## Authentication

Workbenchと関連Appは、同一GitHub Pages origin上で共通のbrowser-side token keyを利用します。

```text
localStorage['zen-note-github-token']
```

トークン自体をこのRepositoryへ保存しません。

利用機能に応じて、fine-grained PATには `mynotebook` / `my-storage-note` のContents権限が必要です。MemoやStanからInboxへ書く場合は `mynotebook` のwrite権限が必要です。

GitHub APIでは、fine-grained PATのアクセス不足が `403` ではなく `404` に見える場合があります。`404 = ファイルが存在しない` と即断しないでください。

## Standalone / legacy root files

Workbenchへの移行前のroot-level実装が一部残っています。**現在のWorkbench仕様を判断するときはrootの旧画面ではなく `workbench/`、`DIRECTION.md`、`SURFACES.md` を基準にします。**

主な扱い:

- `calendar.html` / `calendar.js` / `calendar.css` — Workbench Calendarにsupersedeされた旧実装
- `main.html` — 旧Mission Control UI。現行HOMEではない
- `index-00.html`, `pattern-*`, `prototype-*`, `refined.html` — 旧UI検討・参照系。現行entry pointではない
- `board.html` — Workbenchの6 / Boardとは別物の、独立したDeck Board 16×16

削除・archiveの可否はファイルごとに異なるため、単に古いという理由では削除しません。詳細な生存判定は `SURFACES.md` を参照してください。

## Deck Board 16×16 (`board.html`)

rootの `board.html` はWorkbench Boardとは別の独立ツールです。

- 少数のカードを16×16 lattice上へ配置して考える
- deck stateはbrowser `localStorage` を利用
- extracted dataからカードを読み込める
- export時は `mynotebook/00_inbox` へ戻せる

同名のWorkBench Board (`workbench/board.js`) と混同しないでください。

## Security

- personal source notesをこのRepositoryへコピーしない
- GitHub tokenをcommitしない
- token値が見えるスクリーンショットを共有しない
- tokenを露出した場合はGitHubでrevoke / regenerateする
- browser-side tokenのキーを機能ごとに増殖させず、既存の共有キーとの整合を確認する

## 2026-09-18 whole-workbench review

ライブ経路を横断レビューし、ON HAND以外にも次を修正しました。

- TaskLinerの旧 `task-data` branch設定を `main` へ移行
- Calendarの一時的な読込失敗を空予定 / `TECHO LIVE` と誤表示しないよう修正
- Stan / Home / Zen Memoのミリ秒付きInboxファイルをDaily統合できるよう統一
- Project TownのAI引継ぎ文をCanonical Project pathから生成
- iframe内Adviceの `← WORKBENCH` でWorkbenchを入れ子にしない
- Settings / Memo操作中の数字キーDock shortcutを抑止
- 変更したライブJSへcache-busting versionを付与
- Adviceは本文取得成功後にだけ既読化
- Projects / Project Townは部分読込失敗を `PARTIAL / READ ERROR` と表示
- CalendarのHOME / DAY / WEEK / MONTH / FULL MONTHで同一予定の重複表示ルールを統一
- Stanは送信失敗メモを永続化し、新規録音より再送を優先

## Maintenance rules

実装変更後は、次の順で整合を確認します。

1. 実コード
2. `SURFACES.md` — 実装棚卸し
3. `DIRECTION.md` — 方針との整合
4. `my-storage-note/objects/projects/cockpid.md` — Canonical Project Current / Next / History
5. 必要なら関連Project（例: `voice-capture.md`）
6. `my-storage-note/brain/coordination/cockpid-board.md` — worker / lock / handoffの現在値
7. `views/projects.json` — `objects/**` 更新後のBuild Viewsで再生成されることを確認

実装済みなのにProjectログが「未実装」のまま、または古いLOCKが`WORKING`のまま残る状態を避けます。
