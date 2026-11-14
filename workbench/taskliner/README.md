# Internal TaskLiner

Stage 1 of the DUO planner integration. `controller.mjs` exports `mount(container)` and reuses one instance.
Its result provides `element`, `root`, `getDate()`, `navigate(date)`, `exportMarkdown()`, `setVisible(bool)`, `save()`, `pull()`.
Reparent `element` when adding the planner; do not create another TaskLiner or copy its task data.

The view and task behavior were migrated from `plzsayyes3/taskliner_taskchute-line` commit
`55d44871aa8918dac614b4384f5b1322262b1bb7`. The previous loaders and runtime text replacements
were expanded during migration. `app.mjs`/`app.css`/`app-markup.mjs` are now static editable source;
there is no runtime fetch/eval/document.write or HTML patching. Helper modules and their behavioral tests
were retained. `template-store.mjs` removes the old iframe injection and uses the scoped client instead.

`sync.js` is DOM-independent and retains legacy config, dirty-day and known-SHA keys.
`github-client.js` scopes request pacing and rate-limit cooldown to TaskLiner, without replacing global fetch.
Normal Tasks use the same component planned for the future left-hand planner page.

Run `node --test workbench/taskliner/*.test.js` from the repository root.
Run the existing Workbench suite separately with `node --test workbench/*.test.js`.

Migration safety fix: moving a task to tomorrow also marks the target date dirty, so it can be
synchronized when that day is opened. This corrects the inherited missing notification.

## GitHub version recovery (2026-11-15)

The in-Workbench TaskLiner menu offers **GitHub版で復旧** and **復旧前に戻す** alongside the existing Pull, Sync and conflict-driven local overwrite. It operates on **only the selected date** in the configured TaskLiner repo/branch/folder, using GitHub API requests with `cache: no-store`. The remote Markdown is read before local replacement. Missing/empty remote files or changed local/date/config state abort with local content intact.

Before applying a successful recovery, a full Markdown copy is stored under app-local `localStorage` recovery keys. Recovery records are keyed by repo/branch/folder/date and never include GitHub credentials. This is device-local backup, **not an upload to GitHub**; Safari/PWA and native WKWebView have separate storage. Backups accumulate without automatic deletion to avoid silently discarding recovery data, so storage quota failure aborts the replacement. The Restore control brings back the most recent backup locally and deliberately blocks background sync until the user explicitly presses Sync; GitHub SHA conflict protection remains active.

The normal Pull retains its prior behavior but now backs up a dirty local snapshot before replacing it. A server-side concurrent edit can still cause a later save conflict; recovery is not a way to disable optimistic concurrency for future edits. Test with `node --test workbench/taskliner/*.test.js`. The native shell only needs to reload the updated GitHub Pages site; no Swift recompilation is required.
