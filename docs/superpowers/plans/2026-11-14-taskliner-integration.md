# TaskLiner内部統合 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** 既存データ・操作を保ち、作業台のTasksを内部部品で表示する。
**Architecture:** 現行のパッチを静的展開してShadow DOMへmount。同期は日付を引数に取り、通常Tasksと将来の手帳で同一インスタンスを共用する。
**Tech Stack:** buildless JavaScript、ES modules、Shadow DOM、Node test。
**Spec:** docs/superpowers/specs/2026-11-14-duo-planner-design.md

## Global Constraints
- 既存localStorageキー、Markdown形式、保存先を維持。私的データを公開コードへ含めない。
- iframeおよび実行時の文字列パッチをTaskLinerから除去。
- Master/Repeat管理画面は元の独立画面へリンクする。

## Review Focus
- 保存中の編集：古い保存結果が新しい変更をcleanにしない。
- 日付移動中の通信失敗：元の日と入力を維持。
- 空本文とSHA不一致：既存リモートを無断で上書きしない。
- アプリを閉じて再表示：インスタンスとタイマーを重複作成しない。
- 幅縮小・入力：HOMEへCSSやショートカットを漏らさない。

### Task 1: 日付指定の同期
Files: workbench/taskliner/sync.js、sync.test.js
Interfaces: createSync({storage,fetch,onState}) -> {config,setConfig,markDirty,isDirty,save(date,text),pull(date),subscribe}。
- [x] 競合・空本文・保存中編集・通信失敗のテストを先に書き、失敗を確認。
- [x] 既存キーとSHAを引き継ぐ同期を実装。
- [x] node --test workbench/taskliner/sync.test.js が成功。

### Task 2: 静的TaskLiner部品
Files: workbench/taskliner/{app.mjs,app.css,app-markup.mjs,controller.mjs,view.css,view-markup.mjs,依存ヘルパー}、integration.test.js
Interfaces: mount(container) -> {element,getDate,navigate,exportMarkdown,setVisible}。controllerが同一インスタンスを再利用。
- [x] フレームなし・既存キー・mount再利用の契約テストを追加し失敗を確認。
- [x] 既存パッチを展開し、静的な部品へ移植。設定、サイズ調整、Masterサジェスト、Repeat生成、手帳取込を接続。
- [x] Markdown互換・既存操作・統合テストを実行。

### Task 3: 通常Tasksを接続
Files: workbench/app-routing.js、DIRECTION.md、SURFACES.md
- [x] Tasksが内部モジュールで開く契約テストを先に追加。
- [x] Tasksだけを内部mountへ切替。ほかのアプリのルーティングは維持。
- [x] 全テストと構文チェック、可能な環境で架空データによるブラウザ確認。
- [x] 仕様・検証結果を記録し、作業ブランチにcommit/push。mainへの統合は別操作。
