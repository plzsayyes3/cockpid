# SURFACES.md — What's actually implemented (verified 2026-09-18)

> **Purpose**: `DIRECTION.md` is a policy document (what the workbench should be and why).
> This document is the opposite: an exhaustive, code-verified inventory of what actually
> exists today — every screen, its data source, its writes, its visual values, its auth.
> Same split as `blankpaper`'s `BRAIN.md` vs `DESIGN.md`.
>
> **Method**: every claim below was checked against the actual file (`grep`/read), not
> inferred from another document. Where a check was shallow, it says so explicitly rather
> than asserting confidence it doesn't have.
>
> **Important correction to the brief this document was written from**: `DIRECTION.md` was
> assumed to be 16 days stale (last update 2026-08-27). It is not — it was rewritten twice
> on 2026-09-12 (`ee4712f` 13:28, `f821e4c` 23:00 JST) and is consistent with the workbench
> direction described here. This file is the implementation inventory and should be updated
> when runtime routing or surfaces change.

---

## 1. Entry point

`index.html` (repo root) is a hard redirect (`meta refresh` + JS `location.replace`) to
`./workbench/`. There is no root or `workbench/`-level `workbench.html`; the live entry is
`workbench/index.html`. Nothing else at the root is reachable from a normal visit to the site.

---

## 2. The Home screen (`workbench/index.html`)

