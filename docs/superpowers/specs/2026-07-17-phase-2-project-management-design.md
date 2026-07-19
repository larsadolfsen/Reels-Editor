# Phase 2 — Project Management

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** brainstormed, resolved. Implementation plan follows immediately per the roadmap's process rule.

## Goal

Give the user real control over saving and organizing their work, instead of the current silent, single-implicit-project autosave.

## Why this phase exists

Every edit already triggers `PUT /api/projects/{id}`, persisted to `data/projects/<id>.json` on disk — nothing is at risk of being lost day-to-day in the same browser. But there was no way to name a project (always `"reel"`), see a list of projects, switch between them, or recover one if browser storage is cleared. `static/api-ensure-project.js` created-or-loaded exactly one project per browser via a single `localStorage.projectId` key, with no multi-project concept in the UI at all, even though the backend's `POST/GET/PUT /api/projects[/{id}]` routes already supported arbitrary numbers of projects.

## Hard requirement: survives browser storage being cleared

A project must still be findable if `localStorage` is wiped (cache/storage reset, a different browser, a different machine). The project list is sourced from the server (every file on disk via a new `GET /api/projects`), never from `localStorage`. `localStorage.projectId` is a "reopen what I had open last" convenience only. A cleared/empty `localStorage` shows the user their existing projects (the picker screen below), never a silent new untitled project.

## Resolved design

### Overall flow

