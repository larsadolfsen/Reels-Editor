# Phase 2 — Project Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the user real control over saving and organizing projects — name, list, switch, rename, delete, duplicate — with a project list sourced from disk (survives a wiped `localStorage`) instead of today's silent single-implicit-project autosave.

**Architecture:** Backend gains `created_at`/`updated_at` timestamps on `Project`, plus `list_projects`/`delete_project` in `app/store.py` and three new routes in `app/main.py` (`GET /api/projects`, `DELETE /api/projects/{pid}`, `POST /api/projects/{pid}/duplicate`). Frontend gains a full-screen picker shown at cold start when no valid project is remembered, a PROJECTS entry in the existing left icon rail opening a `#panel-projects` context-panel section, a persistent "Saving…/Saved" indicator in `#panel-brand`, and a shared `UI.projectListRow` component reused by both screens.

**Tech Stack:** FastAPI + Pydantic (backend), vanilla JS + hand-rolled `window.UI`/`window.Api` modules, no build step (existing stack — see `CLAUDE.md`).

## Global Constraints

- No JS build step/bundler — icon SVGs are hand-inlined; use [Lucide](https://lucide.dev) paths with the existing `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` wrapper.
- `window.UI.*` components and `window.Api.*` calls each live in their own file, one function/component per file — never a shared catch-all.
- Prefer small focused modules over broad shared abstractions, both backend and frontend.
- Every `static/*.js` and `static/css/**/*.css` file opens with a one- or two-line purpose comment; keep it current when a file's role changes.
- No inline `style="..."` attributes anywhere in `static/index.html` or JS-rendered markup — all styling lives in `static/css/**` component files as classes.
- Frontend has no test framework in this repo — new frontend files are verified by manual in-browser check (final integration task), not new test infra.

---

## Task 1: Project timestamps + `list_projects`/`delete_project` in `app/store.py`

**Files:**
- Modify: `app/models.py`
- Modify: `app/store.py`
- Modify: `tests/test_models.py`
- Modify: `tests/test_store.py`

**Interfaces:**
- Produces: `Project.created_at: datetime`, `Project.updated_at: datetime` (both `default_factory=lambda: datetime.now(timezone.utc)`); `ProjectSummary(BaseModel)` with `id: str, name: str, created_at: datetime, updated_at: datetime`; `store.list_projects(data_dir) -> list[Project]`; `store.delete_project(project_id: str, data_dir) -> None`; `store.save_project` now restamps `p.updated_at` on every call (mutates the passed-in `Project` in place, same as it already mutates nothing else — callers keep using the same object).

- [ ] **Step 1: Write failing model tests**

Add to `tests/test_models.py`:

```python
from datetime import datetime as _datetime

def test_project_has_created_and_updated_at():
    p = Project(name="reel1")
    assert isinstance(p.created_at, _datetime)
    assert isinstance(p.updated_at, _datetime)

def test_project_timestamps_round_trip():
    p = Project(name="reel1")
    assert Project.model_validate_json(p.model_dump_json()) == p
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k timestamps_or_created -v`
Expected: FAIL — `Project` has no field `created_at`

- [ ] **Step 3: Add timestamp fields + `ProjectSummary` to `app/models.py`**

At the top of `app/models.py`, change the import line to:

```python
from datetime import datetime, timezone
from uuid import uuid4
from pydantic import BaseModel, Field, model_validator
```

In `Project`, add two fields (after `id`, before `name` or anywhere in the class body — order doesn't matter for Pydantic):

```python
class Project(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    width: int = 1080
    height: int = 1920
    fps: int = 30
    media_library: list[MediaItem] = []
    clips: list[ClipLayer] = []
    text_blocks: list[TextBlockLayer] = []
    text_presets: dict[str, TextPreset] = {}
    captions: CaptionTrack | None = None
```

At the end of the file, add a lightweight summary model for the project list (kept separate from `Project` so `GET /api/projects` never has to serialize the full clip/text/caption payload):

```python
class ProjectSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: PASS (all tests, including the pre-existing `test_json_round_trip`)

- [ ] **Step 5: Write failing store tests**

Add to `tests/test_store.py`:

```python
from app.store import list_projects, delete_project

def test_save_project_restamps_updated_at(tmp_path):
    p = Project(name="reel1")
    original = p.updated_at
    save_project(p, tmp_path)
    assert p.updated_at >= original

def test_list_projects_returns_all(tmp_path):
    a = Project(name="a")
    b = Project(name="b")
    save_project(a, tmp_path)
    save_project(b, tmp_path)
    ids = {x.id for x in list_projects(tmp_path)}
    assert ids == {a.id, b.id}

def test_list_projects_skips_corrupt_file(tmp_path):
    a = Project(name="a")
    save_project(a, tmp_path)
    (tmp_path / "projects" / "corrupt.json").write_text("{not json", encoding="utf-8")
    result = list_projects(tmp_path)
    assert [x.id for x in result] == [a.id]

def test_delete_project_removes_file(tmp_path):
    a = Project(name="a")
    save_project(a, tmp_path)
    delete_project(a.id, tmp_path)
    assert list_projects(tmp_path) == []

def test_delete_project_missing_file_is_noop(tmp_path):
    delete_project("nonexistent-id", tmp_path)  # must not raise
```

- [ ] **Step 6: Run to verify failure**

Run: `.venv/Scripts/python -m pytest tests/test_store.py -v`
Expected: FAIL — `list_projects`/`delete_project` not defined, `ImportError`

- [ ] **Step 7: Implement in `app/store.py`**

Change the top imports to:

```python
import json
from datetime import datetime, timezone
from pathlib import Path
from app.models import Project, TextPreset
```

Replace `save_project` and add `list_projects`/`delete_project`:

```python
def save_project(p: Project, data_dir) -> None:
    p.updated_at = datetime.now(timezone.utc)
    (_projects_dir(data_dir) / f"{p.id}.json").write_text(p.model_dump_json(indent=2), encoding="utf-8")

def load_project(project_id: str, data_dir) -> Project:
    return Project.model_validate_json((_projects_dir(data_dir) / f"{project_id}.json").read_text(encoding="utf-8"))

def list_projects(data_dir) -> list[Project]:
    projects = []
    for f in _projects_dir(data_dir).glob("*.json"):
        try:
            projects.append(Project.model_validate_json(f.read_text(encoding="utf-8")))
        except Exception:
            continue
    return projects

def delete_project(project_id: str, data_dir) -> None:
    (_projects_dir(data_dir) / f"{project_id}.json").unlink(missing_ok=True)
```

(Leave `load_project` where it already is relative to `save_project`; `list_projects`/`delete_project` go immediately after it.)

- [ ] **Step 8: Run to verify pass**

Run: `.venv/Scripts/python -m pytest tests/test_store.py tests/test_models.py -v`
Expected: PASS (all tests, including the pre-existing `test_project_round_trip`, which still holds since `save_project` mutates the same `p` object both the test and `load_project` compare against)

- [ ] **Step 9: Full test suite + commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, no regressions

```bash
git add app/models.py app/store.py tests/test_models.py tests/test_store.py
git commit -m "feat: add Project created_at/updated_at timestamps + list_projects/delete_project"
```

---

## Task 2: Backend routes — `GET /api/projects`, `DELETE /api/projects/{pid}`, `POST /api/projects/{pid}/duplicate`

**Depends on:** Task 1 (`ProjectSummary`, `store.list_projects`, `store.delete_project`)

**Files:**
- Modify: `app/main.py`
- Modify: `tests/test_main.py`

**Interfaces:**
- Consumes: `store.list_projects(data_dir) -> list[Project]`, `store.delete_project(id, data_dir) -> None`, `store.load_project`, `store.save_project`, `models.ProjectSummary`, `models.new_id`
- Produces: route functions `list_projects() -> list[ProjectSummary]` (sorted newest-`updated_at`-first), `delete_project(pid: str) -> None` (204), `duplicate_project(pid: str) -> Project`

- [ ] **Step 1: Write failing route tests**

Add to `tests/test_main.py` (near the bottom, following the file's existing "import inline per test" style):

```python
def test_list_projects_route_sorted_newest_updated_first(tmp_path, monkeypatch):
    from app import store
    from app.main import list_projects as route_list_projects
    from app.models import ProjectSummary
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="a")
    store.save_project(a, tmp_path)
    b = Project(name="b")
    store.save_project(b, tmp_path)  # saved after a -> newer updated_at
    result = route_list_projects()
    assert [r.id for r in result] == [b.id, a.id]
    assert isinstance(result[0], ProjectSummary)

def test_delete_project_route_removes_file(tmp_path, monkeypatch):
    from app import store
    from app.main import delete_project as route_delete_project, list_projects as route_list_projects
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="a")
    store.save_project(a, tmp_path)
    route_delete_project(a.id)
    assert route_list_projects() == []

