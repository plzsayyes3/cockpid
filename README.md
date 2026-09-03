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
- `board.html` — Deck Board 4×4 / カードを並べて深く考える独立ページ (linked from the cockpit toolbar)
- `index-00.html` — UI gallery and pattern launcher
- `main.html` — dynamic Mission Control build
- `pattern-01.html` — Mission Control
- `pattern-02.html` — Temporal Lineage
- `pattern-03.html` — Neural Network
- `pattern-04.html` — Tactical Matrix
- `pattern-05.html` — Hybrid Command Deck
- `prototype-common.js` — shared GitHub API/data access and previous-day lookup

## Deck Board 4×4 (`board.html`)

The cockpit is optimized for *scanning*. The board is the opposite mode: a separate,
self-contained page for **placing a small number of cards deliberately and thinking slowly**.
`index.html` is unchanged apart from the toolbar link that opens it.

### Model

```text
LIBRARY            DECK                     GRID 4×4
extracted/*.json → JSON cards (snapshot) → 16 slots, 1 card per slot
(fetched)          localStorage             position = meaning
```

- **Card** — an idea/theme/action normalized into a JSON object
  (`id`, `type`, `title`, `summary`, `date`, `source`). `source` keeps the
  `repo / path / index` of the extracted record, so a card on the grid is still traceable
  back to the analysis layer. 自作カード (`type: note`) use the same shape with `source: null`.
- **Deck** — a named set of cards plus their arrangement. Adding a card to a deck
  **snapshots its JSON into the deck**, so a deck stays readable without re-fetching.
  Multiple decks can be created, renamed, duplicated, deleted and switched.
- **Grid** — 4×4, one card per cell. The 16-slot ceiling is the point: it forces selection
  rather than accumulation. Cards not placed sit in 控え (the deck's bench).

### Why a grid instead of free placement

Free placement made tidying the board the work, not thinking. The grid removes that cost.
The cells are differentiated only just enough to carry meaning — editable labels on both
axes (default: 種 / 育つ / 形 / 動く × 強い引力 / 気になる / 様子見 / 保留) and a very faint
tint that deepens toward the "動く × 強い引力" corner. Nothing else. Where a card sits
*is* the interpretation, so the axes are meant to be rewritten as the thinking changes.

### State and I/O

- decks live only in `localStorage` under `cockpid.deck.v2`; the board never writes
  analysis data back to `my-storage-note`
- `JSON` panel shows the active deck as JSON and can import one back — the backup/restore path
- `⇪ 書き出す` posts the deck as one memo into `mynotebook/00_inbox`: the 4×4 layout as a
  markdown table, the bench, and a card-provenance list. A synthesis session therefore
  re-enters the pipeline as source material (same write channel as ZEN V2)

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
