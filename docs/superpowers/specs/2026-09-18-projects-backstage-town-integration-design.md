# Projects / Backstage / Project Town Integration

## Goal

Provide one Project workspace instead of two separate Project surfaces. Backstage remains the operational entry point for browsing and selecting Projects; Project Town becomes an alternate status view for the selected Project.

## Current state

- Backstage is the project shelf: it loads project records, supports filtering by active/archived state, shows Current/Next, workstreams, relations, and source links.
- Project Town is a separate app: it loads the same project view through `project-source-adapter.js`, infers activity and momentum, and presents a visual room with a Project list and detail modal.
- The project source is already normalized through `my-storage-note/views/projects.json` when the default `gpts/projects` source is selected.

## Proposed user experience

- Dock key 7 becomes `PROJECTS`.
- Dock key 8 is removed from the runtime tail.
- The Project workspace keeps Backstage's list/detail layout as the default `OVERVIEW` view.
- The selected Project detail gains a `TOWN` view toggle. The Town view shows the existing activity, momentum, decision, and project-room presentation for that Project.
- Direct links to the existing `project-town.html` remain available as a compatibility entry point, but the canonical navigation is key 7.

## Architecture

Create a shared, DOM-independent Project status model boundary from the existing Project Town model functions. The model accepts a normalized project record and returns activity, momentum, motivation, decision text, and source path. Backstage owns selection and detail state; the integrated Town panel consumes the selected record and the shared status model.

Do not duplicate GitHub fetching or introduce a second project schema. `project-source-adapter.js` remains the source adapter, and both views consume the existing normalized records. Existing Backstage relation traversal and Project Town inference remain behaviorally equivalent.

## Routing and compatibility

- Change the runtime dock entry from `8 / PROJECT TOWN` to no numeric entry.
- Change the key 7 title from `BACKSTAGE` to `PROJECTS`.
- Keep the `backstage` app name as an internal compatibility alias where practical, but expose the user-facing title as `PROJECTS`.
- Keep `project-town.html` and its standalone assets untouched or minimally adapted so old bookmarks continue to work.

## Error handling

- Preserve the existing partial-read and token error states.
- If the selected record lacks fields needed for Town inference, use the existing inference fallbacks rather than hiding the Project.
- A failure in the Town panel must not blank or disable the Backstage list/detail view.

## Testing

- Unit-test the shared status model for working, researching, review, external-wait, paused, and momentum cases.
- Test that a selected Backstage Project renders the Town panel from the same normalized record.
- Test the key 7/8 routing contract and preserve the standalone Project Town entry point.
- Run JavaScript syntax checks and the repository's available tests, then inspect the final diff for unrelated changes.

## Non-goals

- No migration of Project Markdown or `views/projects.json`.
- No new Project editing or persistence UI.
- No redesign of the Project Town artwork.
- No removal of the standalone Project Town URL.