def test_duplicate_project_route_creates_new_id_and_copy_suffix(tmp_path, monkeypatch):
    from app import store
    from app.main import duplicate_project as route_duplicate_project
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="Reel A")
    store.save_project(a, tmp_path)
    dup = route_duplicate_project(a.id)
    assert dup.id != a.id
    assert dup.name == "Reel A copy"
    assert store.load_project(dup.id, tmp_path).id == dup.id

def test_duplicate_project_route_deep_copies_nested_data(tmp_path, monkeypatch):
    from app import store
    from app.main import duplicate_project as route_duplicate_project
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="Reel A", media_library=[MediaItem(file_path="a.mp4", duration=1.0)])
    store.save_project(a, tmp_path)
    dup = route_duplicate_project(a.id)
    dup.media_library[0].file_path = "changed.mp4"
    assert a.media_library[0].file_path == "a.mp4"
```

Add `MediaItem` to the existing `from app.models import Project, TextBlockLayer, TextPreset` import line at the top of `tests/test_main.py`.

- [ ] **Step 2: Run to verify failure**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: FAIL — `ImportError: cannot import name 'list_projects' from 'app.main'`

- [ ] **Step 3: Implement in `app/main.py`**

Change the imports:

```python
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset, ProjectSummary, new_id
from app import store, media, ffmpeg_cmd, ass_render
from app.font_metrics import available_weights, WEIGHT_LABELS
```

Add three routes directly after the existing `put_project` route:

```python
@app.get("/api/projects")
def list_projects() -> list[ProjectSummary]:
    projects = sorted(store.list_projects(DATA_DIR), key=lambda p: p.updated_at, reverse=True)
    return [ProjectSummary(id=p.id, name=p.name, created_at=p.created_at, updated_at=p.updated_at) for p in projects]

