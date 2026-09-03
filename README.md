# COCKPID

Personal Thinking Cockpit.

## Architecture

COCKPID is the **display / exploration layer**, not the source of truth and not the analysis engine.

```text
SOURCE
  mynotebook
      ↓
ANALYSIS DATA
  my-storage-note
      ↓
DISPLAY / EXPLORATION
  cockpid
```

### 1. SOURCE
`plzsayyes3/mynotebook` contains the original daily notes and personal thinking records.

### 2. ANALYSIS DATA
`plzsayyes3/my-storage-note` contains the structured outputs produced from the source data, including:

- `extracted/theme/YYYY-MM-DD.json`
- `extracted/idea/YYYY-MM-DD.json`
- `extracted/action/YYYY-MM-DD.json`
- `connections/semantic.json`
- `state/completed_actions.json` — written by cockpid itself (not the analysis pipeline): a map of `{action id: completion timestamp}`, updated when a user marks an action complete from the ACTIONS list. Kept separate from the `extracted/` tree so the analysis pipeline can keep regenerating those files without clobbering completion state.

The normal cockpit cycle is **previous-day first**, because the source/analysis pipeline does not need to be queried repeatedly during the same day.

### 3. DISPLAY
`cockpid` turns analysis results into a cockpit-style interface.

Core interaction:

- dates are the primary navigation unit
- `昨日 → 一昨日 → ...` is presented as an accordion
- Ideas / Themes / Actions use the same expandable model
- Serendipity / Connections explains why two records are related
- source → analysis → display traceability remains visible
- the interface is optimized for scanning first and opening details only when needed

## Current entry points

- `index.html` — GitHub Pages root / primary cockpit
- `board.html` — Deep Dive Board / 並べて深く考えるための独立ページ (linked from the cockpit toolbar)
- `index-00.html` — UI gallery and pattern launcher
- `main.html` — dynamic Mission Control build
- `pattern-01.html` — Mission Control
- `pattern-02.html` — Temporal Lineage
- `pattern-03.html` — Neural Network
- `pattern-04.html` — Tactical Matrix
- `pattern-05.html` — Hybrid Command Deck
- `prototype-common.js` — shared GitHub API/data access and previous-day lookup

## Deep Dive Board (`board.html`)

The cockpit is optimized for *scanning*. The board is the opposite mode: a separate,
self-contained page for **laying analysis items out side by side and thinking slowly**.
`index.html` is unchanged apart from the toolbar link that opens it.

- reads the same `extracted/{idea,theme,action}/YYYY-MM-DD.json` files as the cockpit,
  over a user-chosen day window, and places each item as a draggable card
- the user adds their own 付箋 (sticky notes) and draws connections between any two cards —
  this is the **human** counterpart to the AI-generated `connections/semantic.json`,
  not a replacement for it
- layout, notes and connections live only in `localStorage` under `cockpid.board.v1`;
  the board never writes analysis data back to `my-storage-note`
- `⇪ mynotebookへ書き出す` posts the notes and connections as a single new memo into
  `mynotebook/00_inbox`, so a synthesis session re-enters the pipeline as source material
  (same write channel as ZEN V2)

It shares `index.html`'s token key, so a token entered on either page works on both.

## Design direction

The intended feeling is **a personal mission-control cockpit**, not a generic dashboard.

The UI should expose signals, state, lineage and connections without becoming visually noisy. Cards and panels are secondary to the information hierarchy. Accordion interaction is preferred for historical context and detail because the cockpit should remain compact at rest.

Pattern 01 / Mission Control is currently the closest visual direction, while the other patterns remain comparison references.

## Security

The repository must not contain personal source notes or GitHub tokens. The browser-side token, when required for private analysis data, is entered locally and stored in `localStorage`; it is not committed to the repository.

Never share a screenshot that shows the actual token value (e.g. a DevTools Network tab with the `Authorization` header expanded). If a token is ever exposed this way, treat it as compromised and revoke/regenerate it on GitHub immediately, regardless of whether the exposure looks accidental or low-risk.

## Known pitfalls (learned the hard way)

- **One token key, one input field.** `index.html` stores its token under the `localStorage` key `zen-note-github-token`. `main.html` (via `prototype-common.js`) uses a *different* key, `cockpid.github.token`. Because both pages share the same origin but not the same key, a token pasted into one page's dialog is invisible to the other — this caused a long, confusing debugging session where the token being edited on GitHub's settings page was not the one actually in use. If unifying the two pages' storage isn't done, always double-check which page you're testing against before assuming a token change took effect. `board.html` deliberately reuses `index.html`'s `zen-note-github-token` key for this reason — keep it that way for any new page.
- **A GitHub fine-grained PAT returns `404`, not `403`, for a repository outside its granted access.** This is deliberate (GitHub avoids leaking whether the repo exists), but it means a naive "404 = no data for this day" fetch strategy can silently misreport "repo access denied" as "empty". `index.html`'s `loadAnalysis()` probes `extracted/` once before the per-day scan specifically to distinguish these two cases — keep that probe if the fetch strategy changes.
- **The GitHub Contents API can 404 on a bare/empty path with a trailing slash** (`.../contents/`) even when the token has valid read access to the repo. Always probe a real, non-empty subpath (e.g. `extracted`), never `''`.
- **A fine-grained PAT's repository list must be re-verified after every edit.** Adding a repo to "Repository access" on GitHub's token settings page can, in practice, require re-confirming the rest of the list — a repo you thought was still selected can silently drop off. After editing a token's scope, re-check the full list, not just the repo you meant to add.
- **Both `mynotebook` and `my-storage-note` need Contents: Read *and* Write on the token.** `mynotebook` (SOURCE) needs Write because the ZEN feature posts new files into `00_inbox`. `my-storage-note` (ANALYSIS DATA) was Read-only at first, but now also needs Write because marking an action complete writes to `state/completed_actions.json` there. A token scoped read-only on either repo will silently lose that repo's write feature (ZEN save, or action completion) while everything else keeps working.
- **Don't let independent async status writers share the same DOM element.** An earlier bug had `loadDay()` and `loadAnalysis()` both write to the same header status text without coordination; whichever finished last silently overwrote the other's (possibly more important) error message. If you add another concurrent status source, route it through a single combining function (see `refreshStatus()` in `index.html`) rather than writing directly.
