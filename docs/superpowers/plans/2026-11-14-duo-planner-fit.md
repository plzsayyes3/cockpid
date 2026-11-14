# DUO Planner Fit Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** 実機スクリーンショットで判明した余白・情報密度・右端領域を改善し、右ページをInbox入力中心へ変更する。
**Architecture:** 手帳内のみTaskLinerのcompact表示を使い、右ページは書く／Inbox／Dailyを同じDOMで切り替える。右端に44px操作帯。外側シェルがvisual viewportとsafe-areaを一度だけ扱う。
**Tech Stack:** 既存buildless JS、Shadow DOM、GitHub Contents API、Node test。
**Spec:** docs/superpowers/specs/2026-11-14-duo-planner-design.md と2026-11-14実機改善依頼。

## Global Constraints
- 左右の日付・状態と既存Dailyを維持。Inbox送信でDailyへ直接書かない。
- 入力を即時ローカル保持。送信は明示操作のみ。送信先と内容を固定して再試行し、重複・上書きを防ぐ。
- 右端のOS表示自体は操作しない。Webの安全領域内へ操作帯を配置し、追加の右余白を0〜96pxで調整可能にする。
- タスクのサイズ調整と通常Tasksの表示は維持し、compactは手帳内だけに限定。
- 既存97テストおよび既存9失敗の全体基準と比較する。

## Review Focus
- 応答喪失後の再送でInboxが重複しないこと。
- 送信中の追加入力を消さないこと。
- 書く／一覧／Dailyと9:1の切替でIMEと下書きを保持すること。
- visual viewport・safe-area・独自余白を二重加算しないこと。
- モードを出たら通常Tasksの表示に戻ること。

### Task 1: Inbox store
- [x] 保存先固定、再試行・応答喪失・同名衝突・送信中編集・一覧除外のテストをRED→GREEN。
- [x] source別の下書きとpending identityを永続化し、send/list/readを実装。

### Task 2: 右ページと操作帯
- [x] 初期Inbox入力、3モード、Daily保持、右余白制御の契約をRED→GREEN。
- [x] compose/list/detail、右端操作帯、表示調整を実装。送信成功時だけ入力をクリア。

### Task 3: viewport and compact TaskLiner
- [x] 手帳限定compactと安全余白の契約をRED→GREEN。
- [x] 継承paddingをリセットしvisual viewportのrectへ合わせる。手帳内のヘッダー・追加欄・タスクカードを圧縮。
- [x] 全テスト・構文・ブラウザQA・独立レビュー後にGitHubへ反映する。

Validation: 108/108 focused tests; browser wide/narrow, Inbox→Daily→Inbox retains draft, failed send retains draft. Independent review fixes: keyboard-height shrink/scroll and IME-safe send completion. Private GitHub sending and physical DUO OS strip require device verification.