@app.delete("/api/projects/{pid}", status_code=204)
def delete_project(pid: str) -> None:
    store.delete_project(pid, DATA_DIR)

@app.post("/api/projects/{pid}/duplicate")
def duplicate_project(pid: str) -> Project:
    p = store.load_project(pid, DATA_DIR)
    dup = p.model_copy(deep=True, update={
        "id": new_id(),
        "name": f"{p.name} copy",
        "created_at": datetime.now(timezone.utc),
    })
    store.save_project(dup, DATA_DIR)
    return dup
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: PASS

- [ ] **Step 5: Full test suite + commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, no regressions

```bash
git add app/main.py tests/test_main.py
git commit -m "feat: add GET/DELETE/duplicate project routes"
```

---

## Task 3: `ui-save-indicator.js` + CSS + `#panel-brand` mount point

**Files:**
- Create: `static/ui-save-indicator.js`
- Create: `static/css/components/save-indicator.css`
- Modify: `static/index.html`

**Interfaces:**
- Produces: `window.UI.saveIndicator(container) -> { setSaving(), setSaved() }`

- [ ] **Step 1: Create `static/ui-save-indicator.js`**

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .save-indicator CSS component. No app state — caller drives setSaving()/setSaved().
window.UI = window.UI || {};

window.UI.saveIndicator = function saveIndicator(container) {
  container.classList.add("save-indicator");
  container.innerHTML = "";

  const dot = document.createElement("span");
  dot.className = "save-indicator-dot";
  const label = document.createElement("span");
  label.className = "save-indicator-label";
  container.append(dot, label);

  function setSaving() {
    container.classList.add("is-saving");
    label.textContent = "Saving…";
  }
  function setSaved() {
    container.classList.remove("is-saving");
    label.textContent = "Saved";
  }

  setSaved();
  return { setSaving, setSaved };
};
```

- [ ] **Step 2: Create `static/css/components/save-indicator.css`**

```css
/* "Saving…/Saved" indicator for #panel-brand — persistent across all panels. */
/* Exposes .save-indicator/.save-indicator-dot/.save-indicator-label. Depends on tokens.css. */
.save-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--space-2);
}

.save-indicator-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius);
  background: var(--text-dim);
}

.save-indicator.is-saving .save-indicator-dot { background: var(--accent); }

