# COCKPID Workbench — redesign/workbench

このブランチは、COCKPIDを「分析ダッシュボード」から「自分専用の作業台 / 個人OS」に再設計する工事用ブランチ。

`main` は現行安定版として維持する。

## 中心コンセプト

> 考えがまとまっていても、まとまっていなくても、とりあえず開ける自分の机。

COCKPIDは全データや全機能を抱え込まない。既存リポジトリ・データソース・自動処理を呼び出す Shell / Workbench として振る舞う。

## HOME

HOMEは巨大ダッシュボードにしない。

現在の中心要素:
- 分類前Quick Capture → `mynotebook/00_inbox/` へ直接保存
- 今日のTecho
- News / Workshop の最小状態表示
- Resident
- 1 / 2 / 3 / 4 / 5 / 9 のアプリDock

`A hint from myself` の常設表示は廃止し、過去のIdeaはResidentをタップしたときだけ出す。
Residentは画面内をドラッグ / タッチで自由移動でき、位置をlocalStorageに保存する。

## Apps

### 1 Calendar
既存 `calendar.html` を利用。SOURCE: `mynotebook/02_techo/YYYY-MM.md`

### 2 Tasks
工事中。Techo / TaskChuteなど既存のタスク管理を複製せず、今日の実行へ入る作業台にする。

### 3 Zen
既存 `plzsayyes3/zen-note` を利用。

### 4 News
工事中。朝・昼・夜のニュース、雑多なザッピングをまとめる。

### 5 AI Advice
`my-storage-note/advice/YYYY-MM-DD.md` を直接読む独立ページ `advice.html`。
メールボックス型UIで、PCは左に受信一覧・右に本文、スマホは一覧→本文の1画面遷移。
既読状態はlocalStorageに保持する。

### 9 ???
説明しすぎない遊びの部屋。

## PC / Mobile

アプリ本体は独立URLを持たせる。
Workbenchからの起動UIは今後、PCでは右側のApp Drawer、スマホではフルスクリーンへ適応させる方向を検討する。
同じアプリ内容をPC / Mobileで二重実装しない。

## 原則

1. `main` の正常動作を壊さない。
2. SOURCEをCOCKPIDへ複製しない。
3. 各リポジトリの独立性を維持する。
4. HOMEを巨大ダッシュボードにしない。
5. 自動処理と、人間が考える場所を分ける。
6. 生産性だけでなく遊びを残す。
7. 工事中の部屋は工事中のまま見せてよい。
