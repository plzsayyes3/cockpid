# Project Town production characters

Production character sprites are derived from the visual language of:

`../reference/project-town-character-system-reference.webp`

The reference image is a design source, not a production sprite sheet. The production sprites intentionally keep its compact retro-RPG resident feel: small chibi proportions, 1px dark outlines, restrained palettes, readable hair silhouettes, simple facial expressions, and clear clothing differences.

## Sprite contract

- 96×96 PNG
- 4 columns × 4 rows
- each frame is 24×24
- rows: `idle`, `walk`, `work`, `rest`
- transparent background
- shared CSS animation and shared `CharacterController`
- no activity-dependent clothing or identity changes

## Variants

1. `char-01.png` — brown short side-part / white shirt
2. `char-02.png` — black tousled short hair / blue
3. `char-03.png` — auburn bob / mustard
4. `char-04.png` — long brown hair / green
5. `char-05.png` — dark hair + glasses / teal
6. `char-06.png` — red cap / coral
7. `char-07.png` — plum hoodie / purple
8. `char-08.png` — neat dark hair / navy formal

## Project assignment

`project-town-characters.js` owns character identity.

1. If Project frontmatter contains `character: char-04` (or another known variant), that explicit character is used.
2. Otherwise a stable FNV-1a hash of `project.id` selects one of the variants.

The character layer observes the same Project markdown responses already fetched by Project Town, so explicit `character` does not add a second Project download. Activity, momentum, destination movement, and animation actions stay independent from character identity.

`../character.png` remains the fallback sprite when a production character asset fails to preload.
