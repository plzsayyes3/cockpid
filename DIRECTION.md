# COCKPID Direction

## 1. Purpose

COCKPID is the **display and exploration layer** of a personal thinking system.

It is not the original note repository and it is not the AI analysis/storage layer.
Its job is to make already-structured thinking data understandable, navigable, and useful to a human.

The core design goal is:

> Turn accumulated personal thinking data into a cockpit where the user can quickly see what matters, trace why it matters, and discover connections between thoughts.

## 2. Three-layer architecture

COCKPID belongs to a three-layer system.

```text
SOURCE
  mynotebook
  ├─ Daily Notes
  └─ Canvas
       │
       │ periodic processing
       ▼
ANALYSIS DATA
  my-storage-note
  ├─ Ideas
  ├─ Themes
  ├─ Actions
  ├─ Questions
  ├─ Hypotheses
  └─ Connections / Serendipity
       │
       │ structured data / JSON
       ▼
COCKPID
  this repository
  ├─ display
  ├─ exploration
  ├─ temporal navigation
  ├─ connection discovery
  └─ visualization
```

### SOURCE: `mynotebook`

The original information lives here. Daily Notes and Canvas are the source of truth.

COCKPID must not become a second copy of the original notes.

### ANALYSIS DATA: `my-storage-note`

This layer stores AI-derived structured information. Gemini/API processing may classify and connect source material into Ideas, Themes, Actions, Questions, Hypotheses, and Connections/Serendipity.

Analysis records should retain enough source information to trace the result back to the original repository/path/date/record.

### COCKPID: `cockpid`

This repository contains the presentation and exploration interface only.

It consumes analysis data and presents it as a human-facing dashboard.

## 3. Data freshness policy

The normal dashboard does **not** need to update continuously.

The preferred model is to process and display the **previous day's information** rather than repeatedly querying or processing the current day's source data.

Reason:

- reduce API calls
- reduce Gemini token/API cost
- allow a complete day of source material to settle before analysis
- keep the dashboard stable during the day
- avoid unnecessary repeated processing

The exact automation schedule belongs to the data-processing layer, not to COCKPID's presentation logic.

## 4. Primary interaction model

The main navigation model is **date-first + accordion**.

Example:

```text
THEMES

昨日
  → [click]
     → analyzed content

一昨日
  → [click]
     → analyzed content

3日前
  → [click]
     → analyzed content
```

The same principle applies to Ideas, Actions, and Connections/Serendipity.

The default state should be compact. The user opens a date/item only when they want detail.

This prevents the dashboard from becoming a wall of text.

## 5. Core dashboard concepts

### Ideas

Potential projects, inventions, experiments, or things worth pursuing.

### Themes

Recurring subjects, patterns, concerns, or philosophical/technical themes emerging from the source material.

### Actions

Concrete things that should be done.

### Serendipity / Connections

The most important exploratory layer.

It should show meaningful relationships between apparently separate notes, ideas, themes, actions, and older material.

A connection should be explainable: the user should be able to open it and understand why the system considers two pieces of information related.

## 6. Cockpit visual direction

The visual language should feel like a **personal cockpit / mission-control interface**, not a generic note application.

Desired characteristics:

- information-dense but readable
- dark interface
- clear status indicators
- restrained technical/monospace elements
- strong hierarchy
- panels and instrumentation rather than conventional document cards
- visual emphasis on relationships and state
- compact default state with expandable detail

The cockpit metaphor is functional, not decorative: the interface should help the user understand the current state of their thinking system at a glance.

## 7. UI experimentation

Multiple visual prototypes are intentional.

The repository currently contains prototype pages (`prototype-01.html` through `prototype-07.html`) used to compare different cockpit layouts and interaction models.

Prototype experimentation should remain separate from the production dashboard until a direction is selected.

Do not force a prototype into production merely because it exists.

## 8. Separation of responsibilities

Do not put these responsibilities into COCKPID unless explicitly required:

- original note storage
- wholesale copying of Daily Notes
- AI classification logic
- Gemini prompt execution
- source-note mutation
- long-term analysis generation

COCKPID should primarily:

1. fetch structured analysis data
2. normalize it for presentation
3. provide navigation and exploration
4. visualize relationships
5. expose source references

## 9. Source traceability

Every meaningful analysis result should be traceable to its origin.

A user should be able to answer:

- Where did this come from?
- Which date?
- Which source record?
- Why was it classified this way?
- What other information is it connected to?

The UI should expose this information progressively through accordion/detail views rather than displaying it all at once.

## 10. Current implementation direction

The existing `index.html` is the current functional dashboard baseline. It reads structured data from `my-storage-note` and displays Ideas, Actions, Themes, and Serendipity/Connections.

The prototype files are visual experiments and should be treated as disposable/replaceable UI candidates.

Future implementation should preserve the three-layer architecture even when the visual design changes completely.

## 11. Decision rule

When making a future COCKPID design decision, prioritize in this order:

1. preserve the three-layer architecture
2. preserve source traceability
3. minimize unnecessary API/LLM processing
4. make the current thinking state understandable at a glance
5. make exploration of historical context easy
6. make connections explainable
7. optimize visual polish

The UI is replaceable. The architecture is not.
