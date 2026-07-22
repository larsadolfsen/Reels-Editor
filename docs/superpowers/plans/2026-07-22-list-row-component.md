# List-Row Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four independently hand-rolled "clickable list row" CSS recipes (project list, layers list, clip list, font drill-down list) with one shared `window.UI.listRow()` component + `list-row.css`, retiring the raw `#clip-list li` selector that currently leaks card/hover styling onto the FILES panel's non-clickable section-label rows.

**Architecture:** A presentational-only helper (`static/ui-list-row.js`, mirroring `static/ui-button.js`'s "stamp styling onto an existing element" pattern) adds `.list-row` (+ optional `.list-row--subtle` / `.selected`) to a caller-built row element. `static/css/components/list-row.css` defines the shared recipe once; each of the four existing component CSS files keeps only its own row-specific layout (flex direction/gap) and deletes its duplicated card/hover/selected declarations.

**Tech Stack:** No build step — plain `<script>`/`<link>` tags in `static/index.html`, framework-free DOM APIs, matching every existing `static/ui-*.js` component in this repo.

## Global Constraints

- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — all styling lives in `static/css/components/**` classes (project convention, `CLAUDE.md`).
- Reusable JS logic lives one function/component per file under `window.UI.*` (project convention, `CLAUDE.md`).
- Every `static/*.js` and `static/css/**/*.css` file opens with a one- or two-line header comment stating that file's purpose (project convention, `CLAUDE.md`).
- This repo has no JS test runner (confirmed: `tests/` contains only Python/pytest files for the FastAPI backend; no existing `static/ui-*.js` component has a corresponding test file). Verification for every task in this plan is manual: run the dev server and inspect the affected panel in a browser. This mirrors the stated, already-accepted pattern for this codebase's thin UI-wiring layer.
- Dev server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, then open `http://127.0.0.1:8000`.
- Spec: `docs/superpowers/specs/2026-07-22-list-row-component-design.md` — every task below implements one section of it.

---

### Task 1: `list-row.css` + registration

**Files:**
- Create: `static/css/components/list-row.css`
- Modify: `static/index.html:27` (insert one `<link>` line after the existing `export-progress.css` line)

**Interfaces:**
- Produces: CSS classes `.list-row`, `.list-row--subtle`, `.list-row.selected` — consumed by Task 2's `UI.listRow()` and by Tasks 3–6's migrated markup.

- [ ] **Step 1: Create `static/css/components/list-row.css`**

```css
/* Shared "clickable list row" card recipe: background/border/hover/selected state, reused by
   the PROJECTS list, LAYERS list, FILES clip list, and font/style drill-down lists so each
   panel no longer hand-rolls its own copy. Depends on tokens.css. Applied via
   window.UI.listRow() (static/ui-list-row.js) — each panel keeps its own row layout
   (flex direction, gap, children) in its own CSS file. */
.list-row {
  padding: var(--space-2);
  border-radius: 3px;
  margin-bottom: var(--space-1);
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  cursor: pointer;
}
.list-row:hover { border-color: var(--border-hover-color); }
.list-row.selected { border-color: var(--accent); }

.list-row--subtle {
  background: transparent;
  border: 1px solid transparent;
}
.list-row--subtle:hover { background: var(--bg-2); }
```

- [ ] **Step 2: Register the stylesheet in `static/index.html`**

Find line 27 (the last CSS `<link>`, currently):
```html
<link rel="stylesheet" href="/static/css/components/export-progress.css">
```
Add immediately after it:
```html
<link rel="stylesheet" href="/static/css/components/list-row.css">
```

- [ ] **Step 3: Manually verify the file loads with no errors**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000` in a browser, open devtools Network tab, reload.
Expected: `list-row.css` returns `200`, no console errors. No visual change yet (nothing references `.list-row` until Task 2+3).

- [ ] **Step 4: Commit**

```bash
git add static/css/components/list-row.css static/index.html
git commit -m "feat: add shared list-row CSS component"
```

---

### Task 2: `UI.listRow()` component + registration

**Files:**
- Create: `static/ui-list-row.js`
- Modify: `static/index.html:664` (insert one `<script>` line right after the existing `ui-button.js` line)

**Interfaces:**
- Consumes: CSS classes from Task 1 (`.list-row`, `.list-row--subtle`, `.selected`).
- Produces: `window.UI.listRow(el, { selected = false, subtle = false } = {}) -> el` — consumed by Tasks 3–6.

- [ ] **Step 1: Create `static/ui-list-row.js`**

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI. Stamps the shared
// clickable-row styling (static/css/components/list-row.css) onto an already-built element,
// mirroring ui-button.js's "apply variant to an existing element" pattern — callers build their
// own row (thumbnail/name/meta/actions) and call this once before appending it to its list.
window.UI = window.UI || {};

window.UI.listRow = function listRow(el, { selected = false, subtle = false } = {}) {
  el.classList.add("list-row");
  el.classList.toggle("list-row--subtle", subtle);
  el.classList.toggle("selected", selected);
  return el;
};
```

- [ ] **Step 2: Register the script in `static/index.html`**

Find line 664 (currently):
```html
<script src="/static/ui-button.js"></script>
```
Add immediately after it:
```html
<script src="/static/ui-list-row.js"></script>
```

- [ ] **Step 3: Manually verify `UI.listRow` is defined**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000`, open devtools Console, run:
```js
typeof UI.listRow
```
Expected: `"function"`

- [ ] **Step 4: Commit**

```bash
git add static/ui-list-row.js static/index.html
git commit -m "feat: add UI.listRow() component"
```

---

### Task 3: Migrate the PROJECTS list row

**Files:**
- Modify: `static/ui-project-list-row.js:20-22`
- Modify: `static/css/components/project-list-row.css:10-22`

**Interfaces:**
- Consumes: `UI.listRow(el, opts)` from Task 2.

- [ ] **Step 1: Replace the manual className assignment**

In `static/ui-project-list-row.js`, find (lines 20-22):
```js
window.UI.projectListRow = function projectListRow(project, { onOpen, onRename, onDelete, onDuplicate } = {}) {
  const li = document.createElement("li");
  li.className = "project-list-row";
```
Replace with:
```js
window.UI.projectListRow = function projectListRow(project, { onOpen, onRename, onDelete, onDuplicate } = {}) {
  const li = document.createElement("li");
  li.className = "project-list-row";
  UI.listRow(li);
```

(`.selected` continues to be toggled externally by `static/panel-projects.js:36`'s existing `row.classList.add("selected")` — that line needs no change, since `.selected` is the same class name whether toggled directly or via `UI.listRow`'s `selected` option, and this row's caller already manages that state.)

- [ ] **Step 2: Delete the now-duplicated card rule from `project-list-row.css`**

In `static/css/components/project-list-row.css`, find (lines 10-22):
```css
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
```
Replace with (keep only the row's own flex layout — background/border/hover/selected now come from `.list-row`):
```css
.project-list-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
```

- [ ] **Step 3: Manually verify the PROJECTS panel and cold-start picker**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000`.
Expected: the cold-start project picker (or, if a project is already open, the PROJECTS panel via the left icon rail) shows project rows with the same background/border/hover/spacing as before this change; the currently-open project's row still shows an accent-colored border (`.selected`).

- [ ] **Step 4: Commit**

```bash
git add static/ui-project-list-row.js static/css/components/project-list-row.css
git commit -m "refactor: migrate project list row onto shared list-row component"
```

---

### Task 4: Migrate the LAYERS list row

**Files:**
- Modify: `static/panel-layers.js:27-28`
- Modify: `static/css/components/layers-panel.css:5-17`

**Interfaces:**
- Consumes: `UI.listRow(el, opts)` from Task 2.

- [ ] **Step 1: Replace the manual className assignment**

In `static/panel-layers.js`, find (lines 27-29):
```js
      const li = document.createElement("li");
      li.className = "layers-list-row";
      li.draggable = true;
```
Replace with:
```js
      const li = document.createElement("li");
      li.className = "layers-list-row";
      UI.listRow(li);
      li.draggable = true;
```

- [ ] **Step 2: Delete the now-duplicated card rule from `layers-panel.css`, keep the drag-specific cursor/opacity**

In `static/css/components/layers-panel.css`, find (lines 5-17):
```css
.layers-list-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: 3px;
  margin-bottom: var(--space-1);
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  cursor: grab;
}
.layers-list-row:hover { border-color: var(--border-hover-color); }
.layers-list-row.dragging { opacity: 0.4; }
```
Replace with (keep the row's own flex layout, the drag-handle cursor override, and the dragging-opacity state; background/border/hover now come from `.list-row`):
```css
.layers-list-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: grab;
}
.layers-list-row.dragging { opacity: 0.4; }
```

(`.layers-list-row { cursor: grab; }` is declared after `list-row.css`'s `.list-row { cursor: pointer; }` in the page's `<link>` order — Task 1 inserted `list-row.css` before `layers-panel.css` — so at equal specificity this rule correctly wins and rows still show the grab cursor, not a pointer.)

- [ ] **Step 3: Manually verify the LAYERS panel**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000`, add at least one text block (so LAYERS has a row to show), open the LAYERS panel from the left icon rail.
Expected: the row shows the same background/border/hover as before, the mouse cursor is a grab hand (not a pointer) over the row, and dragging it to reorder still works and still dims to 40% opacity while dragging.

- [ ] **Step 4: Commit**

```bash
git add static/panel-layers.js static/css/components/layers-panel.css
git commit -m "refactor: migrate layers list row onto shared list-row component"
```

---

### Task 5: Migrate the FILES clip list row (and fix the section-label leak)

**Files:**
- Modify: `static/panel-media.js:53-59`
- Modify: `static/css/components/style-panel.css:157-170`

**Interfaces:**
- Consumes: `UI.listRow(el, opts)` from Task 2.

- [ ] **Step 1: Replace the manual selected-class toggle with `UI.listRow()`**

In `static/panel-media.js`, find (lines 53-59):
```js
  function buildRow(m) {
    const li = document.createElement("li");
    li.draggable = true; // drag onto the timeline's VIDEO row to place this file as a clip
    li.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/media-id", m.id));
    if (selectedMediaId === m.id) {
      li.classList.add("selected");
    }
```
Replace with:
```js
  function buildRow(m) {
    const li = document.createElement("li");
    UI.listRow(li, { selected: selectedMediaId === m.id });
    li.draggable = true; // drag onto the timeline's VIDEO row to place this file as a clip
    li.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/media-id", m.id));
```

Note: `appendGroup()` (the function that builds `.clip-section-label` rows, a few lines below `buildRow`) is untouched by this task — it never calls `buildRow()` or `UI.listRow()`, so the "VIDEOS"/"IMAGES" label `<li>` continues to have no `.list-row` class at all.

- [ ] **Step 2: Delete the now-duplicated card rule from `style-panel.css`, scoping the remaining flex-layout rule to actual rows only**

In `static/css/components/style-panel.css`, find (lines 157-170):
```css
#clip-list li {
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

#clip-list li:hover { border-color: var(--border-hover-color); }
#clip-list li.selected { border-color: var(--accent); }
```
Replace with (background/border/hover/selected now come from `.list-row`; the flex layout is scoped to `#clip-list li.list-row` specifically, so it — like the removed card styling — never applies to the section-label `<li>`, which never carries `.list-row`):
```css
#clip-list li.list-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
```

Leave `#style-panel.collapsed #clip-list li { ... }` (line 32) and `#clip-list li:hover .clip-actions { opacity: 1; }` (line 213) untouched — neither duplicates card styling, and both already only have a visible effect on rows that contain the elements they target (`.clip-info`, `.clip-actions`), which only real clip rows have.

- [ ] **Step 3: Manually verify the FILES panel**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000`, import at least one video and one image (or use an existing project with both), open the FILES panel.
Expected: clip rows show the same background/border/hover/selected-highlight as before; clicking a row toggles its highlight; the "VIDEOS" and "IMAGES" section-label rows show **no** background, border, or hover effect (this is the bug fix — compare against `main` before this change, where the label rows visibly get a background/hover border from `#clip-list li`).

- [ ] **Step 4: Commit**

```bash
git add static/panel-media.js static/css/components/style-panel.css
git commit -m "refactor: migrate clip list row onto shared list-row component, fix section-label style leak"
```

---

### Task 6: Migrate the font/style drill-down list rows

**Files:**
- Modify: `static/caption-panel-style.js:45-47`
- Modify: `static/caption-panel-font-family.js:55-56`
- Modify: `static/caption-panel-words.js:43-44`
- Modify: `static/caption-panel-font-weight.js:34-35`
- Modify: `static/text-panel-font-weight.js:62-63`
- Modify: `static/text-panel-font-family.js:57-58`
- Modify: `static/text-panel-style.js:48-49`
- Modify: `static/css/components/sub-panel.css:39-51`

**Interfaces:**
- Consumes: `UI.listRow(el, { subtle: true })` from Task 2.

- [ ] **Step 1: `static/caption-panel-style.js`**

Find (lines 45-47):
```js
  function renderStyleListRow(saved) {
    const li = document.createElement("li");
    li.className = "font-list-row";
```
Replace with:
```js
  function renderStyleListRow(saved) {
    const li = document.createElement("li");
    li.className = "font-list-row";
    UI.listRow(li, { subtle: true });
```

- [ ] **Step 2: `static/caption-panel-font-family.js`**

Find (lines 55-56):
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
```
Replace with:
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
```

- [ ] **Step 3: `static/caption-panel-words.js`**

Find (lines 43-44):
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
```
Replace with:
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
```

- [ ] **Step 4: `static/caption-panel-font-weight.js`**

Find (lines 34-36):
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("click", () => selectWeight(w.value));
```
Replace with:
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("click", () => selectWeight(w.value));
```

- [ ] **Step 5: `static/text-panel-font-weight.js`**

Find (lines 62-64):
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("click", () => selectWeight(w.value));
```
Replace with:
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("click", () => selectWeight(w.value));
```

- [ ] **Step 6: `static/text-panel-font-family.js`**

Find (lines 57-59):
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
```
Replace with:
```js
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
```

- [ ] **Step 7: `static/text-panel-style.js`**

Find (lines 48-50):
```js
    const li = document.createElement("li");
    li.className = "font-list-row";
    li.addEventListener("click", () => applySavedPreset(saved));
```
Replace with:
```js
    const li = document.createElement("li");
    li.className = "font-list-row";
    UI.listRow(li, { subtle: true });
    li.addEventListener("click", () => applySavedPreset(saved));
```

- [ ] **Step 8: Delete the now-duplicated card rule from `sub-panel.css`**

In `static/css/components/sub-panel.css`, find (lines 39-51):
```css
.font-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: 3px;
  margin-bottom: var(--space-1);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
}
.font-list-row:hover { background: var(--bg-2); }
```
Replace with (keep the row's own flex layout; background/border/hover now come from `.list-row.list-row--subtle`):
```css
.font-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
```

- [ ] **Step 9: Manually verify every drill-down list this touches**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000`, open a TEXT block's panel and check: Style tab's saved-style list, Design tab's font-family drill-down, Design tab's font-weight drill-down. Then open the CAPTIONS panel and check the same three drill-downs, plus the Closed-caption tab's word list.
Expected: every row still shows the transparent-by-default / background-on-hover look exactly as before (not a bordered card) — this is `.list-row--subtle`'s job. Clicking/selecting still works in each list.

- [ ] **Step 10: Commit**

```bash
git add static/caption-panel-style.js static/caption-panel-font-family.js static/caption-panel-words.js static/caption-panel-font-weight.js static/text-panel-font-weight.js static/text-panel-font-family.js static/text-panel-style.js static/css/components/sub-panel.css
git commit -m "refactor: migrate font/style drill-down list rows onto shared list-row component"
```

---

### Task 7: Whole-branch manual verification pass

**Files:** none (verification only, per the spec's Verification section)

- [ ] **Step 1: Run the full manual verification pass from the spec**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000` and check, in one sitting:
1. Cold-start project picker — project rows look and behave as before.
2. PROJECTS panel — same, plus the open project's row still shows its accent-selected border.
3. FILES panel — clip rows unchanged; VIDEOS/IMAGES section labels show no background/border/hover (the fixed bug).
4. LAYERS panel — rows unchanged, grab cursor intact, drag-reorder still works, dragging opacity still applies.
5. TEXT panel's Style/Design(font-family)/Design(font-weight) drill-downs, and CAPTIONS panel's same three plus Closed-caption word list — all still show the transparent/hover-background look, not a bordered card.

Expected: no unintended layout/size shift anywhere beyond what's already described above; every list still responds to click/hover/drag exactly as before this refactor.

- [ ] **Step 2: Confirm no stray references to deleted rules remain**

Run (from the repo root):
```bash
grep -rn "#clip-list li {" static/css/components/style-panel.css
```
Expected: no output (the old bare-card block from Task 5 no longer exists; only the `#clip-list li.list-row { ... }` layout rule and the untouched `#style-panel.collapsed #clip-list li` / `#clip-list li:hover .clip-actions` selectors remain).

- [ ] **Step 3: No commit needed** — this task is verification-only; if it uncovers a regression, fix it inside the relevant task above (amend that task's files, not a new patch commit here) and re-run this task's checks.
