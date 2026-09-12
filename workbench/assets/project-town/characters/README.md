# Project Town production characters

The authoritative visual source is the **Project Town 人間キャラ ドット絵パターン集** supplied on 2026-09-12.

## Current production mode

For visual-quality validation, Project Town currently uses **one character only**:

- `char-01.png` — A. スタンダード
- every Project displays this same character
- Project activity still controls `idle / walk / work / rest`
- existing movement destinations, momentum, modal, MEMO, handoff and mobile behavior remain independent from character identity

This is intentional. Additional character variants will be re-enabled only after `char-01` is visually approved in the actual town view.

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

`../character.png` remains the fallback sprite if `char-01.png` fails to preload.