.save-indicator-label {
  font-family: var(--font-ui);
  font-size: 8px;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  text-align: center;
}
```

- [ ] **Step 3: Wire into `static/index.html`**

Add the stylesheet link next to the other `components/*.css` links (after `safe-zones.css`):

```html
<link rel="stylesheet" href="/static/css/components/safe-zones.css">
<link rel="stylesheet" href="/static/css/components/save-indicator.css">
```

Add the mount point inside `#panel-brand`, before `#brand-dot`:

```html
<div id="panel-brand">
  <div id="save-indicator"></div>
  <span id="brand-dot"></span>
  <span id="brand-name">REEL</span>
</div>
```

Add the script tag next to the other `ui-*.js` tags (after `ui-button.js`):

```html
<script src="/static/ui-button.js"></script>
<script src="/static/ui-save-indicator.js"></script>
```

- [ ] **Step 4: Commit**

No automated frontend tests exist in this repo (see Global Constraints) — this component is wired live and verified in Task 9's manual check.

```bash
git add static/ui-save-indicator.js static/css/components/save-indicator.css static/index.html
git commit -m "feat: add save-indicator component and panel-brand mount point"
```

---

## Task 4: `ui-project-list-row.js` + CSS

**Files:**
- Create: `static/ui-project-list-row.js`
- Create: `static/css/components/project-list-row.css`
- Modify: `static/index.html`

**Interfaces:**
- Produces: `window.UI.projectListRow(project, { onOpen, onRename, onDelete, onDuplicate }) -> HTMLLIElement`. `project` is `{id, name, created_at, updated_at}` (a `ProjectSummary` or full `Project`, both have these fields). All four callbacks are optional: `onRename`/`onDelete`/`onDuplicate` omitted means that control isn't rendered (this is how the picker gets an open-only row while the in-editor panel gets the full set). `onRename(newName)` fires on blur/Enter only when the trimmed value is non-empty and changed. `onDelete()`/`onDuplicate()` fire on their icon button click, `stopPropagation`'d so they don't also trigger `onOpen`. `onOpen()` fires on any other click on the row.

- [ ] **Step 1: Create `static/ui-project-list-row.js`**

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .project-list-row CSS component and .icon-btn (button-group.css). No app
// state — callers own the project data and own persisting any change the callbacks report.
// Reused by both the full-screen picker (open-only) and the in-editor PROJECTS panel
// (open + inline rename + delete + duplicate) — pass only the callbacks each context needs.
window.UI = window.UI || {};

function formatRelativeProjectTime(isoString) {
  const then = new Date(isoString).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

window.UI.projectListRow = function projectListRow(project, { onOpen, onRename, onDelete, onDuplicate } = {}) {
  const li = document.createElement("li");
  li.className = "project-list-row";

  const nameEl = document.createElement("span");
  nameEl.className = "project-list-row-name";
  nameEl.textContent = project.name;
  if (onRename) {
    nameEl.contentEditable = "true";
    nameEl.addEventListener("click", (e) => e.stopPropagation());
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
    });
    nameEl.addEventListener("blur", () => {
      const next = nameEl.textContent.trim();
      if (!next) { nameEl.textContent = project.name; return; } // empty rename rejected client-side
      if (next !== project.name) onRename(next);
      else nameEl.textContent = project.name;
    });
  }

  const metaEl = document.createElement("span");
  metaEl.className = "project-list-row-meta";
  metaEl.textContent = formatRelativeProjectTime(project.updated_at);

  li.append(nameEl, metaEl);

  if (onDuplicate) {
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.className = "icon-btn project-list-row-action";
    dupBtn.title = "Duplicate";
    dupBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    dupBtn.addEventListener("click", (e) => { e.stopPropagation(); onDuplicate(); });
    li.appendChild(dupBtn);
  }

  if (onDelete) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn project-list-row-action";
    delBtn.title = "Delete";
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    delBtn.addEventListener("click", (e) => { e.stopPropagation(); onDelete(); });
    li.appendChild(delBtn);
  }

  if (onOpen) li.addEventListener("click", () => onOpen());

  return li;
};
```

- [ ] **Step 2: Create `static/css/components/project-list-row.css`**

```css
/* One project row: inline-editable name, last-edited meta text, optional duplicate/delete icon buttons. */
/* Plus the shared list-reset used by both the picker's list and the in-editor PROJECTS panel's list. */
/* Exposes .project-list-row-list/.project-list-row/.project-list-row-name/.project-list-row-meta/.project-list-row-action. Depends on tokens.css, button-group.css. */
.project-list-row-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.project-list-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: 3px;
  margin-bottom: var(--space-1);
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  cursor: pointer;
}
.project-list-row:hover { border-color: var(--border-hover-color); }
.project-list-row.selected { border-color: var(--accent); }

.project-list-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: 12.5px;
}
.project-list-row-name[contenteditable="true"]:focus {
  outline: none;
  white-space: normal;
  text-overflow: clip;
}

.project-list-row-meta {
  flex-shrink: 0;
  font-family: var(--font-ui);
  font-size: 9.5px;
  color: var(--text-dim);
}

.project-list-row-action { flex-shrink: 0; }
```

- [ ] **Step 3: Wire into `static/index.html`**

Add the stylesheet link (after `save-indicator.css`):

```html
<link rel="stylesheet" href="/static/css/components/save-indicator.css">
<link rel="stylesheet" href="/static/css/components/project-list-row.css">
```

Add the script tag (after `ui-save-indicator.js`):

```html
<script src="/static/ui-save-indicator.js"></script>
<script src="/static/ui-project-list-row.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add static/ui-project-list-row.js static/css/components/project-list-row.css static/index.html
git commit -m "feat: add shared project-list-row component"
```

---

## Task 5: Rewrite `api-ensure-project.js` to stop auto-creating

**Files:**
- Modify: `static/api-ensure-project.js`

**Interfaces:**
- Produces: `Api.ensureProject() -> Promise<Project | null>` — `null` means "no valid remembered project; caller must show the picker" (was: silently `POST`s a new `{name: "reel"}` project).

- [ ] **Step 1: Rewrite the file**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Returns the project pointed at by localStorage.projectId if it still exists on disk,
// otherwise null — never auto-creates. Caller (editor.js) shows the full-screen picker on null.
window.Api.ensureProject = async function ensureProject() {
  const savedId = localStorage.getItem("projectId");
  if (savedId) {
    const res = await fetch(`/api/projects/${savedId}`);
    if (res.ok) return res.json();
  }
  return null;
};
```

