# Insert Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the left-rail TEXT button *insert* a new text block (dropping straight into on-stage edit) instead of merely opening the TEXT panel, and give insert-capable rail buttons (TEXT, CAPTIONS) a visible plus badge — establishing "rail inserts, timeline opens" as the interaction model.

**Architecture:** Two changes. (Task 1) A pure refactor extracting all right-panel navigation machinery from the oversized `editor.js` (469 lines, over the 400-line guideline) into a new `static/panel-nav.js` — same classic-script-shared-global-scope pattern as the existing `panel-text.js`/`panel-captions.js`/`clip-sequence.js` extractions, zero behavior change. (Task 2) The rail's TEXT button routes to the existing `addTextBlockAndEdit()` insert flow, and `ui-icon-rail.js` gains an opt-in plus-badge overlay applied to the TEXT and CAPTIONS items. CAPTIONS create-or-open and timeline-click-opens-panel are already the real behavior — verified, not built.

**Tech Stack:** Vanilla JS (no bundler — plain `<script>` tags sharing one global lexical scope), FastAPI static serving, hand-inlined Lucide SVG icons, CSS component files on design tokens.

## Global Constraints

- **No JS build step / bundler** — all `static/*.js` are classic scripts sharing ONE global lexical environment. Top-level `function`/`let`/`const` in one file are visible from every other file *at call time*, provided the defining file's `<script>` has executed. This is why cross-file "globals" (`project`, `selected`, `saveProject`, `renderTimeline`, `showPanel`, …) work. Load order only matters for code that runs *at load time*, not for call-time references.
- **Every `static/*.js` file opens with a 1–2 line comment** stating its purpose/role.
- **No inline `style="..."`** in `static/index.html` or JS-rendered markup — all styling lives in `static/css/**` component files as classes.
- **Icons:** use [Lucide](https://lucide.dev) `<path>` markup inside the existing `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` wrapper.
- **Codebase map:** any commit that adds/moves/renames/deletes files must update the map in `CLAUDE.md` in that same commit.
- **Tests:** `.venv/Scripts/python -m pytest -q` (224 passing at plan time). This item is JS/HTML/CSS-only; the suite must stay green (unchanged count) — it is not expected to add or change any Python test.
- **Live verification only on a throwaway project** created via `Api.createProject(...)` and deleted via `Api.deleteProject(...)` when done — never mutate real project data (the browser's `beforeunload` keepalive PUT flushes in-memory mutations to disk).
- **Preview browser caches static JS** — after re-editing a `.js` file mid-session, confirm the served copy is current with a cache-busted fetch (`fetch('/static/panel-nav.js?x='+Date.now())`) before treating stale behavior as a code bug.

---

## File Structure

| File | Change | Responsibility after change |
|------|--------|-----------------------------|
| `static/panel-nav.js` | **Create** | Right-panel navigation: `showPanel()`, `onTimelineSelect()`, `PANEL_NAV_ITEMS`, every `openXPanel()`, `reRenderAfterRestore()`, `PANEL_NAV_HANDLERS`, and the `UI.iconRail(...)` rail wiring. |
| `static/editor.js` | **Modify** | Loses the nav block (Task 1). Keeps `project`/`selected` state, `saveProject`, `openProject`, `showPickerScreen`, `confirmFlushAndSwitch`, `renderTimeline`, `applyRestore`/`undoEdit`/`redoEdit`, startup IIFE, and all the keyboard/drag/transport wiring — which reference the moved functions as call-time globals. |
| `static/index.html` | **Modify** | Add `<script src="/static/panel-nav.js">` immediately before `editor.js` (Task 1). |
| `static/ui-icon-rail.js` | **Modify** | `UI.iconRail` gains an opt-in per-item `badge` flag rendering a plus overlay (Task 2). |
| `static/css/components/icon-rail.css` | **Modify** | `.icon-rail-badge` overlay styling (Task 2). |
| `CLAUDE.md` | **Modify** | Codebase map: add `panel-nav.js` entry (Task 1); note the rail insert-badge + TEXT-insert behavior (Task 2). |

### Why `panel-nav.js` loads right before `editor.js`

`editor.js`'s load-time IIFE (its cold-start routine) calls `openProject()` → `openFilesPanel()`, and its startup wiring registers `Preview.setOnStageTextActivate(() => { …; openTextPanel(); })` — both reference functions that move into `panel-nav.js`. So `panel-nav.js` must be **defined before `editor.js` executes**. Placing its `<script>` immediately before `editor.js`'s (after `undo-history.js`) guarantees that, while all the UI/panel/Preview/Timeline modules `panel-nav.js` calls at click-time are already loaded far above. Conversely, `panel-nav.js`'s only load-time statement is `UI.iconRail(...)`, which references only its own in-file `PANEL_NAV_ITEMS`/`PANEL_NAV_HANDLERS` and the already-loaded `UI.iconRail` — no `editor.js` dependency at load. `panel-video.js`/`panel-text.js` call `openFilesPanel`/`showPanel` at *call* time, so their earlier position in the load order is irrelevant.

---

### Task 1: Extract navigation machinery into `static/panel-nav.js` (pure move)

**Files:**
- Create: `static/panel-nav.js`
- Modify: `static/editor.js` (remove lines currently at 80–87 `showPanel`, 105–129 `onTimelineSelect`, 131–172 `PANEL_NAV_ITEMS`, 174–241 the eight `openXPanel` functions, 246–268 `reRenderAfterRestore`, 282 `PANEL_NAV_HANDLERS`, 284 the `UI.iconRail(...)` wiring)
- Modify: `static/index.html` (add one `<script>` tag before `editor.js`)
- Modify: `CLAUDE.md` (codebase map)

**Interfaces:**
- Consumes (call-time globals still defined in `editor.js`): `project`, `selected`, `renderTimeline()`, `saveProject()`, `confirmFlushAndSwitch(action)`, `openProject(target)`, `showPickerScreen()`, plus module APIs `Preview`, `VideoBoxPreview`, `VideoPanel`, `VideoBoxPanel`, `ExportPanel`, `LayersPanel`, `ProjectsPanel`, `MediaPanel`, `TextPanel`, `UI`, `Api`, and the panel-text/panel-captions globals `renderTextPanel()`, `renderCaptionPanel()`, `selectTextBlock(id)`.
- Produces (now defined in `panel-nav.js`, consumed elsewhere as call-time globals): `showPanel(type)`, `onTimelineSelect({type,item,groupIndex})`, `openFilesPanel()`, `openTextPanel()`, `openCaptionsPanel()`, `openSettingsPanel()`, `openExportPanel()`, `openVideoBoxPanel()`, `openLayersPanel()`, `openProjectsPanel()`, `reRenderAfterRestore()`, `PANEL_NAV_ITEMS`, `PANEL_NAV_HANDLERS`. (Existing external callers: `panel-video.js` calls `openFilesPanel()`/`showPanel("video")`; `panel-text.js` calls `showPanel("text")`; `editor.js` calls `applyRestore`→`reRenderAfterRestore`, the startup IIFE→`openFilesPanel`, `Preview.setOnStageTextActivate`→`openTextPanel`.)

This is a **pure move — zero behavior change.** The exact function bodies below are copied verbatim from `editor.js`; do not alter logic.

- [ ] **Step 1: Create `static/panel-nav.js` with the moved code**

Create `static/panel-nav.js` with this exact content (header comment + verbatim moved functions + the rail wiring at the bottom):

```javascript
// Right-panel navigation: which context-panel section is open, the left icon-rail definition,
// timeline-click -> panel routing, and the after-undo/redo re-render. Extracted from editor.js
// (2026-07-21). Classic script — reaches into editor.js's project/selected/saveProject/renderTimeline
// globals at call time; loaded immediately before editor.js so its openXPanel() functions exist
// when editor.js's cold-start IIFE runs. Exposes showPanel/onTimelineSelect/openXPanel/
// reRenderAfterRestore/PANEL_NAV_ITEMS/PANEL_NAV_HANDLERS as call-time globals.

function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "layers", "settings", "export", "projects"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}

async function onTimelineSelect({ type, item, groupIndex }) {
  selected = { type, item, groupIndex };
  if (type === "video") {
    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    let start = 0;
    for (const c of ordered) {
      if (c.id === item.id) break;
      start += (c.out_point - c.in_point) / (c.speed || 1);
    }
    Preview.seek(start);
    showPanel("video");
    VideoPanel.render(item);
  } else if (type === "text") {
    selectTextBlock(item.id);
    showPanel("text");
    await renderTextPanel();
  } else if (type === "caption") {
    showPanel("captions");
    await renderCaptionPanel();
  } else if (type === "video-box") {
    showPanel("video-box");
    VideoBoxPanel.render(item.id);
  }
  renderTimeline();
}

const PANEL_NAV_ITEMS = [
  {
    value: "files",
    label: "FILES",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
  },
  {
    value: "text",
    label: "TEXT",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/></svg>`,
  },
  {
    value: "captions",
    label: "CAPTIONS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 9.17a3 3 0 1 0 0 5.66"/><path d="M17 9.17a3 3 0 1 0 0 5.66"/><rect x="2" y="5" width="20" height="14" rx="2"/></svg>`,
  },
  {
    value: "video-box",
    label: "VIDEO BOX",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>`,
  },
  {
    value: "layers",
    label: "LAYERS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="1"/><rect x="7" y="7" width="14" height="14" rx="1"/></svg>`,
  },
  {
    value: "settings",
    label: "SETTINGS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  },
  {
    value: "export",
    label: "EXPORT",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>`,
  },
  {
    value: "projects",
    label: "PROJECTS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  },
];

function openFilesPanel() {
  selected = { type: "files" };
  showPanel("files");
  renderTimeline();
}

async function openTextPanel() {
  selected = { type: "text" };
  showPanel("text");
  await renderTextPanel();
  renderTimeline();
}

async function openCaptionsPanel() {
  selected = { type: "captions" };
  showPanel("captions");
  await renderCaptionPanel();
  renderTimeline();
}

function openSettingsPanel() {
  selected = { type: "settings" };
  showPanel("settings");
  renderTimeline();
}

function openExportPanel() {
  selected = { type: "export" };
  showPanel("export");
  ExportPanel.render();
  renderTimeline();
}

function openVideoBoxPanel() {
  selected = { type: "video-box", item: null };
  showPanel("video-box");
  VideoBoxPanel.render(null);
  renderTimeline();
}

function openLayersPanel() {
  selected = { type: "layers" };
  showPanel("layers");
  LayersPanel.render();
  renderTimeline();
}

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
    onRenamedCurrent: (name) => {
      // panel-projects.js's Api.renameProject call already persisted the rename to disk against
      // a fresh server-fetched copy — it never touches this in-memory `project`. Without this,
      // the next saveProject() (any subsequent edit, a switch-away flush, or beforeunload) would
      // overwrite the on-disk rename with the still-stale in-memory name.
      project.name = name;
      document.title = `${project.name} – Reels Editor`;
    },
  });
  renderTimeline();
}

// Re-render everything from the current in-memory `project` after an undo/redo swap.
// Rebuilds the stage, timeline, and media list, then re-opens the panel that was showing —
// falling back to FILES when the previously-selected entity no longer exists in the restored state.
function reRenderAfterRestore() {
  MediaPanel.render();
  Preview.load(project);
  renderTimeline();
  const t = selected && selected.type;
  if (t === "video") {
    const clip = project.clips.find((c) => selected.item && c.id === selected.item.id);
    if (clip) onTimelineSelect({ type: "video", item: clip }); else openFilesPanel();
  } else if (t === "video-box") {
    const box = project.video_boxes.find((v) => selected.item && v.id === selected.item.id);
    if (box) onTimelineSelect({ type: "video-box", item: box }); else openFilesPanel();
  } else if (t === "text") {
    openTextPanel();      // renderTextPanel()/currentTextBlock() self-heal to first block or empty state
  } else if (t === "captions" || t === "caption") {
    // "caption" (singular) is a selected caption group from a timeline click (onTimelineSelect);
    // "captions" (plural) is the panel-nav CAPTIONS entry with nothing specific selected.
    openCaptionsPanel();
  } else if (t && PANEL_NAV_HANDLERS[t]) {
    PANEL_NAV_HANDLERS[t]();
  } else {
    openFilesPanel();
  }
}

const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, layers: openLayersPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel };

UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => PANEL_NAV_HANDLERS[value]());
```

- [ ] **Step 2: Remove the moved code from `static/editor.js`**

Delete from `editor.js`, exactly and only, these blocks (they now live in `panel-nav.js`):
1. `function showPanel(type) { … }` (was lines 80–87).
2. `async function onTimelineSelect({ … }) { … }` (was lines 105–129).
3. `const PANEL_NAV_ITEMS = [ … ];` (was lines 131–172).
4. The eight functions `openFilesPanel` / `openTextPanel` / `openCaptionsPanel` / `openSettingsPanel` / `openExportPanel` / `openVideoBoxPanel` / `openLayersPanel` / `openProjectsPanel` (was lines 174–241).
5. `function reRenderAfterRestore() { … }` (was lines 246–268).
6. `const PANEL_NAV_HANDLERS = { … };` (was line 282).
7. `UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => PANEL_NAV_HANDLERS[value]());` (was line 284).

**Do NOT remove** and leave in `editor.js`: `confirmFlushAndSwitch` (68–72), `renderTimeline` (74–78), `setStylePanelCollapsed` + its listener (89–103), `applyRestore`/`undoEdit`/`redoEdit` (272–280), the `Preview.setOnStageTextActivate(...)` wiring (286–291), and everything from line 293 onward. Those call the moved functions as call-time globals — that is intended and correct.

After deletion, `editor.js` should read: `confirmFlushAndSwitch` → `renderTimeline` → `setStylePanelCollapsed`/listener → `applyRestore`/`undoEdit`/`redoEdit` → `Preview.setOnStageTextActivate(...)` → the rest (theme/export/IIFE/keyboard/drag). Verify with `grep -n "function showPanel\|PANEL_NAV_ITEMS\|reRenderAfterRestore\|UI.iconRail" static/editor.js` returning **nothing**.

- [ ] **Step 3: Add the `<script>` tag in `static/index.html`**

Immediately before `<script src="/static/editor.js"></script>` (currently the last script), insert:

```html
<script src="/static/panel-nav.js"></script>
```

Result (last two script lines):
```html
<script src="/static/undo-history.js"></script>
<script src="/static/panel-nav.js"></script>
<script src="/static/editor.js"></script>
```

- [ ] **Step 4: Update the codebase map in `CLAUDE.md`**

Add a `panel-nav.js` line to the `static/` File-structure tree (near the other panel-*.js entries) and to the Inventory. Suggested tree entry:

```
  panel-nav.js           # right-panel navigation extracted from editor.js (2026-07-21): showPanel(), onTimelineSelect() timeline-click routing, PANEL_NAV_ITEMS (left icon rail), every openXPanel(), reRenderAfterRestore() (post-undo/redo), PANEL_NAV_HANDLERS, and the UI.iconRail() wiring — classic script sharing editor.js's project/selected/renderTimeline/saveProject globals at call time, loaded immediately before editor.js
```

Also update `editor.js`'s own map description to note that panel navigation (`showPanel`/`onTimelineSelect`/`openXPanel`/`reRenderAfterRestore`/`PANEL_NAV_*`) moved to `panel-nav.js`, and update its header comment (line 1–2) if it still claims to own that wiring.

- [ ] **Step 5: Verify no lingering references and the file loads**

Run:
```bash
grep -rn "function showPanel\|const PANEL_NAV_ITEMS\|function reRenderAfterRestore" static/editor.js
```
Expected: no output (all moved).

Run:
```bash
grep -c "panel-nav.js" static/index.html
```
Expected: `1`.

- [ ] **Step 6: Live smoke test on a throwaway project (pure-move regression)**

Start the server (`preview_start` with the dev-server config, or `.venv/Scripts/python -m uvicorn app.main:app --reload`). In the browser console on a **throwaway** project created via `await Api.createProject("nav-refactor-throwaway")` then opened:
1. Confirm zero console errors on load and that FILES panel is open (cold-start default).
2. Click each left-rail icon (FILES/TEXT/CAPTIONS/VIDEO BOX/LAYERS/SETTINGS/EXPORT/PROJECTS) and confirm the matching `#panel-*` becomes visible and the others hide — i.e. `showPanel` works from `panel-nav.js`.
3. Confirm `typeof openFilesPanel === "function"` and `typeof onTimelineSelect === "function"` and `typeof PANEL_NAV_HANDLERS === "object"` evaluate true in the console (proves the shared-global-scope move worked).
4. Confirm no console error and delete the throwaway project via `await Api.deleteProject(<id>)` when done.

- [ ] **Step 7: Run the test suite (confirm JS-only change didn't break anything)**

Run:
```bash
.venv/Scripts/python -m pytest -q
```
Expected: 224 passed (unchanged — no Python touched).

- [ ] **Step 8: Commit**

```bash
git add static/panel-nav.js static/editor.js static/index.html CLAUDE.md
git commit -m "refactor: extract right-panel navigation from editor.js into panel-nav.js

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: TEXT rail button inserts a block + plus badge on insert-capable rail items

**Files:**
- Modify: `static/ui-icon-rail.js` (add opt-in `badge` per item)
- Modify: `static/css/components/icon-rail.css` (`.icon-rail-badge` overlay)
- Modify: `static/panel-nav.js` (mark TEXT/CAPTIONS items with `badge: true`; special-case the TEXT rail click to insert)
- Modify: `CLAUDE.md` (note the badge + TEXT-insert behavior)

**Interfaces:**
- Consumes: `addTextBlockAndEdit()` (global `async function` in `panel-text.js` — creates a text block + preset at the playhead, selects it, opens the TEXT panel, and enters on-stage edit mode); `PANEL_NAV_ITEMS`/`PANEL_NAV_HANDLERS` (from Task 1); `UI.iconRail` (modified this task).
- Produces: `UI.iconRail(container, items, activeValue, onSelect)` where each `item` may now carry `badge: true` to render a plus overlay. Signature is otherwise unchanged and backward-compatible (items without `badge` render exactly as before).

- [ ] **Step 1: Add the opt-in badge to `UI.iconRail`**

In `static/ui-icon-rail.js`, update the doc comment and the item-render loop to support a `badge` flag. Replace the destructuring and the icon-append section:

Change the loop signature line from:
```javascript
  const buttons = items.map(({ value, icon, label }) => {
```
to:
```javascript
  const buttons = items.map(({ value, icon, label, badge }) => {
```

And immediately after the existing `btn.appendChild(iconEl);` line, insert:
```javascript
    if (badge) {
      const badgeEl = document.createElement("span");
      badgeEl.className = "icon-rail-badge";
      badgeEl.setAttribute("aria-hidden", "true");
      badgeEl.textContent = "+";
      btn.appendChild(badgeEl);
    }
```

Update the doc comment (lines 5–7) to mention the new field, e.g. append to the items description: `— set badge:true on an item to overlay a small plus, marking it as an "insert" action rather than a plain panel toggle.`

- [ ] **Step 2: Style the badge**

In `static/css/components/icon-rail.css`, the `.icon-rail-btn` needs `position: relative` so the badge can anchor to it. Add `position: relative;` to the existing `.icon-rail-btn` rule (append the declaration; do not remove any existing declaration). Then append a new rule at the end of the file:

```css
/* Small plus overlay marking an "insert" rail button (TEXT/CAPTIONS) vs a plain panel toggle. */
.icon-rail-badge {
  position: absolute;
  top: 4px;
  right: 8px;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent);
  color: var(--bg-1);
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
}
```

Note: `--accent` (#6C87A3 dark / #4A6E92 light) and `--bg-1` (panel background) are existing tokens in `tokens.css`, both theme-aware — confirmed present at plan time. Do not invent new tokens.

- [ ] **Step 3: Mark the TEXT and CAPTIONS rail items as insert-capable**

In `static/panel-nav.js`, in `PANEL_NAV_ITEMS`, add `badge: true,` to the `text` item object and the `captions` item object (only those two). Example for the text item:
```javascript
  {
    value: "text",
    label: "TEXT",
    badge: true,
    icon: `<svg ...>...</svg>`,
  },
```
Do the same for the `captions` item. Leave all other items unchanged.

- [ ] **Step 4: Route the TEXT rail click to the insert flow**

In `static/panel-nav.js`, change the rail wiring line (bottom of the file, from Task 1) so the TEXT value inserts instead of just opening:

From:
```javascript
UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => PANEL_NAV_HANDLERS[value]());
```
To:
```javascript
// Rail = insert (creation). TEXT inserts a new block and drops into on-stage edit; the other
// rail buttons open their panel (CAPTIONS's openCaptionsPanel already create-or-opens the track).
// Opening an *existing* text block still happens via a timeline/stage click (onTimelineSelect).
UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => {
  if (value === "text") { addTextBlockAndEdit(); return; }
  PANEL_NAV_HANDLERS[value]();
});
```

Rationale for special-casing here rather than editing `PANEL_NAV_HANDLERS.text`: `PANEL_NAV_HANDLERS` keeps its "open panel for type X" semantics (it is also read by `reRenderAfterRestore`'s fallback), so only the rail's own click gets the insert behavior. CAPTIONS needs no special case — `openCaptionsPanel()` → `renderCaptionPanel()` → `ensureCaptionTrack()` already creates the track in memory if absent, with the always-visible Auto-caption button as the next step (this is design Task 2, verify-only).

- [ ] **Step 5: Update `CLAUDE.md`**

In the map, note under `panel-nav.js` / the icon-rail entry that TEXT/CAPTIONS rail items carry a plus badge (`UI.iconRail`'s `badge` option) and that the TEXT rail click calls `addTextBlockAndEdit()` (insert) rather than opening the panel — timeline/stage clicks remain the "open existing block" path. Update the `ui-icon-rail.js` inventory line to mention the `badge` option.

- [ ] **Step 6: Live verification on a throwaway project**

Server running; on a **throwaway** project (`await Api.createProject("insert-model-throwaway")` → open):
1. Confirm the TEXT and CAPTIONS rail icons show a small plus badge; FILES/VIDEO BOX/LAYERS/SETTINGS/EXPORT/PROJECTS do **not**.
2. Click the TEXT rail icon → a new text block appears on the stage in edit mode, the TEXT panel opens, and `project.text_blocks.length` increases by 1. Click it again → a **second** block is added (length +1 again). This is the core "rail inserts" behavior (contrast: pre-change it only opened the panel).
3. Add two blocks via the rail, then click each block in the timeline TEXT row → confirms `onTimelineSelect` opens the TEXT panel for that specific block (timeline = open). Repeat one stage click on a block → same.
4. Click the CAPTIONS rail icon on a project with no caption track → the CAPTIONS panel opens with the Auto-caption button visible and `project.captions` is now a non-null track (create-or-open). Click CAPTIONS again → same panel, no duplicate track (there is only one).
5. Confirm the VIDEO-row `+` button and the TEXT-row `+` button still add a clip / text block respectively (the second entry point stays — no regression), producing the same result as the rail insert.
6. Zero console errors throughout. Take a screenshot of the rail showing the badges as proof.
7. Delete the throwaway project via `await Api.deleteProject(<id>)`.

- [ ] **Step 7: Run the test suite**

Run:
```bash
.venv/Scripts/python -m pytest -q
```
Expected: 224 passed (unchanged — JS/CSS/HTML only).

- [ ] **Step 8: Commit**

```bash
git add static/ui-icon-rail.js static/css/components/icon-rail.css static/panel-nav.js CLAUDE.md
git commit -m "feat: TEXT rail button inserts a text block; plus badge on insert-capable rail items

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Final verification pass + backlog check-off

**Files:**
- Modify: `docs/superpowers/backlog.md` (check off Insert model)

**Interfaces:** none (bookkeeping + whole-item manual verification covering the design's verify-only Tasks 2 & 3).

- [ ] **Step 1: Whole-item manual verification against the design's acceptance bullets**

On a fresh **throwaway** project, confirm all of the design doc's Testing bullets in one pass:
- TEXT rail click adds a block each time (idempotent inserts).
- CAPTIONS rail click creates then opens (and re-opens without duplicating).
- Timeline clicks open the right panel for every row type present (VIDEO/TEXT/CAPTIONS/VIDEO BOX).
- The `+` buttons and rail inserts produce identical results (a block/clip added at the playhead).
- Undo/redo still works after a rail insert (Ctrl+Z removes the just-inserted block, Ctrl+Y re-adds) — confirms `reRenderAfterRestore` in its new home still re-opens the right panel.
- Delete the throwaway project when done.

- [ ] **Step 2: Confirm the full suite is green**

Run:
```bash
.venv/Scripts/python -m pytest -q
```
Expected: 224 passed.

- [ ] **Step 3: Check off the backlog item**

In `docs/superpowers/backlog.md`, move the `Insert model` line from **To do** to **Done** with a one-paragraph summary (files touched: new `static/panel-nav.js` extraction, `ui-icon-rail.js` badge option, `icon-rail.css`, the TEXT-rail insert wiring; verify-only confirmation that CAPTIONS create-or-open and timeline-opens-panel were already correct; live-verified on a throwaway project; pytest 224 green).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/backlog.md
git commit -m "docs: check off Insert model backlog item

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Design "TEXT rail button → inserts a new text block" → Task 2 Steps 3–4. ✓
- Design "CAPTIONS rail button → create-or-open" → already true; verified in Task 2 Step 6.4 and Task 3 Step 1. ✓
- Design "FILES / PROJECTS / SETTINGS / EXPORT rail buttons unchanged" → Task 2 leaves their handlers/route untouched (only `text` is special-cased). ✓
- Design "Timeline click → panel already works; verify covers every row" → `onTimelineSelect` moved verbatim (Task 1), verified across rows in Task 2 Step 6.3 and Task 3 Step 1. ✓
- Design "Rail affordance: insert-capable rail items get a small plus badge" → Task 2 Steps 1–3. ✓
- Design Task 0 "Extract nav machinery into `static/panel-nav.js` (pure move)" → Task 1. ✓
- Design "Data model: None" → no model/`app/` changes in any task. ✓
- Design "Reuse `addTextBlockAndEdit()`/`ensureCaptionTrack()` as-is" → Task 2 consumes `addTextBlockAndEdit`; CAPTIONS path untouched. ✓

**Placeholder scan:** No TBD/TODO; the one conditional ("if `tokens.css` token names differ, use the matching existing token") is a concrete instruction with a named fallback, not a vague placeholder. All code steps show full code.

**Type/name consistency:** `showPanel`, `onTimelineSelect`, `openTextPanel`, `openCaptionsPanel`, `openFilesPanel`, `PANEL_NAV_ITEMS`, `PANEL_NAV_HANDLERS`, `reRenderAfterRestore`, `addTextBlockAndEdit`, `UI.iconRail`, `.icon-rail-badge`, item field `badge` — used identically across Tasks 1–3 and matched to their real definitions in the current code (verified while writing the plan).
