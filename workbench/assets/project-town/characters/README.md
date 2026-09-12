# Project Town production characters

Project Town uses 24×24-frame character sheets for production display.

## Current production mode

Eight character slots are active. Character identity is assigned deterministically from the Project ID, so the same Project keeps the same slot across reloads.

Current temporary slot mapping:

- `char-01.png` — Source 01 (`project_town_sprite_reconstructed_96x96.png`)
- `char-02.png` — Source 02 (`project_town_character_02_96x96.png`)
- `char-03.png` — Source 04 (`project_town_character_04_96x96.png`)
- `char-04.png` — Source 05 (`project_town_character_05_96x96.png`)
- `char-05.png` — Source 06 (`project_town_character_06_96x96.png`)
- `char-06.png` — duplicate of Source 01
- `char-07.png` — duplicate of Source 05
- `char-08.png` — duplicate of Source 06

The optional `character32=1` URL test remains isolated from normal production mode. Default Project Town uses only the 24×24 contract.

## Sprite contract

- 96×96 PNG
- RGBA
- 4 columns × 4 rows
- each frame is 24×24
- row 1: `idle`
- row 2: `walk`
- row 3: `work`
- row 4: `rest`
- transparent background
- shared CSS animation and shared `CharacterController`

`../character.png` remains the fallback sprite if an assigned production sprite fails to preload.
