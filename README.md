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
- `index-00.html` — UI gallery and pattern launcher
- `main.html` — dynamic Mission Control build
- `pattern-01.html` — Mission Control
- `pattern-02.html` — Temporal Lineage
- `pattern-03.html` — Neural Network
- `pattern-04.html` — Tactical Matrix
- `pattern-05.html` — Hybrid Command Deck
- `prototype-common.js` — shared GitHub API/data access and previous-day lookup

## Design direction

The intended feeling is **a personal mission-control cockpit**, not a generic dashboard.

The UI should expose signals, state, lineage and connections without becoming visually noisy. Cards and panels are secondary to the information hierarchy. Accordion interaction is preferred for historical context and detail because the cockpit should remain compact at rest.

Pattern 01 / Mission Control is currently the closest visual direction, while the other patterns remain comparison references.

## Security

The repository must not contain personal source notes or GitHub tokens. The browser-side token, when required for private analysis data, is entered locally and stored in `localStorage`; it is not committed to the repository.
