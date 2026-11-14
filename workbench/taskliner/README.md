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
