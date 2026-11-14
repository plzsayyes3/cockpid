# DUO Planner Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** 上部の手帳アイコンから、左TaskLiner・右Dailyを独立して使う全画面モードを開く。
**Architecture:** 第1段階のTaskLinerインスタンスを再利用し、Daily編集部品と並べる。画面幅700px以上で1:1、未満で9:1（細い帯は44px以上）。レイアウト変更で部品を再生成しない。
**Tech Stack:** buildless ES modules、Shadow DOM、Node test、既存GitHub Contents API。
**Spec:** docs/superpowers/specs/2026-11-14-duo-planner-design.md および承認済みduo-planner-spec.html v0.2。

## Global Constraints
- メモは既存Daily。左右の日付・スクロール・入力を独立して保持。
- 表示方式は幅のみで決め、キーボードによる高さ変化では変更しない。
- 通常Tasksと手帳左ページで同一インスタンスを使う。
- Daily正本は設定済みdaily source（既定mynotebook/main/01_Daily/YYYY-MM-DD.md）。ローカルdraftは復旧用で正本を複製しない。
- 認証情報は既存作業台Tokenを利用。公開コードへ個人データを含めない。
- 本番には自動反映せず、既存確認用PR #19を更新する。

## Review Focus
- 入力中の日付移動・遅いPull結果：対象日を取り違えず本文を残す。
- 保存中編集・外部更新：古い結果でcleanにせず、SHA競合で停止。
- 狭い側の入力要素：フォーカス不可にし、帯から確実に切り替える。
- IME変換中の切り替え：確定入力を失わず、DOMを作り直さない。
- 通常Tasksへの往復・画面幅変更：タイマーやタスク状態を二重化しない。

### Task 1: 幅と主役側の状態モデル
Files: workbench/planner/layout.js、layout.test.js
Interface: layout(width,focus) -> {mode,focus,columns,collapsed}。
- [x] 700/699px境界、44px帯、左右固定と主役変更のテストを先に書き失敗を確認。
- [x] 幅だけで判断するモデルを実装しテスト成功を確認。

### Task 2: Dailyの読み書き
Files: workbench/planner/daily-store.js、daily-store.test.js、daily-view.mjs、daily.css
Interface: createStore({storage,fetch,source,token,onChange}) -> get(date),load(record),edit(record,text),save(record),rememberView(record,state)。全操作はrecordの日付とパスへ固定。
- [x] 既存Markdownの保持、SHA競合、保存中編集、日付移動中のPull、ローカルdraft復元、保存/Pull直列化を失敗から成功へ。
- [x] 全文Markdownエディター、独立日付、保存状態・再読込・コピー、5秒アイドル保存を接続。自動保存はIME確定後。

### Task 3: 手帳画面と入口
Files: workbench/planner/controller.mjs、planner.css、integration.test.js、workbench/index.html、app-routing.js、navigation.js
- [x] 手帳入口、内部TaskLiner再利用、幅判定、フレームなしの契約テストを追加し失敗を確認。
- [x] 全画面の手帳画面、左右独立、帯タップ、上部アイコンで通常画面へ戻る動作を実装。
- [x] 関連テスト・全体テストを実行し、既存9失敗との比較、ブラウザで広狭・入力・日付独立・往復を確認。
- [x] レビュー指摘を修正し、同じ作業ブランチとPR #19へ送信。
