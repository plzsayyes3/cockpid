# Scrap Cards Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans.

**Goal:** Add screenshot review cards mixed with canonical Ideas and an INBOX sidebar.
**Architecture:** Buildless independent app launched by existing router. Pure ranking/model module, injectable GitHub storage adapter, DOM controller with authenticated image loading.
**Tech Stack:** Existing vanilla JavaScript/CSS/HTML, Node test runner, GitHub Contents API.
**Spec:** docs/superpowers/specs/2026-11-05-scrap-cards-design.md

## Global Constraints
- Private captures only in mynotebook; Idea view read only.
- Checkbox means handled, not deleted. Narrow sidebar collapses.
- No external AI or image hosting, no credentials in URLs or repository.

## Review Focus
- Upload interrupted after asset write: retry same stable ID, no duplicate cards.
- Concurrent metadata changes: merge changed fields onto latest SHA.
- Broken/missing source: preserve usable captures and identify degraded Idea/context loading.
- Untrusted text and image paths: textContent/escaped HTML, reject external or traversing asset paths.
- Empty/stale recent context: honest random fallback, exclude archived Ideas.

### Task 1: Model and source adapter
Files: workbench/scrap-model.js, scrap-store.js, scrap.test.js.
Interfaces: model.selectIdeas(ideas, context, {limit,rng,pinned}), visibleCaptures(cards, handled), dates(now, count); store created via createStore({fetch, token, inboxSource, dailySource}). store.list(), createCapture(capture, base64), updateCapture(path, patch), loadIdeas(), recentContext(now), image(card), saveInbox(text).
- [x] Write and run failing behavioral tests for filtering, Japanese ranking/randomness, private source routing, upload retry, conflict preservation, validation and partial source failure.
- [x] Implement and run targeted tests.

### Task 2: Card UI and integration
Files: workbench/cards.html, cards.css, cards.js; app-routing.js, index.html, SURFACES.md.
Interfaces: use Task 1 adapter, shared saved Workbench token and configured sources. Expose Cards launch button without changing numeric shortcuts.
- [x] Implement mixed grid, capture editor, image uploads/paste/drop, handled filter/restore, pin/refresh Ideas, collapsible INBOX with draft retention and shortcut.
- [x] Add routing integration check and browser QA for desktop/mobile, preview fixture only in local ignored path.
- [x] Run syntax and whole suite; compare baseline known failures.
- [x] Review diff and publish repository changes through existing GitHub Pages workflow.

## Baseline
2026-11-05: 69 tests, 67 pass, 2 existing failures: Backstage preserves the legacy Project-only fallback contract; memo route metadata is recorded only after existing Inbox writes succeed. Unrelated files remain unchanged.

## Execution record
- Task 1 complete: 10 initial model/store behavioral tests passed after failing for missing modules.
- Task 2 complete: Cards UI and router integrated; desktop and 390px iframe QA verified upload, edit, handled/restore, Inbox and sidebar. QA uses synthetic in-memory API; no real user files were created.
- Fresh reviewer found stale-field concurrent overwrite and editable in-flight upload fields. Fixed with changed-field-only patch and locked upload editors; regression tests observed failing then passing.
- Final verification: 14 new tests pass. Whole suite 83 tests: 81 pass, same 2 pre-existing failures named above. Syntax checks and git diff --check pass.
- Design decisions already recorded in spec; no deferred reviewer findings. Real device and live authenticated data roundtrip are not tested in this environment.