- [ ] **Step 2: Commit**

This intentionally breaks `editor.js`'s current cold-start call site (`project = await Api.ensureProject();` assumes a non-null result) — that call site is fixed in Task 9, which depends on this task. Commit this file alone now; do not attempt to run the app until Task 9 lands.

```bash
git add static/api-ensure-project.js
git commit -m "feat: stop api-ensure-project.js from auto-creating a project"
```

---

## Task 6: Project API client functions

**Files:**
- Create: `static/api-list-projects.js`
- Create: `static/api-delete-project.js`
- Create: `static/api-duplicate-project.js`
- Create: `static/api-rename-project.js`
- Create: `static/api-create-project.js`
- Modify: `static/index.html`

**Interfaces:**
- Consumes: `GET /api/projects`, `DELETE /api/projects/{id}`, `POST /api/projects/{id}/duplicate`, `GET`+`PUT /api/projects/{id}`, `POST /api/projects` (all from Task 2 / pre-existing routes)
- Produces: `Api.listProjects() -> Promise<ProjectSummary[]>`, `Api.deleteProject(id) -> Promise<void>`, `Api.duplicateProject(id) -> Promise<Project>`, `Api.renameProject(id, name) -> Promise<Project>`, `Api.createProject(name) -> Promise<Project>`

- [ ] **Step 1: Create `static/api-list-projects.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// GET /api/projects -> lightweight ProjectSummary[] (id, name, created_at, updated_at),
// sorted newest-updated-first by the server.
window.Api.listProjects = async function listProjects() {
  const res = await fetch("/api/projects");
  return res.json();
};
```

- [ ] **Step 2: Create `static/api-delete-project.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// DELETE /api/projects/{id}.
window.Api.deleteProject = async function deleteProject(id) {
  await fetch(`/api/projects/${id}`, { method: "DELETE" });
};
```

- [ ] **Step 3: Create `static/api-duplicate-project.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// POST /api/projects/{id}/duplicate -> the new Project (new id, name = "<name> copy").
window.Api.duplicateProject = async function duplicateProject(id) {
  const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
  return res.json();
};
```

- [ ] **Step 4: Create `static/api-rename-project.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Loads the current project by id, patches its name, PUTs it back. Fetches fresh from the
// server rather than trusting any in-memory copy, since the renamed project may not be the
// one currently open in the editor.
window.Api.renameProject = async function renameProject(id, name) {
  const res = await fetch(`/api/projects/${id}`);
  const project = await res.json();
  project.name = name;
  await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  return project;
};
```

- [ ] **Step 5: Create `static/api-create-project.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// POST /api/projects -> the new Project.
window.Api.createProject = async function createProject(name) {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
};
```

- [ ] **Step 6: Wire into `static/index.html`**

Add all five script tags next to the other `api-*.js` tags (after `api-save-preset.js`, before `api-list-font-weights.js`):

```html
<script src="/static/api-save-preset.js"></script>
<script src="/static/api-list-projects.js"></script>
<script src="/static/api-delete-project.js"></script>
<script src="/static/api-duplicate-project.js"></script>
<script src="/static/api-rename-project.js"></script>
<script src="/static/api-create-project.js"></script>
<script src="/static/api-list-font-weights.js"></script>
```

- [ ] **Step 7: Commit**

```bash
git add static/api-list-projects.js static/api-delete-project.js static/api-duplicate-project.js static/api-rename-project.js static/api-create-project.js static/index.html
git commit -m "feat: add project list/delete/duplicate/rename/create API client functions"
```

---

## Task 7: `ui-project-picker.js` + CSS + `#project-picker` markup

**Depends on:** Task 4 (`UI.projectListRow`), Task 6 (`Api.listProjects`, `Api.createProject`)

**Files:**
- Create: `static/ui-project-picker.js`
- Create: `static/css/components/project-picker.css`
- Modify: `static/index.html`

**Interfaces:**
- Consumes: `Api.listProjects()`, `Api.createProject(name)`, `UI.projectListRow(project, callbacks)`
- Produces: `window.UI.projectPicker(container, { onOpen(project) }) -> Promise<void>` — renders the full-screen picker into `container` (fetching the list itself); `onOpen(project)` fires when an existing row is clicked, or immediately after a new project is created via "+ New Project". Does not manage its own visibility — the caller (`editor.js`, Task 9) toggles `container`'s `hidden` attribute before/after calling this.

- [ ] **Step 1: Create `static/ui-project-picker.js`**

