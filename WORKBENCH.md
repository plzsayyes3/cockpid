# COCKPID Workbench — redesign/workbench

このブランチは、COCKPIDを「分析ダッシュボード」から「自分専用の作業台 / 個人OS」に再設計する工事用ブランチ。

`main` は現行安定版として維持する。

## 中心コンセプト

> 考えがまとまっていても、まとまっていなくても、とりあえず開ける自分の机。

COCKPIDは全データや全機能を抱え込まない。既存リポジトリ・データソース・自動処理を呼び出す Shell / Workbench として振る舞う。

## 構造

- `index.html` — 新しい HOME / WORKBENCH
- `system.html` — 再設計前のCOCKPID。SYSTEM / WORKSHOPとして保存
- `calendar.html` — My System Techo を読む既存カレンダー
- `workbench.css` — ライトモード、紙・手帳・Notion系の新デザイン
- `workbench.js` — HOMEウィジェット、アプリランチャー、キーボード操作
- `zen-memo.js` / `zen-memo.css` — 既存Quick Memoを再利用

## Apps

### 1 Calendar

既存 `calendar.html` をアプリウィンドウ内で開く。

SOURCE: `mynotebook/02_techo/YYYY-MM.md`

### 2 Tasks

工事中。

Techo / TaskChuteなど既存のタスク管理をCOCKPIDへ複製せず、今日の実行へ入る作業台にする。

### 3 Zen

既存リポジトリをそのまま使う。

- repo: `plzsayyes3/zen-note`
- app: `https://plzsayyes3.github.io/zen-note/`

Workbenchではiframeアプリとして起動する。

Quick CaptureだけはHOMEにも置き、既存 ZEN V2 Quick Memo を利用して `mynotebook/00_inbox/YYYYMMDDHHMMSS.md` へ保存する。

### 4 News

工事中。

朝の興味関心ニュース、昼の保育ニュース、夜の軽い提案、雑多なザッピングをまとめる部屋にする。

### 9 ???

説明しすぎない遊びの部屋。

初期版では小さな「今日の謎」を実装。

## HOME widgets

初期実装:

- 現在日時
- 今日のTecho予定
- 最新のIdea 1件を「思考のヒント」として表示
- 分類前Quick Capture
- Workshop状態
- Resident / デスクトップペット
- 1 / 2 / 3 / 4 / 9 のアプリDock

## 入力思想

HOME中央のQuick Captureでは、入力時に「タスク」「予定」「メモ」「アイデア」を決めない。

まず `00_inbox` に置き、整理・昇格・日付決定は後段で行う。

## PC / Mobile

PCは机全体を3カラムで見る。

スマホは同じ情報を1カラムへ落とし、画面下部Dockを常時表示する。

機能構造はPC/スマホで共通にする。

## Keyboard

入力欄にフォーカスしていないとき:

- `1` Calendar
- `2` Tasks
- `3` Zen
- `4` News
- `9` ???
- `Esc` アプリを閉じる

## 原則

1. `main` の正常動作を壊さない。
2. SOURCEをCOCKPIDへ複製しない。
3. 各リポジトリの独立性を維持する。
4. HOMEを巨大ダッシュボードにしない。
5. 自動処理と、人間が考える場所を分ける。
6. 生産性だけでなく遊びを残す。
7. 工事中の部屋は工事中のまま見せてよい。
