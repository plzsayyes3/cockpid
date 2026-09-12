# Project Town production characters

All production sprites follow the existing Project Town sprite contract:

- 96×96 PNG
- 4 columns × 4 rows
- each frame is 24×24
- rows: `idle`, `walk`, `work`, `rest`
- transparent background
- shared CSS animation and shared CharacterController behavior

Variants:

1. `char-01.png` — brown short hair / white shirt
2. `char-02.png` — black short hair / blue
3. `char-03.png` — brown bob / mustard
4. `char-04.png` — long hair / green
5. `char-05.png` — glasses / teal
6. `char-06.png` — cap / coral
7. `char-07.png` — hoodie / plum
8. `char-08.png` — formal / navy

Assignment is data-driven in `project-town-characters.js`. A stable FNV-1a hash of `project.id` selects a variant. The resolver also accepts an explicit character ID so a future `character: char-04` frontmatter value can override the hash without changing the variant data model.

`../character.png` remains the fallback when a production character asset fails to preload.