```js
// Full-screen project picker, framework-free. Attaches to window.UI. Shown at cold start when
// no valid localStorage.projectId is found — see api-ensure-project.js and editor.js.
// Depends on the #project-picker CSS component, UI.projectListRow, and window.Api
// (listProjects/createProject). No app state of its own — always re-fetches the list on mount.
window.UI = window.UI || {};

window.UI.projectPicker = async function projectPicker(container, { onOpen }) {
  const projects = await Api.listProjects();

  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "project-picker-inner";

  const heading = document.createElement("div");
  heading.className = "project-picker-heading";
  heading.textContent = "Your Projects";
  wrap.appendChild(heading);

  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.className = "new-project-btn";
  createBtn.innerHTML = '<span class="icon">+</span><span class="label">NEW PROJECT</span>';
  createBtn.addEventListener("click", async () => {
    const name = prompt("Project name:");
    if (!name) return;
    const created = await Api.createProject(name);
    onOpen(created);
  });
  wrap.appendChild(createBtn);

  if (projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "project-picker-empty";
    empty.textContent = "No projects yet.";
    wrap.appendChild(empty);
  } else {
    const list = document.createElement("ul");
    list.className = "project-picker-list project-list-row-list";
    projects.forEach((p) => list.appendChild(UI.projectListRow(p, { onOpen: () => onOpen(p) })));
    wrap.appendChild(list);
  }

  container.appendChild(wrap);
};
```

- [ ] **Step 2: Create `static/css/components/project-picker.css`**

```css
/* Full-screen project picker shown at cold start when no valid localStorage project is found. */
/* Exposes #project-picker/.project-picker-inner/.project-picker-heading/.project-picker-empty/ */
/* .project-picker-list, plus .new-project-btn (shared with panel-projects.js's create button). */
/* Depends on tokens.css, project-list-row.css. */
#project-picker {
  position: fixed;
  inset: 0;
  background: var(--bg-0);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
#project-picker[hidden] { display: none; }

.project-picker-inner {
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
}

.project-picker-heading {
  font-family: var(--font-ui);
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--text);
  margin-bottom: var(--space-3);
}

.project-picker-empty {
  color: var(--text-dim);
  font-size: 12px;
  text-align: center;
  padding: var(--space-4) 0;
}

.new-project-btn {
  width: 100%;
  border: 1px dashed var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 9px 0;
  margin-bottom: var(--space-3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
}
.new-project-btn:hover { border-color: var(--border-hover-color); border-width: var(--border-hover-width); color: var(--text); }
```

- [ ] **Step 3: Wire into `static/index.html`**

Add the stylesheet link (after `project-list-row.css`):

```html
<link rel="stylesheet" href="/static/css/components/project-list-row.css">
<link rel="stylesheet" href="/static/css/components/project-picker.css">
```

Add the `#project-picker` markup as a sibling of `#app`, hidden by default (the true default case — a valid remembered project — never shows it):

```html
<div id="app">
  ...
</div>
<div id="project-picker" hidden></div>
```

Add the script tag (after `ui-project-list-row.js`):

```html
<script src="/static/ui-project-list-row.js"></script>
<script src="/static/ui-project-picker.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add static/ui-project-picker.js static/css/components/project-picker.css static/index.html
git commit -m "feat: add full-screen project picker"
```

---

## Task 8: `panel-projects.js` + `#panel-projects` markup

**Depends on:** Task 4 (`UI.projectListRow`), Task 6 (project API client functions)

**Files:**
- Create: `static/panel-projects.js`
- Modify: `static/index.html`

**Interfaces:**
- Consumes: `Api.listProjects()`, `Api.renameProject`, `Api.deleteProject`, `Api.duplicateProject`, `UI.projectListRow`
- Produces: `window.ProjectsPanel.render(currentProjectId, callbacks) -> Promise<void>`, where `callbacks` is `{ onSwitch(project), onCreateRequested(name), onDeletedCurrent() }`. `render()` fetches the list itself and re-renders it after any rename/delete/duplicate that doesn't affect the currently-open project; `onSwitch`/`onCreateRequested`/`onDeletedCurrent` are left entirely to the caller (`editor.js`, Task 9) — this file never navigates or saves the current project itself, matching the spec's requirement that the confirm+flush-save step lives in `editor.js`.

- [ ] **Step 1: Create `static/panel-projects.js`**

