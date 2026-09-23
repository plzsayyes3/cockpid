# Rady assets

Reusable character assets for Cockpid / Workbench.

## Layout

- `web/` — transparent PNG assets optimized for direct use in the web UI.
- `manifest.json` — semantic asset map for animations, colors, expressions, and common usage states.

Use paths relative to `workbench/`, for example:

```html
<img src="./assets/rady/web/expression_02_smile.png" alt="Rady">
```

The filenames are intentionally stable so other Cockpid surfaces can reuse the same character assets without copying files.