| Panel | What it does | Data source |
|---|---|---|
| Header | Brand, 3 status icons (Techo/Analysis/System — decorative, not wired to live health checks as far as verified), Mail icon with unread badge, Settings button, live clock | — |
| **PUT ANYTHING HERE** (capture box) | Freeform textarea, Ctrl/⌘+Enter saves | writes → `mynotebook/00_inbox` (new file) |
| **ON HAND** | 3 columns: Task / Check / Keep. Homeの2件サンプルはCanonical Shared Taskとrecent Candidateを同一レーン内で混在させ、両方ある場合は片側だけで先頭2件を占有しない。詳細ON HANDは全件表示。historical `mode: do` is read only as a legacy alias and normalized to Task | reads → `my-storage-note/views/tasks.json` + `my-storage-note/memory/extracted/<type>/*.json` / `memory/indexes/movement/*`; Shared Task completion writes → `my-storage-note/objects/tasks/current.yml`; candidate handled/SKIP state → `my-storage-note/memory/state/on-hand.json` via shared-state sync |
| **CALENDAR / TODAY** | Today's schedule, prev/today/next date nav, link out to Google Calendar | reads → `mynotebook/02_techo` (routed through a compatibility adapter — see §7) |
| **NEWS** | A short list/teaser, opens the News app on click | reads → external: `https://plzsayyes3.github.io/My_Internet_place/data/latest.json` |
| **Resident** (the little pet in the corner) | Cosmetic companion; its speech bubble text is scraped from other panels' already-rendered DOM (`.movement-item-title` etc.), plus one direct fetch of `my-storage-note/memory/extracted/idea` | position persisted in `localStorage: cockpid.workbench.pet.position.v1` |
| **Memo drawer** (CAPTURE / INBOX tabs) | CAPTURE writes a new note; after Area selection it records/displays a Project / Assignment / Task / Reference / Principle route in a browser sidecar; INBOX is read-only and looks for the `#### ショートメモ` heading specifically | `mynotebook/00_inbox` (write), `mynotebook/00_inbox` (read, view-only), `localStorage['cockpid.memo-routes.v1']` (route sidecar) |
| **Settings modal** | General / Paths·Data / GitHub / Notifications / Apps tabs. Paths tab is informational only (shows which folders are/aren't wired up); GitHub tab is where the token lives | see §4 |

ON HAND's `Task` lane is the review surface for Canonical Shared Tasks and execution-shaped
candidates. Checking a Canonical Shared Task updates its canonical `completed` field; checking
a non-canonical candidate means ON HAND `handled`. Sending a Shared Task to TaskLiner/Techo
schedules it but does **not** complete it. Sending a candidate successfully still marks that
candidate handled. This distinction is implemented in `onhand-core.js`, `onhand.js`,
`today-movement.js`, and `onhand-scheduling-bridge.js`.

Bottom **dock** is the app launcher (see §3). Most apps open full-screen-in-an-overlay
(`app-window`); Stan is intentionally a separate full-page route under `workbench/stan/`.

---

## 3. The apps

`workbench/app-routing.js` is the runtime source of truth for app routing. Nine keyed launchers
are registered (`1`–`6`, `8`, `9`, `0`); Advice, Board, Project Town, Keyboard and Stan have no
numeric key. At
load time `rebuildDockTail()` rebuilds keys `5`–`9`, so the runtime mapping below is the
canonical dock behavior even if older static markup or screenshots show previous numbers.

| Key | Name | Dock button? | Type | Source |
|---|---|---|---|---|
| 1 | Calendar | ✅ | iframe → `calendar.html` | own implementation, see §3.1 |
| 2 | Tasks | ✅ | iframe → `taskliner-bridge.html` | redirects to an **external** app, see §3.2 |
| 3 | Zen | ✅ | iframe → external `https://plzsayyes3.github.io/zen-note/` | separate repo/site entirely |
| 4 | News | ✅ | iframe → external `https://plzsayyes3.github.io/My_Internet_place/` | separate repo/site entirely |
| — | Advice | ❌ | iframe → `advice.html` | `my-storage-note/advice/YYYY-MM-DD.md`; reachable from the header Mail status, see §3.3 |
| 5 | On Hand | ✅ | iframe → `onhand.html` | same Task / Check / Keep model as the Home ON HAND panel, with full list/filter controls |
| 6 | Project · Assignment | ✅ | iframe → `backstage.html` | Area-first Project / Assignment / Task shelf + Town status view, see §3.6 |
| 8 | Thinking | ✅ | iframe → `thinking.html` | recent ideas / themes / questions / hypotheses / actions |
| — | Project Town | ❌ | direct URL → `project-town.html` | standalone compatibility surface, see §3.7 |
| 9 | Dictionary | ✅ | special (`dictionary.js`, loaded lazily) | `sticks3-voice-capture/local-receiver/transcription-dictionary.txt` (editable) + `.auto.txt` (read-only) |
| — | Keyboard | ❌ (header icon) | iframe → external `https://plzsayyes3.github.io/Keyboard/?v=c83f529` | 薙刀式タイピング練習サイト。ヘッダーのStanマイク横のキーボードアイコンから開く。`keyboard.html` は互換リダイレクト |
| 0 | For My Sons | ✅ | iframe → external `https://plzsayyes3.github.io/for_my_sons/` | separate repo/site (`plzsayyes3/for_my_sons`) |

Runtime dock tail is therefore `5=On Hand / 6=Project · Assignment / 8=Thinking / 9=Dictionary`, followed by
`0=For My Sons`. Key 7 is intentionally unassigned (2026-09-23 menu reorganization). Keyboard is
reachable from the header icon, not the numeric dock. Project Town is not a numeric dock entry; its
standalone URL remains for compatibility. Advice stays outside the numeric dock.

### 3.1 Calendar

`workbench/calendar.html` is a self-contained app (own CSS: `calendar-daybook.css`,
`week-horizontal.css`; own JS: `calendar-source-adapter.js`, `google-calendar-sync.js`,
`calendar-daybook.js`, `calendar-view-state.js`). It does not share code with the root-level
`calendar.html`/`calendar.js`/`calendar.css` (see §8 — those are a separate, older
implementation).

### 3.2 Tasks

`taskliner-bridge.html` is not the Canonical Shared Task store. It reads a configured `taskliner`
source from `localStorage: cockpid.sources.v1`, writes it into
`localStorage: taskliner_github_sync_config_v1` (the format the external app expects), and
the actual execution UI lives at `https://plzsayyes3.github.io/taskliner_taskchute-line/`
(a separate repo/site). `mynotebook/09_taskchute/` is the underlying execution data.

Canonical Shared Tasks instead live in `my-storage-note/objects/tasks/current.yml` and are
projected to `views/tasks.json`; ON HAND reads that view. In other words, ON HAND Task is the
review/decision surface for Shared Task, while TaskLiner remains the independent execution
surface for items chosen for today.

### 3.3 Advice

`advice.html`/`advice.js` reads `my-storage-note/advice/YYYY-MM-DD.md` (the callout-style
Markdown `secretary-log`'s `daily_advice.py` writes). Unread tracking is
`localStorage: cockpid.advice.read.v1` (`system-settings.js`), which also drives the header
Mail badge. This is intentionally **not** in the app dock — `index.html`'s own Settings
copy says so explicitly: "AdviceはMENUから外し、Mail Statusから既存画面を開きます" (Advice
is deliberately treated as a notification, not a peer app).

### 3.4 Dictionary (key 9)

Reads the manual and auto transcription dictionaries from `plzsayyes3/sticks3-voice-capture`.
The manual `local-receiver/transcription-dictionary.txt` is editable and saved through the
GitHub Contents API using its current SHA. The auto-generated
`local-receiver/transcription-dictionary.auto.txt` is displayed read-only and is never written.
SHA conflicts are surfaced as save errors so another worker's update is not overwritten.

### 3.5 Board (header status button)

Reads a single file: `my-storage-note/brain/coordination/cockpid-board.md`, rendered
through a small hand-rolled Markdown→HTML renderer (headings, bullets, and a fixed set of
`key: value` meta rows — status/area/owner/started/branch/commit/summary/next/blocked
reason/updated — with `status` getting a colored badge). This is a **third**, distinct
"board" concept in this project, alongside `secretary-ai-overview/CURRENT_WORK.md` and
`secretary-ai-overview/BOARD.md` — all three serve a similar "who's doing what" purpose but
are separate files with separate audiences; don't conflate them.

### 3.6 Project · Assignment / Backstage (key 6)

The Area adapter first reads `my-storage-note/views/areas.json` for the default Project source,
using the shared `zen-note-github-token` when the Canonical repository is private.
It renders declared Areas with sibling Project, Assignment, and Task collections and keeps
records without an Area in an explicit unassigned section. If a custom Project source is
configured, that existing source is preferred before Area-first loading. If the Area projection
is unavailable or invalid, the adapter falls back to the configured Project source, preserving
the Project-only detail and handoff contract. This fallback is read-only and does not rewrite
canonical Objects.

`backstage.js`'s own constants say `REPO = 'gpts'`, `PROJECT_DIR = 'projects'` — this looks
like it's reading the *legacy*, about-to-be-frozen `gpts` repository directly, which would
contradict `DIRECTION.md` §5's "Cockpid ... 表示用途では原則として `my-storage-note/views/`
の read model を利用する". **It isn't actually a discrepancy**: `backstage.html` loads
`project-source-adapter.js` *before* `backstage.js`. That adapter monkey-patches
`window.fetch` so that, when the configured project source is still the old default
(`gpts`/`projects`), every fetch backstage.js makes gets transparently rewritten to
`my-storage-note/views/projects.json` instead. `backstage.js`'s own source reads legacy
paths; its *runtime behavior* reads the new canonical view. This exact pattern is called
out by name in `my-storage-note/MIGRATION_MAP.md` ("Cockpid Project screens may still
contain old gpts/projects labels/constants for compatibility adapters").

The detail panel has an `OVERVIEW` mode for Current / Next, Workstreams, Relations, and links,
plus a `TOWN / STATUS` mode backed by the shared `project-status-model.js`. Both modes use the
same selected Project record; a Town rendering failure does not hide the Project list. Backstage
is explicitly Project-only; Area/Project Town provides the sibling Assignment and Task context.

### 3.7 Project Town (standalone compatibility URL)

A pixel-art visualization (`project-town.js`/`project-town-v2.js`/`project-town-characters.js`,
plus sprite assets under `workbench/assets/project-town/`) that represents projects as
characters in a town. It is no longer in the numeric dock, but remains available at its direct
URL and uses the shared `project-status-model.js`.

### 3.8 Stan (header microphone)

`workbench/stan/` is a separate full-screen standby surface rather than an `app-window`
iframe. It is reachable from the header microphone icon beside Settings. The current implementation includes `index.html`, `stan.css`, `stan.js`,
`stan-speech-session.js`, `stan-recording-gesture.js`, `stan-speech-ui.css`,
`stan-transcript-scroll.js`, `stan-github.js`, and `stan-auto-update.js`.

The visual core is a dark standby screen with pixel-style eyes. `stan.js` provides idle eye
motion, blinking, tap interaction, optional front-camera capture, and MediaPipe Face
Detector-based gaze following. The camera feed itself is hidden; only face position is used
for gaze. Camera off, permission denial, or detector failure falls back to autonomous eye
motion.

Interaction is currently:

- idle single tap: open the Stan menu / quick-action URL settings
- idle double tap: start a voice-recognition session
- voice session: up to 3 minutes of active recording time
- recording single tap: pause; another single tap resumes
- pause freezes the remaining-time countdown; the left HUD changes from `REC` to `PAUSE`
  and stops the recording-dot pulse
- recording double tap: end the session
- `stan-speech-session.js`: wraps Web Speech recognition and retries after an early
  `end`/`no-speech` while the active session remains; pause/resume keeps one logical memo
- live transcript: one line below the eyes; long text scrolls horizontally to the latest
  recognized portion while the complete text remains the save payload
- there is no `送る` button: normal end or the 3-minute limit triggers `stan-github.js` to
  automatically write a new Markdown file to `mynotebook/00_inbox`
- `stan-auto-update.js`: checks Stan updates every 5 minutes and reloads only at a safe idle
  point, so recording, pause, unsaved text, menu use, and posting are not interrupted

Stan uses the shared `zen-note-github-token` for the Inbox write. Voice memo filenames use
JST timestamp plus milliseconds (`YYYYMMDDHHMMSSmmm.md`) to avoid same-second path
collisions. iPhone Safari behavior across long silent intervals, pause/resume, and recognition
restart remains real-device dependent and should be validated on-device when behavior is in
question.

---

## 4. Auth

One shared `localStorage` key across the *entire* workbench and its apps:
`zen-note-github-token` (a GitHub fine-grained PAT). Verified: `token-settings.js` owns
reading/writing/clearing it, and the data clients checked (`onhand-core.js`,
`onhand-scheduling-bridge.js`, `board.js`, `backstage.js`, etc.) use that same token. Stan's
`stan-github.js` uses the same key for voice memo writes to `plzsayyes3/mynotebook/00_inbox`.
The token needs read access to private Canonical repositories where required and write access for capture/memo/Stan Inbox,
Canonical Shared Task completion, ON HAND state, TaskLiner and Techo routing paths.

---

## 5. Visual design (real values, `workbench.css`)

```
--bg:         #f1f0eb   (warm off-white, not dark)
--surface:    rgba(252,251,247,.90)
--surface-soft: rgba(235,234,229,.88)
--float:      rgba(255,255,255,.90)   (dock buttons)
--ink:        #292924   (near-black text)
--muted:      #8b8880
--accent:     #b8665d   (dusty rose/terracotta — used sparingly: today marker)
--shadow:     0 10px 30px rgba(37,34,29,.07)
```

- Body text: system sans-serif stack (`ui-sans-serif, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif`), 14px/1.5.
- UI chrome (labels, buttons, status text): monospace (`ui-monospace, SFMono-Regular,
  Menlo, monospace`), small (8–11px), wide letter-spacing — a "instrument panel" feel kept
  from the old Mission Control aesthetic, but in light colors.
- Freeform writing areas (the capture textarea, the News teaser paragraph) deliberately
  switch to a serif: **"Hina Mincho"** (Google Font) / "Yu Mincho" fallback — a literary/journal
  register distinct from the monospace UI chrome.
- Cards ("object"): 12px border-radius, soft shadow, `backdrop-filter: blur(8px)` — a light
  glassmorphism. Subtle dot-grid background pattern on `body`.
- Responsive breakpoints at 900px and 720px; the dock remains a two-row 5-column grid on narrow screens, with each button shrinking to the available width.
- Stan is intentionally visually separate from the light Workbench shell: it is a dark,
  low-distraction standby surface centered on the character's eyes.

**This is a complete departure from `DIRECTION.md`'s old "dark mission-control" description**
— which, as of 2026-09-12, `DIRECTION.md` itself no longer claims.

---

## 6. `my-storage-note`'s current layout (as of the 2026-09 migration)

This isn't cockpid's own structure, but every cockpid surface above depends on it, so it's
worth stating precisely. See `my-storage-note/MIGRATION_MAP.md` for the full history;
summary:

```
my-storage-note/
├─ memory/       machine-derived warehouse (extracted/entities/connections/indexes/sources/state)
│                 — this is what the AI extraction pipeline (mynotebook/scripts/*.py,
│                 sync-daily-to-storage.yml, sync-history-to-storage.yml) writes.
│                 It used to write to repo-root extracted/entities/connections/ directly;
│                 that compatibility path is now fully retired (root mirrors deleted).
├─ brain/        rules, interests, chat-modes, review queue, coordination (incl. cockpid-board.md)
├─ objects/      canonical human-facing objects: projects/assignments/tasks/ideas/references
├─ views/        regenerated read-models for UI consumers (e.g. views/projects.json, views/tasks.json)
└─ advice/       daily advice output (secretary-log's `daily_advice.py`)
```

Any future cockpid work that reads warehouse data (extracted items, entities, connections)
must use `memory/...` paths. Any future work that reads Project or Shared Task data should go
through `views/...` for display and write the corresponding canonical Object only when a
semantic mutation is required (for example, completing a Shared Task).

---

## 7. Known-shallow areas / real-device boundaries

The 2026-09-18 whole-workbench review traced the live entry, routing, Settings, Calendar,
TaskLiner bridge, Advice, ON HAND, Board, Projects, Project Town, Memo/Inbox, Resident,
News Home and Stan wiring. The following are still real-device or external-service boundaries
rather than code paths that have been fully exercised here.

- ON HAND's desktop/mobile completion, SKIP, today/date/week/month routing and cross-device
  state should still be exercised in the browser after deployment, even though the code paths
  were reviewed and the identified defects were fixed.
- Google Calendar OAuth / Calendar API behavior is external-service dependent. The Techo
  overlay and source-adapter path were reviewed, and Techo read failures now surface as
  `READ ERROR` rather than silently appearing empty.
- Stan's long-silence Speech Recognition restart and pause/resume behavior remain iPhone Safari
  real-device dependent.
- External apps launched by Workbench (Zen, My Internet Place, TaskLiner) have separate
  repositories; this inventory verifies Workbench's handoff/configuration to them, not their
  full internals.

---

## 7.1 2026-09-18 cross-surface review findings

The following live-path defects were corrected during the whole-workbench review:

- TaskLiner bridge / Settings no longer default to legacy `task-data`; an existing
  `task-data` local setting is migrated to `main`, while an explicitly configured custom
  branch is preserved.
- Calendar month reads no longer cache transient read errors. A source failure is shown as
  `READ ERROR` instead of an empty schedule followed by `TECHO LIVE`.
- Workbench Capture, Zen Memo and Stan use collision-resistant millisecond timestamp filenames,
  and Inbox → Daily accepts both historical second-resolution names and the new millisecond
  form.
- Inbox → Daily counts/enables only mergeable timestamp memo files rather than every Markdown
  file in the Inbox.
- Project Town handoff text derives the Project source from the active/canonical source instead
  of relying on clipboard rewriting of a legacy `gpts` path.
- Advice's `← WORKBENCH` closes the parent Workbench drawer when Advice is embedded, avoiding
  a Workbench-within-Workbench iframe.
- Numeric Dock shortcuts are suppressed while Settings or Memo is open.
- Updated live modules use versioned script URLs so iPhone/browser caches do not retain the
  reviewed pre-fix implementations.
- Advice marks a message read only after its Markdown body has loaded successfully.
- Projects / Project Town surface partial per-project read failures instead of silently reducing
  the visible Project count.
- Home Today, Calendar day/week/month and Full Month use aligned exact-item deduplication so
  duplicated Techo rows do not appear differently by surface.
- Stan persists an unsent voice memo with a stable filename and retries it idempotently; a new
  recording cannot overwrite a pending failed memo.
- Settings keeps the legacy `gpts/projects` value only as the compatibility-adapter sentinel,
  labels it `CANONICAL VIEW`, and CHECK verifies `my-storage-note/views/projects.json`.

## 8. Root-level files: what's alive, what isn't (evidence, not guesses)

Every claim here is from `git log` dates and `grep` for inbound references — see the
commands used, not just the conclusion, so this can be re-verified later.

### Confirmed dead — safe to archive

`pattern-01.html` … `pattern-05.html`, `prototype-01.html` … `prototype-07.html`,
`refined.html`, `index-00.html`, `ai-message.js`

- All last touched **2026-09-04**, the same commit ("feat: show the in-progress TaskChute
  task beside the cockpit clock"), and nothing since.
- `index-00.html` is a gallery page linking to `main.html` and `pattern-01`–`05` only —
  it does not link `refined.html` or any `prototype-*.html`, meaning those seven are
  reachable from **nothing** at all, not even each other.
- Nothing in `workbench/` or the live root `index.html` references any of these.
- `ai-message.js` is a special case: it *was* touched more recently (2026-09-09, "Add Techo
  calendar entry point") but a repo-wide search found **zero** `.html` files that load it —
  it's dead code that looks alive from its commit date alone. Worth double-checking with a
  `git log -p` on that commit before deleting, in case it was meant to be wired in and
  isn't yet, rather than abandoned.

### Recently superseded — likely safe, but confirm no one still opens these by direct URL/bookmark

`calendar.html`, `calendar.js`, `calendar.css` (root level)

- Last touched 2026-09-09 — the same day `workbench/calendar.html` was first created.
  Every calendar feature commit since (09-10, 09-12) went into the `workbench/` version;
  the root version has had zero commits since being superseded.
- The root file's favicon is a dark background with a green glyph — matching the *old*
  dark aesthetic, not the current `#f1f0eb` one — consistent with it being the
  pre-workbench implementation.
- Only reachable via nothing live (not linked from `workbench/` or root `index.html`).

### Ambiguous — do not archive without asking; these may be intentionally kept

- **`main.html`** ("COCKPID / Mission Control") — this is literally the old dark
  mission-control UI that the pre-today `DIRECTION.md` used to describe. Its data-fetching
  code was updated to the new `memory/` paths in the 2026-09 migration sweep, so it still
  runs, but it's reachable only through `index-00.html`'s gallery — not from the live
  product. It may be intentionally kept as a reference/fallback view of the old design, or
  it may simply not have been cleaned up yet. **Recommend asking rather than assuming
  either way.**
- **`board.html`** (root level) — the standalone "Deck Board 16×16" personal
  card-arranging tool. This is a **different feature** from workbench's own "Board" (§3.4,
  which shows `cockpid-board.md`) despite the shared name — don't conflate them when
  deciding. `my-storage-note/MIGRATION_MAP.md` explicitly names `board.html` as a
  "standalone reader" it deliberately migrated to `memory/` paths, alongside genuinely-live
  files like `workbench/onhand.js` — this reads as an intentional signal that it's still a
  live, separately-used tool (e.g. opened directly by URL/bookmark), not dead weight.
  **Recommend keeping unless told otherwise.**

### Confirmed alive — keep

`ai-message.js` is dead (see above) but `zen-memo.js` / `zen-memo.css` are genuinely loaded
by `workbench/index.html` itself (`<script src="../zen-memo.js">`,
`<link rel="stylesheet" href="../zen-memo.css">`) and actively maintained (`zen-memo.js`
last touched on 2026-09-12, "Use configured Short Memo destination"). Not stale.

---

## 9. What this document does not cover

- `board.html` (root)'s own internals (the Deck Board 16×16 tool) — out of scope, it's a
  separate, currently-untouched-by-this-work app.
- `main.html`'s exact feature completeness — confirmed it runs, not confirmed it's correct.
- Anything inside the external apps this workbench launches (zen-note, My_Internet_place,
  taskliner_taskchute-line) — those are separate repositories.

## 10. Final Area migration verification (2026-09-23)

Canonical verification passed with `python3 scripts/build_views.py`, the 10-test Python suite,
and the `views/areas.json` unassigned-bucket audit. Cockpid JavaScript syntax checks passed for
every `workbench/*.js` file. The full Cockpid suite is 51 passing and 1 failing: the pre-existing
Keyboard routing contract still expects the legacy `keyboard.html` page route, while the live
router points key 9 at the external Keyboard iframe. This documentation task does not change
that unrelated routing behavior.

Automated contract tests covered the Area/Project/Assignment/Task grouping contract, Project
detail and handoff paths, Backstage pause/review states, ON HAND completion and scheduling
semantics, direct Project links, and Workbench Idea → Area → destination branching. A manual
browser/device walkthrough was not completed in this run; browser/device and external-service
behavior remains subject to the boundaries listed above.

## 11. Menu reorganization (2026-09-23)

Following the 2026-09-23 22:20 Daily: `0` opens For My Sons, Keyboard moved to a header icon,
Dictionary moved from `6` to `9`, and the Area-first Backstage moved from `7` to `6 / PROJECT · ASSIGNMENT` (dock label `PJ · Assign`).
Key `7` is unassigned. The Secret Desk easter egg was retired. The Cockpid suite is 54/54 passing,
including the updated Keyboard routing contract.