```js
// #panel-projects context-panel section: project list (open/rename/delete/duplicate) + "+ New
// Project". Exposes window.ProjectsPanel.render(currentProjectId, callbacks). Depends on Api
// (listProjects/renameProject/deleteProject/duplicateProject/createProject via callbacks.onCreateRequested)
// and UI.projectListRow. Never navigates or saves the currently-open project itself — that's
// editor.js's job (confirm+flush-save wraps onSwitch/onCreateRequested there).
window.ProjectsPanel = window.ProjectsPanel || {};

(() => {
  async function render(currentProjectId, callbacks) {
    const listEl = document.getElementById("project-list");
    listEl.innerHTML = "";
    const projects = await Api.listProjects();

    projects.forEach((p) => {
      const row = UI.projectListRow(p, {
        onOpen: () => { if (p.id !== currentProjectId) callbacks.onSwitch(p); },
        onRename: async (name) => { await Api.renameProject(p.id, name); },
        onDelete: async () => {
          if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
          await Api.deleteProject(p.id);
          if (p.id === currentProjectId) callbacks.onDeletedCurrent();
          else await render(currentProjectId, callbacks);
        },
        onDuplicate: async () => {
          await Api.duplicateProject(p.id);
          await render(currentProjectId, callbacks);
        },
      });
      if (p.id === currentProjectId) row.classList.add("selected");
      listEl.appendChild(row);
    });

    document.getElementById("project-create").onclick = () => {
      const name = prompt("Project name:");
      if (!name) return;
      callbacks.onCreateRequested(name);
    };
  }

  window.ProjectsPanel.render = render;
})();
```

- [ ] **Step 2: Wire into `static/index.html`**

