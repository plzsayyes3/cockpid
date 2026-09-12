# Project Town character reference

Visual reference for the multi-character Project Town implementation.

- `project-town-character-system-reference.webp` — compact visual reference derived from the character variation/system concept sheet.
- Treat this as a visual/design reference, not as a production sprite sheet.
- Production character sprites should follow one shared animation contract so multiple distinct people can work simultaneously in Project Town.

Recommended production contract:

- One character asset per person/variant.
- Same frame grid for every character.
- Minimum actions: `idle`, `walk`, `work`, `rest`.
- 4 frames per action to preserve compatibility with the current `character.png` animation model.
- Keep `image-rendering: pixelated` and avoid runtime image filters as the primary differentiation method.
- Character identity should be data-driven (sprite path + optional metadata), not hard-coded by Project ID.
- Existing `workbench/assets/project-town/character.png` must remain as the fallback/default character.
