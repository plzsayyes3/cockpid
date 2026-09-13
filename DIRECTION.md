# 作業台 Direction

> Repository / Project ID: `cockpid`
> Former name: `COCKPID`
> Current user-facing name: **作業台 / Workbench**

> ✅ **2026-09-12 検証済み**: このファイルの記述は`workbench/`の実装（コード）と
> 照合済みで、事実誤認は見つかりませんでした。実装の詳細な棚卸し（各画面・データソース・
> 実際のビジュアルトークン・認証方式）は[`SURFACES.md`](./SURFACES.md)を参照してください。
> このファイルは方針、`SURFACES.md`は実装済みのものだけを書く仕様書という役割分担です。

## 1. Purpose

作業台は、個人の情報・予定・タスク・考えを全部並べるダッシュボードではない。

必要なものを必要なときに手元へ出し、作業が終わったら静かなHOMEへ戻れる **日常の作業台** とする。

中心となる考え方は次のとおり。

> HOMEは情報を詰め込む場所ではなく、次の行動へ入るための静かな作業面である。

旧称 `COCKPID` で使っていた「cockpit / mission-control」の比喩は履歴として残すが、現行UIの設計原則にはしない。

## 2. Three-layer architecture ✅ 実装と一致

基盤の3層構造は維持する。

```text
SOURCE
  mynotebook
       │
       ▼
AI KNOWLEDGE SYSTEM
  my-storage-note
  ├─ brain
  ├─ objects
  ├─ memory
  └─ views
       │
       ▼
作業台
  repository: cockpid
  ├─ daily entrance
  ├─ app launcher / shell
  ├─ display
  └─ exploration
```

- `mynotebook`: 原文・Daily・記録のSOURCE。
- `my-storage-note`: AIが扱うルール・Canonical Object・Memory・Viewの正本。
- `cockpid`: 作業台の表示・操作層。原文やCanonical dataを重複保存しない。

## 3. Workbench principle ✅ dock実装(10アプリ中Advice/secretを除く8個)と一致

HOMEは「静かな作業台」とする。

- HOMEへ各Appの詳細機能を再実装しない。
- HOMEでは、今日・今・入口として意味のある情報だけを扱う。
- Calendar / Tasks / Zen / News / On Hand / Board / Backstage / Project Town 等は独立Appとして扱う。
- PC / tabletでは必要なAppをDrawerとして開く。
- スマートフォンでは独立Appを全画面で扱える構造を基本とする。
- App本体の外側に見えるHOMEをクリックしたら、Appを閉じて作業台へ戻れる。
- 各Appは必要に応じて直接URLでも開ける。

「全部を一画面で監視する」より、「今使う道具だけ机の上へ出す」ことを優先する。

## 4. Separation of responsibilities

作業台に原則として持たせないもの:

- Daily Noteの正本
- 原文ノートの大量コピー
- AI分類・LLM処理そのもの
- Canonical Project / Assignment / Task / Idea / Reference
- 各独立Appの全機能
- 外部Repositoryのコードの複製

作業台が担うもの:

1. 日常の入口
2. 状態の軽い把握
3. 独立Appの起動
4. 人間が判断する場所への導線
5. 元データ・Project・Appへの移動

## 5. Project / Human Decision model ✅ views/経由の互換アダプタ含め確認済み

Projectの正本は `plzsayyes3/my-storage-note/objects/projects/` に置く。

CockpidはProject Markdownを正本として持たず、表示用途では原則として `my-storage-note/views/` のread modelを利用する。

BackstageはProject棚、Project TownはProjectの活動状態を眺め、必要なときに人間が判断を返す場所として扱う。

`activity: review` のProjectだけをHuman Decision Queueとして明確に人間へ渡す。Projectの `next` と「いま人間が決めること」は別概念とし、後者は `decision` を使用する。

一時的なparallel workerの担当・lock・handoffは `my-storage-note/brain/coordination/` に置ける。

## 6. Naming policy

2026-09-12以降の人間向け名称は **作業台** とする。

互換性のため、次は変更しない。

- GitHub Repository: `plzsayyes3/cockpid`
- Project ID: `cockpid`
- Project canonical path: `my-storage-note/objects/projects/cockpid.md`
- 既存の内部キーやコード識別子のうち、名称変更だけのために壊す必要がないもの

`COCKPID` は旧称・aliasとして保持する。

## 7. Decision rule

今後の設計判断では、次の順で優先する。

1. HOMEを静かな作業台として保つ
2. SOURCE / AI Knowledge System / 表示層の役割分担を壊さない
3. 独立Appの責務をHOMEへ重複実装しない
4. 人間が次に何をすればよいか分かる
5. 必要な道具へ少ない操作で入り、すぐHOMEへ戻れる
6. 元情報・Projectへ辿れる
7. 見た目を整える

UIは変えてよい。**作業台という役割と、データの責務分離は固定する。**
