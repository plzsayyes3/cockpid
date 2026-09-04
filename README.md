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
- `board.html` — Deck Board 16×16 / カードを並べて深く考える独立ページ (linked from the cockpit toolbar)
- `index-00.html` — UI gallery and pattern launcher
- `main.html` — dynamic Mission Control build
- `pattern-01.html` — Mission Control
- `pattern-02.html` — Temporal Lineage
- `pattern-03.html` — Neural Network
- `pattern-04.html` — Tactical Matrix
- `pattern-05.html` — Hybrid Command Deck
- `prototype-common.js` — shared GitHub API/data access and previous-day lookup

## Deck Board 16×16 (`board.html`)

The cockpit is optimized for *scanning*. The board is the opposite mode: a separate,
self-contained page for **placing a small number of cards deliberately and thinking slowly**.
`index.html` is unchanged apart from the toolbar link that opens it.

### Model

```text
LIBRARY            DECK                     LATTICE 16×16
extracted/*.json → JSON cards (snapshot) → cards are 4×4 cells
(fetched)          localStorage             the offset is the meaning
```

- **Card** — an idea/theme/action normalized into a JSON object
  (`id`, `type`, `title`, `summary`, `date`, `source`). `source` keeps the
  `repo / path / index` of the extracted record, so a card on the board is still traceable
  back to the analysis layer. 自作カード (`type: note`) use the same shape with `source: null`.
- **Deck** — a named set of cards plus their arrangement (`pos: {cardId: {x, y}}`).
  Adding a card **snapshots its JSON into the deck**, so a deck stays readable without
  re-fetching. Decks can be created, renamed, duplicated, deleted and switched.
- **Lattice** — 16×16 cells. A card occupies **4×4** of them, so four cards fit across,
  but a card can sit at any cell: two neighbours can be staggered by **0, 1, 2 or 3 cells**
  — a quarter of a card at a time. That stagger is the expressive dimension.
  Cards may not overlap; a drop that would overlap previews red and is refused.

### Why a lattice instead of free placement

Free placement made tidying the board the work, not thinking. Snapping removes that cost
without flattening it into fixed slots. The bold gridlines mark whole-card boundaries and
the faint ones mark the quarter-card offsets, so the drawing itself states what is
adjustable. The four axis labels per side (default: 種 / 育つ / 形 / 動く ×
強い引力 / 気になる / 様子見 / 保留) are editable and deliberately soft — where a card sits
relative to its neighbours carries more than the label does.

### State and I/O

- decks live only in `localStorage` under `cockpid.deck.v2`; the board never writes
  analysis data back to `my-storage-note`. Old 4×4-slot decks are migrated on load
  (`r{row}c{col}` → `x = col*4, y = row*4`)
- `JSON` panel shows the active deck as JSON and can import one back — the backup/restore path
- `⇪ 書き出す` posts the deck as one memo into `mynotebook/00_inbox`: every placed card with
  its `x/y`, its axis labels and its offset within the card grid, plus the bench and a
  card-provenance list. A synthesis session therefore re-enters the pipeline as source
  material (same write channel as ZEN V2)

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
- **A debounce that resets on every action can defer a save indefinitely.** `board.html` saves deck state on a 250ms debounce; because every drag and placement reset the timer, continuous editing never actually reached the write. It now force-flushes when more than 2s has passed since the last real write — keep that guarantee if the save path changes.
- **The board's status readout has several independent async writers** (library load, deck save, placement refusal). A "placement refused" message was being overwritten by the `SAVED` that landed just behind it, so the refusal looked like a success. `setStatus(text, sticky)` now protects an explicit message for 1.6s. This is the same class of bug as the `refreshStatus()` note above — check it whenever a new status source is added.
