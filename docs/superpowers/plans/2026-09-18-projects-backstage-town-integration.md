# Projects / Backstage / Project Town Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Project Town into the Backstage Project workspace so key 7 is the canonical Project surface and Town is a status view for the selected Project.

**Architecture:** Extract the DOM-independent activity/momentum/decision logic from Project Town into a shared browser/CommonJS-compatible model. Backstage remains responsible for fetching, selecting, and rendering Project records; its detail view consumes the shared model for an embedded Town/status panel. The standalone Project Town URL remains as a compatibility surface.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, GitHub Contents API adapter, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-18-projects-backstage-town-integration-design.md`

## Global Constraints

- Do not migrate Project Markdown or `my-storage-note/views/projects.json`.
- Do not add Project editing or persistence UI.
- Preserve the standalone `workbench/project-town.html` entry point.
- Preserve existing token, partial-read, and error behavior.
- Keep the previous Dictionary changes intact and out of scope.
- Do not overwrite concurrent changes; compare `main` and target-file SHAs before implementation and immediately before edits.

---

### Task 1: Extract and test the shared Project status model

**Files:**
- Create: `workbench/project-status-model.js`
- Create: `workbench/project-status-model.test.js`
- Modify: `workbench/project-town-model.js`
- Modify: `workbench/project-town.html`

**Interfaces:**
- Produces `window.COCKPID_PROJECT_STATUS` and CommonJS exports with `activity(project)`, `momentum(project)`, `motivation(project)`, `decisionText(project, activity)`, `detailMessage(activity)`, and `projectSourcePath(project)`.
- Consumes the normalized Project fields already used by Project Town: `activity`, `current`, `next`, `last_touched`, `commitment`, `desk`, `decision`, `path`, and `id`.

- [ ] **Step 1: Write failing model tests** for explicit activity, inferred researching/review/external-wait/paused activity, momentum, decision text, and source path.
- [ ] **Step 2: Run `node --test workbench/project-status-model.test.js`** and confirm failure because the model module does not exist.
- [ ] **Step 3: Move the pure logic into `project-status-model.js`** without DOM access; preserve the existing labels, thresholds, and Japanese messages.
- [ ] **Step 4: Update `project-town-model.js`** to consume the shared model for those decisions while leaving Town-specific rendering and data loading in place.
- [ ] **Step 5: Load `project-status-model.js` before `project-town-model.js`** in `project-town.html`.
- [ ] **Step 6: Run the focused model tests and verify all pass.**

### Task 2: Add the Town status view to Backstage detail

**Files:**
- Modify: `workbench/backstage.html`
- Modify: `workbench/backstage.js`
- Modify: `workbench/backstage.css`
- Test: `workbench/project-status-model.test.js`

**Interfaces:**
- Consumes `window.COCKPID_PROJECT_STATUS` and the existing selected Project object in `backstage.js`.
- Produces an `OVERVIEW / TOWN` toggle inside the existing Project detail panel, with Town status rendered from the same selected Project record.

- [ ] **Step 1: Add a failing rendering contract test** for the selected Project status view data: the rendered model must use the same Project `id`, activity, momentum, and decision values as the Backstage detail record.
- [ ] **Step 2: Run the focused test and confirm failure** before adding the integration code.
- [ ] **Step 3: Add the toggle and Town panel markup** inside the existing detail content without replacing the current Overview sections.
- [ ] **Step 4: Render the Town panel** from the shared status model, including activity, momentum, motivation, turn message, decision text, and a compact project-room/status treatment using existing Town CSS classes where practical.
- [ ] **Step 5: Keep Town rendering failure-isolated** so a model or panel error displays a local status message and leaves the Project list/detail usable.
- [ ] **Step 6: Run model and integration tests and verify both Overview and Town data use the selected Project.**

### Task 3: Make Projects the canonical route

**Files:**
- Modify: `workbench/app-routing.js`
- Modify: `workbench/index.html`
- Modify: `README.md`
- Modify: `SURFACES.md`
- Test: `workbench/routing-contract.test.js`

**Interfaces:**
- Consumes the existing `backstage` and `projecttown` app entries.
- Produces key 7 labeled `PROJECTS`, removes key 8 from the runtime dock, and preserves `workbench/project-town.html` as a direct compatibility URL.

- [ ] **Step 1: Write failing routing contract tests** asserting key 7 is Projects, key 8 is absent from the runtime dock entries, and `project-town.html` still exists.
- [ ] **Step 2: Run the routing test and confirm failure** against the current key 7/key 8 mapping.
- [ ] **Step 3: Update runtime and static dock labels** so key 7 opens the existing Backstage surface with the user-facing title `7 / PROJECTS` and key 8 is no longer injected.
- [ ] **Step 4: Update README and SURFACES** to describe one canonical Project surface plus the standalone compatibility URL.
- [ ] **Step 5: Run routing tests and syntax checks.**

### Task 4: Full verification and review

**Files:**
- Modify only files required by Tasks 1–3.

- [ ] **Step 1: Run `node --test workbench/project-status-model.test.js workbench/routing-contract.test.js`.**
- [ ] **Step 2: Run `node --check` on every changed JavaScript file.**
- [ ] **Step 3: Run `git diff --check` and inspect the complete diff for unrelated changes or regressions to Dictionary.**
- [ ] **Step 4: Re-read the spec and verify each goal, routing, compatibility, error-handling, and non-goal requirement.**
- [ ] **Step 5: Report the exact verification results and any limitations, without claiming browser behavior that was not tested.**