Add the `#panel-projects` context-panel section as a sibling of the other `#panel-*` sections inside `#style-panel` (after `#panel-export`, before `#panel-text` — order among siblings doesn't affect behavior since `showPanel()` toggles `hidden` directly):

```html
<div id="panel-projects" class="context-panel" hidden>
  <div class="style-panel-header">PROJECTS</div>
  <div class="style-group">
    <button id="project-create" class="new-project-btn"><span class="icon">+</span><span class="label">NEW PROJECT</span></button>
  </div>
  <ul id="project-list" class="project-list-row-list"></ul>
</div>
```

Add the script tag at the end of the script list, alongside the other page-specific (non-`ui-`, non-`api-`) files (after `seed.js`, before `ui-text-interaction.js` — matches where `text-panel-*.js` files sit relative to the generic `ui-*`/`api-*` blocks):

```html
<script src="/static/seed.js"></script>
<script src="/static/panel-projects.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add static/panel-projects.js static/index.html
git commit -m "feat: add in-editor PROJECTS panel"
```

---

## Task 9: `editor.js` integration — cold start, PROJECTS nav, confirm+flush-save, `beforeunload` flush, save-indicator wiring

**Depends on:** Tasks 1–8 (all backend routes, all frontend components)

**Files:**
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: `Api.ensureProject()` (Task 5, now nullable), `UI.projectPicker` (Task 7), `UI.saveIndicator` (Task 3), `ProjectsPanel.render` (Task 8), `Api.createProject` (Task 6)
- Produces: `openProject(target)` (loads a project by id/summary and renders the full editor for it), `openProjectsPanel()` (PROJECTS rail entry handler), the app now has two top-level screens (`#app` / `#project-picker`) toggled by `showEditorShell()`/`showPickerScreen()`

- [ ] **Step 1: Add screen-toggle + project-loading helpers**

Add near the top of `static/editor.js`, after the `AVAILABLE_FONTS` line:

```js
function showEditorShell() {
  document.getElementById("project-picker").hidden = true;
  document.getElementById("app").hidden = false;
}

async function showPickerScreen() {
  document.getElementById("app").hidden = true;
  const pickerEl = document.getElementById("project-picker");
  pickerEl.hidden = false;
  await UI.projectPicker(pickerEl, { onOpen: (p) => openProject(p) });
}

// Loads `target` (a ProjectSummary or full Project — only .id is used) as the current project
// and renders the full editor for it. Used by cold start, PROJECTS-panel switch, and after create.
async function openProject(target) {
  const res = await fetch(`/api/projects/${target.id}`);
  project = await res.json();
  localStorage.setItem("projectId", project.id);
  const before = JSON.stringify(project);
  seedDefaults(project);
  if (JSON.stringify(project) !== before) await saveProject();
  showEditorShell();
  document.title = project.name ? `${project.name} – Reels Editor` : "Reels Editor";
  renderMediaList();
  Preview.load(project);
  await renderTextPanel();
  renderTimeline();
  openFilesPanel();
}
```

- [ ] **Step 2: Wire the save indicator into `saveProject()`**

Replace the existing `saveProject` function:

```js
async function saveProject() {
  await Api.saveProject(project);
}
```

with:

```js
const saveIndicator = UI.saveIndicator(document.getElementById("save-indicator"));

async function saveProject() {
  saveIndicator.setSaving();
  await Api.saveProject(project);
  saveIndicator.setSaved();
}
```

- [ ] **Step 3: Add the confirm+flush-save helper**

Add directly after the `saveProject` function:

```js
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Leaving the current project (switching to another, or creating a new one) always flushes an
// explicit save first, then holds briefly on the "Saved" state as a deliberate moment against
// an accidental click, before actually navigating.
async function confirmFlushAndSwitch(action) {
  await saveProject();
  await delay(400);
  await action();
}
```

- [ ] **Step 4: Add `openProjectsPanel()` and register it**

Add next to the other `open*Panel()` functions (after `openExportPanel()`):

```js
async function openProjectsPanel() {
  selected = { type: "projects" };
  showPanel("projects");
  await ProjectsPanel.render(project.id, {
    onSwitch: (p) => confirmFlushAndSwitch(() => openProject(p)),
    onCreateRequested: (name) => confirmFlushAndSwitch(async () => {
      const created = await Api.createProject(name);
      await openProject(created);
    }),
    onDeletedCurrent: () => showPickerScreen(),
  });
  renderTimeline();
}
```

Update `PANEL_NAV_HANDLERS`:

```js
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel };
```

- [ ] **Step 5: Add the PROJECTS entry to `PANEL_NAV_ITEMS`**

Append after the `export` entry (order matches the spec's `FILES / TEXT / CAPTIONS / SETTINGS / EXPORT / PROJECTS`):

```js
  {
    value: "projects",
    label: "PROJECTS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  },
];
```

(This replaces the closing `];` of the existing array — add the object above it, keep the `];`.)

- [ ] **Step 6: Add `"projects"` to `showPanel()`'s type list**

```js
function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "settings", "export", "projects"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}
```

- [ ] **Step 7: Rewrite the cold-start IIFE**

Replace the closing `(async () => { ... })();` block at the bottom of the file with:

```js
(async () => {
  setSafeZonesVisible(localStorage.getItem("safeZonesVisible") === "1");
  const storedTheme = localStorage.getItem("theme");
  setTheme(storedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  await TextPanel.loadSavedPresets();

  window.addEventListener("beforeunload", () => {
    if (!project) return;
    fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
      keepalive: true,
    });
  });

  const existing = await Api.ensureProject();
  if (existing) {
    await openProject(existing);
    setTimeout(() => renderTextPreview(), 100);
  } else {
    await showPickerScreen();
  }
})();
```

(`TextPanel.loadSavedPresets()` moves out of the `existing` branch since it's project-independent and both branches — cold-start-into-editor and cold-start-into-picker-then-open — need it loaded exactly once before the first `renderTextPanel()` call, which now only ever happens inside `openProject()`.)

- [ ] **Step 8: Manual verification — existing-project cold start**

Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`

Open `http://127.0.0.1:8000` in a browser with an existing `localStorage.projectId` (i.e. re-open after prior use). Confirm:
- The editor loads straight in, no picker flash.
- The `#panel-brand` area shows a small "Saved" label above the brand dot.
- Editing a clip trim or text field briefly flips the label to "Saving…" then back to "Saved".

- [ ] **Step 9: Manual verification — cold start with no project**

In the browser devtools console: `localStorage.removeItem("projectId")`, then reload.

Confirm:
- A full-screen picker appears (not the editor), listing any existing projects with relative "last edited" times, newest first.
- If zero projects exist on disk (fresh `data/projects/`), the picker shows "No projects yet." plus the "+ NEW PROJECT" button, and nothing is auto-created.
- Clicking "+ NEW PROJECT", entering a name, opens straight into the editor with that project as current and `localStorage.projectId` set to its id.

- [ ] **Step 10: Manual verification — PROJECTS panel**

With a project open, click the PROJECTS rail entry (bottom of the left icon rail). Confirm:
- The panel lists every project, current one visibly highlighted (`.selected` border).
- Renaming a row (click name, type, blur) persists — reload the page and confirm the new name stuck.
- Clicking a different row's name (not editing) triggers the save flush ("Saving…"/"Saved" flicker), a brief pause, then switches the editor to that project.
- Duplicate on a row creates a new `"<name> copy"` row without any prompt.
- Deleting the *currently open* project falls back to the picker screen immediately after the confirm dialog.
- Deleting a project that is neither current nor open just disappears from the list.

- [ ] **Step 11: Full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, no regressions

- [ ] **Step 12: Commit**

```bash
git add static/editor.js
git commit -m "feat: wire project picker, PROJECTS panel, save indicator, and beforeunload flush into editor.js"
```

- [ ] **Step 13: Finish the development branch**

Run superpowers:finishing-a-development-branch to decide how to integrate this work (merge to main locally + push, open a PR, or hold for further review).

---

## Out of scope (carried over from the design doc)

- Project thumbnails/preview images — text-only rows for this phase.
- Full parity of rename/delete/duplicate on the picker screen — picker is list + open + create only.
- A visible confirmation/name prompt on duplicate — it's fast and silent except for the `"copy"` suffix.