**Cold start:**
- `localStorage.projectId` points at a project that still exists on disk → load straight into the editor (today's fast path, unchanged).
- Otherwise (missing/invalid `localStorage.projectId`, or zero projects exist anywhere) → show a full-screen **picker** view instead of auto-creating anything. The picker lists every project (name + relative "last edited" time, newest-edited first); clicking a row opens it in the editor. A "+ New Project" button prompts for a name and creates one. If zero projects exist on disk, the picker shows an empty state with just the create button — no silent auto-create, ever.

**Inside the editor:** a new **PROJECTS** entry is added to the left icon rail, positioned last (`FILES / TEXT / CAPTIONS / SETTINGS / EXPORT / PROJECTS`). It opens `#panel-projects`, a context-panel section (same pattern as the other panels) showing the same list: every row's name is inline-editable (click, type, blur/enter saves via rename — no separate rename dialog), a switch action, and per-row Delete/Duplicate. "+ New Project" sits at the top of the panel too.

**Leaving the current project** — switching to a different existing project, or creating a new one — always: (1) flushes an explicit save of the current project, (2) shows a brief confirmation, (3) then switches/creates. This is deliberate even though autosave already covers day-to-day edits: it's a safety flush plus a moment to avoid an accidental click, not a sign autosave is untrusted.

**Deleting the currently-open project** immediately falls back to the picker view after the delete completes (same component/flow as the cold-start empty/invalid-localStorage path, not a separate screen).

**Duplicate** is a fast, un-prompted action: clones the project with a new id and `name = f"{name} copy"`, no name prompt.

### Save indicator

A small "Saving…/Saved" indicator lives in the left rail's `#panel-brand` area — persistent and visible regardless of which panel is open (not scoped to the PROJECTS panel). It reflects the state of the existing per-edit autosave (`PUT /api/projects/{id}`), plus this phase adds a `beforeunload` flush so navigating away or closing the tab doesn't drop an in-flight edit.

### Data model

`app/models.py` — `Project` gains:
- `created_at: datetime` — stamped once, on create, never changed after
- `updated_at: datetime` — restamped on every save

Both serialize as ISO strings via Pydantic's default `datetime` handling.

### Backend API

`app/store.py`:
- `list_projects(data_dir) -> list[Project]` — reads every `data/projects/*.json`; a file that fails to parse is skipped, not raised, so one corrupt project can't break the whole list
- `delete_project(project_id, data_dir) -> None` — removes the file
- `save_project` restamps `updated_at = now()` on every call, and sets `created_at` only if it's unset (first save)

`app/main.py` — new routes:
- `GET /api/projects` → list of lightweight summaries (`id`, `name`, `created_at`, `updated_at`), sorted newest-`updated_at`-first — not the full clip/text/caption payload, so listing stays cheap. Both the picker and the in-editor PROJECTS panel render this order as-is, no client-side re-sorting.
- `DELETE /api/projects/{pid}` → deletes the file, 204
- `POST /api/projects/{pid}/duplicate` → loads the project, assigns a new id and `name = f"{name} copy"`, saves as a new file, returns the new `Project`

Existing `POST/GET/PUT /api/projects[/{id}]` are unchanged in shape (`PUT` still takes/returns a full `Project`).

### Frontend components

One function/component per file, per project convention:

**API layer:**
- `static/api-list-projects.js` — `Api.listProjects()` → `GET /api/projects`
- `static/api-delete-project.js` — `Api.deleteProject(id)` → `DELETE /api/projects/{id}`
- `static/api-duplicate-project.js` — `Api.duplicateProject(id)` → `POST /api/projects/{id}/duplicate`
- `static/api-rename-project.js` — `Api.renameProject(id, name)` → loads current project, patches `name`, `PUT`s it back

**UI:**
- `static/ui-project-picker.js` — full-screen picker: list + empty state + "+ New Project" (name prompt); mounted/unmounted by `editor.js` at cold-start, before the editor shell is shown
- `static/ui-project-list-row.js` — one row: inline-editable name field, last-edited text, Delete/Duplicate icon buttons; reused by both the picker and the in-editor PROJECTS panel — one component, not two copies
- `static/panel-projects.js` — `#panel-projects` context-panel section: renders the list via `ui-project-list-row.js`, "+ New Project" button, wires switch/delete/duplicate including the confirm+flush-save step
- `static/ui-save-indicator.js` — "Saving…/Saved" component for `#panel-brand`; exposes `setSaving()`/`setSaved()`

**Rewritten:**
- `static/api-ensure-project.js` — no longer auto-creates. Returns the project if `localStorage.projectId` is valid, otherwise returns `null` so `editor.js` can show the picker.

**Integration (`static/editor.js`):** wires the PROJECTS rail entry (`openProjectsPanel()`), the cold-start branch (picker vs. straight-to-editor based on `ensureProject()`'s return value), a confirm+flush-save helper shared by switch/create/delete-current, a `beforeunload` listener that flushes a save, and save-indicator calls around every `saveProject()`.

**CSS:** `static/css/components/project-picker.css`, `static/css/components/project-list-row.css`, plus a small addition (or its own `save-indicator.css`) for the indicator.

**`static/index.html`:** each component task adds its own non-overlapping markup block — `#project-picker` (picker screen container), `#panel-projects` (context-panel section), the save-indicator's mount point inside `#panel-brand`.

### Edge cases

- Rename to empty string is rejected client-side (keeps the previous name); no backend validation needed since `name` is a plain string field
- Duplicate name collisions are allowed — `id` is the real identity, two projects can share a display name
- Deleting a project that's neither the currently-open one nor the `localStorage`-remembered one just removes it from the list, no navigation change
- The confirm-and-flush-save step really `await`s the `PUT` before navigating, so a slow save can't be silently dropped by an immediate switch
- A corrupt/unparseable project JSON file is skipped by `list_projects`, not a 500 for the whole panel

### Testing

Backend: `tests/test_store.py` gets coverage for `list_projects` (including the skip-corrupt-file case), `delete_project`, and timestamp stamping; new route tests for the three new endpoints (wherever existing route tests for `main.py` live, or a new `tests/test_main.py` if none exists yet). Frontend has no existing JS test framework in this repo — new frontend files follow the existing pattern of manual in-browser verification, not a new test framework.

## Subthread breakdown (for parallel worktree dispatch)

**Batch 1 — parallel, no dependencies:**
1. Backend data layer: `Project` timestamps (`models.py`) + `store.py` (`list_projects`, `delete_project`, save-stamping) + their tests
2. `ui-save-indicator.js` + its CSS + `#panel-brand` markup mount point
3. `ui-project-list-row.js` + `project-list-row.css` (generic row component, driven entirely by props/callbacks — no dependency on the API layer)
4. Rewrite `api-ensure-project.js` to return `null` instead of auto-creating

**Batch 2 — parallel, depends on Batch 1:**
5. Backend routes: `main.py` `GET /api/projects` / `DELETE /api/projects/{pid}` / `POST /api/projects/{pid}/duplicate` + route tests (depends on task 1)
6. `ui-project-picker.js` + `project-picker.css` + its `#project-picker` markup block (depends on task 3 for the row component)
7. `panel-projects.js` + its `#panel-projects` markup block (depends on task 3 for the row component)
8. Project API client functions — `api-list-projects.js`, `api-delete-project.js`, `api-duplicate-project.js`, `api-rename-project.js` (written against the documented route contract; can be developed alongside task 5, verified end-to-end once both land)

**Batch 3 — integration, depends on all of Batch 1 + Batch 2:**
9. `editor.js` wiring: PROJECTS rail entry, cold-start branch, confirm+flush-save helper, `beforeunload` flush, save-indicator calls around `saveProject()`, final `index.html` assembly

## Out of scope

- Project thumbnails/preview images — text-only rows (name + last-edited) for this phase; a real preview needs a frame-grab or render step, tracked as a later backlog item if wanted
- Full parity of rename/delete/duplicate on the picker screen — the picker is list + open + create only; those actions live in the in-editor PROJECTS panel
- A visible confirmation/name prompt on duplicate — it's a fast, silent-except-for-the-`"copy"`-suffix action
