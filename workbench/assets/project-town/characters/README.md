# Project Town production characters

The production sprites in this directory use the **Project Town 人間キャラ ドット絵パターン集** supplied on 2026-09-12 as the authoritative visual source.

The characters are not reinterpretations of the reference. The first six variants are derived directly from the reference image's 「1. ベーシックスタイル（基本候補）」:

1. `char-01.png` — A. スタンダード
2. `char-02.png` — B. ショートヘア
3. `char-03.png` — C. ボブ
4. `char-04.png` — D. ロングヘア
5. `char-05.png` — E. メガネ
6. `char-06.png` — F. 帽子
7. `char-07.png` — 「5. 役割・雰囲気のバリエーション」マネージャー
8. `char-08.png` — 「5. 役割・雰囲気のバリエーション」カジュアル

## Sprite contract

- 96×96 PNG
- 4 columns × 4 rows
- each frame is 24×24
- row 1: `idle`
- row 2: `walk`
- row 3: `work`
- row 4: `rest`
- transparent background
- shared CSS animation and shared `CharacterController`
- character identity is independent from activity

The source characters are reduced to the 24×24 production grid while preserving their actual hair silhouette, face, glasses/cap, clothing and palette as closely as possible. The four-frame rows add small pixel-scale motion without changing the character identity.

## Project assignment

`project-town-characters.js` owns character identity.

1. If Project frontmatter contains `character: char-04` (or another known variant), that explicit character is used.
2. Otherwise a stable FNV-1a hash of `project.id` selects one of the variants.

The character layer reuses the Project markdown responses already fetched by Project Town, so explicit `character` does not add a second Project download.

`../character.png` remains the fallback sprite if a production character image fails to preload.
