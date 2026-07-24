# Top Toolbar with Select/Text Tool Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width toolbar strip at the top of the editor with two centered tool icons — Select and Text — that switch what a stage click does: Select picks/drags/opens-the-panel-for a box (text block or video box), Text edits an existing block or inserts a new one at the click point.

**Architecture:** A tiny framework-free state module (`window.ToolMode`) holds the active tool and notifies subscribers. A new toolbar component reads/writes it. Existing stage-interaction code (`ui-text-interaction.js`, `video-box-preview.js`) is gated on it so today's single "click enters edit" behavior for text splits into Select-mode (select-only) vs Text-mode (edit, unchanged). A new small file wires a `#stage` click listener that inserts text in Text mode.

**Tech Stack:** Vanilla JS (classic scripts, `window.*` namespacing), plain CSS with design tokens — matches the rest of `static/`. No build step, no new dependencies.

## Global Constraints

- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — all styling lives in `static/css/**` component files as classes (per project CLAUDE.md). JS-computed per-element positioning via `el.style.x = ...` (already used throughout `preview-text.js`/`video-box-preview.js`) is not "inline style" in this sense and is fine.
- Every `static/*.js` and `static/css/**/*.css` file opens with a 1–2 line header comment stating its purpose.
- No JS test runner exists in this project (`pytest` covers the Python backend only; there are zero `static/*.js` tests anywhere in the repo today). Per the approved design spec, this is a stated decision: pure logic is isolated into its own functions, and verification is manual via the running dev server. Each task below ends with a manual verification procedure instead of an automated test run.
- Every commit that adds/modifies files documented in the project's `CLAUDE.md` codebase map must update that map in the same commit (per project CLAUDE.md). Each task below includes its map edit as its own step, before the commit.
- Lucide icon SVGs are hand-inlined directly in markup, `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` wrapper, copied verbatim from lucide.dev.
- Video-box click-to-select (Task 4) is scoped to **plain click only** — a single mousedown+drag gesture on a not-yet-selected box will select it on mouseup (via the browser's native `click` event) but will not also move it in that same gesture. Moving requires a second, separate drag once the box is selected and its resize/drag handles are mounted. This mirrors how video-box selection already works via the VIDEO BOX panel today (select first, then drag) rather than introducing new select-and-drag-in-one-gesture plumbing, which the codebase doesn't have for video boxes yet.

---

### Task 1: ToolMode state module

**Files:**
- Create: `static/tool-mode.js`
- Modify: `static/index.html` (script tag)
- Modify: `CLAUDE.md` (map entry)

**Interfaces:**
- Produces: `window.ToolMode.get() -> "select" | "text"`, `window.ToolMode.set(mode)` (no-ops if `mode === get()`, else updates and notifies), `window.ToolMode.onChange(fn)` (subscribes `fn(newMode)`, called on every `set` that actually changes the mode). Default mode is `"select"`. Every later task in this plan consumes this exact shape.

- [ ] **Step 1: Create the state module**

Create `static/tool-mode.js`:

```js
// Current stage tool ("select" or "text") the editor is in — drives whether a stage click
// selects/drags a box or edits/inserts text. Pure, DOM-free state holder with a subscriber
// list; no persistence, always resets to "select" on reload. Exposes window.ToolMode.
window.ToolMode = (() => {
  let current = "select";
  const listeners = [];

  function get() {
    return current;
  }

  function set(mode) {
    if (mode === current) return;
    current = mode;
    listeners.forEach((fn) => fn(current));
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  return { get, set, onChange };
})();
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, find this line (currently line 785):

```html
<script src="/static/ui-button.js"></script>
```

Replace it with:

```html
<script src="/static/ui-button.js"></script>
<script src="/static/tool-mode.js"></script>
```

- [ ] **Step 3: Manual verification**

Run the dev server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` in the browser preview, open the browser's devtools console (or use the preview tool's JS-eval capability), and run:

```js
ToolMode.get()
```

Expected: `"select"`. Then run:

```js
let seen = null;
ToolMode.onChange((m) => { seen = m; });
ToolMode.set("text");
[ToolMode.get(), seen]
```

Expected: `["text", "text"]`.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`, find this line (the `static/` tree, right after `caption_word_estimate.py`/`export_jobs.py`):

```
static/
```

Replace it with:

```
static/
  tool-mode.js       # window.ToolMode.{get, set, onChange} (added 2026-07-24, top-toolbar): DOM-free current-tool ("select"|"text") state holder for the top toolbar; no persistence, resets to "select" on reload
```

- [ ] **Step 5: Commit**

```bash
git add static/tool-mode.js static/index.html CLAUDE.md
git commit -m "Add ToolMode state module for the top toolbar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Toolbar component, CSS, and mount

**Files:**
- Create: `static/css/components/toolbar.css`
- Create: `static/ui-toolbar.js`
- Modify: `static/index.html` (CSS link, `#toolbar` element, script tag)
- Modify: `static/editor.js` (mount call)
- Modify: `CLAUDE.md` (map entries)

**Interfaces:**
- Consumes: `window.ToolMode.get/set/onChange` (Task 1).
- Produces: `window.UI.toolbar(container)` — renders the Select/Text icon buttons into `container`, highlights the active one, and keeps the highlight in sync via `ToolMode.onChange`. No other task calls this directly except the one mount site in `editor.js`.

- [ ] **Step 1: Create the toolbar CSS**

Create `static/css/components/toolbar.css`:

```css
/* Top toolbar strip: centers the tool-mode icon buttons (Select/Text) above the 3-column main layout. */
/* Exposes #toolbar only; button styling comes from button-group.css's .icon-btn. Depends on tokens.css. */
#toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 40px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-1);
}
```

- [ ] **Step 2: Create the toolbar component**

Create `static/ui-toolbar.js`:

```js
// Top toolbar: renders the tool-mode icon buttons (Select/Text) into the given container,
// centered via toolbar.css's #toolbar flex layout. Highlights the active tool (window.ToolMode)
// and subscribes to ToolMode.onChange to stay in sync; clicking a button calls ToolMode.set.
// Reuses button-group.css's .icon-btn / .icon-btn[aria-pressed="true"] styling — no new
// active-state CSS needed. Exposes window.UI.toolbar(container).
window.UI = window.UI || {};

const TOOLBAR_TOOLS = [
  {
    value: "select",
    title: "Select",
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/></svg>',
  },
  {
    value: "text",
    title: "Text",
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/></svg>',
  },
];

window.UI.toolbar = function toolbar(container) {
  container.innerHTML = "";
  const buttons = {};
  TOOLBAR_TOOLS.forEach((tool) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn";
    btn.title = tool.title;
    btn.setAttribute("aria-pressed", String(ToolMode.get() === tool.value));
    btn.innerHTML = tool.icon;
    btn.addEventListener("click", () => ToolMode.set(tool.value));
    container.appendChild(btn);
    buttons[tool.value] = btn;
  });
  ToolMode.onChange((mode) => {
    Object.entries(buttons).forEach(([value, btn]) => btn.setAttribute("aria-pressed", String(value === mode)));
  });
};
```

- [ ] **Step 3: Add the CSS link, `#toolbar` element, and script tag**

In `static/index.html`, find this line:

```html
<link rel="stylesheet" href="/static/css/components/button-group.css">
```

Replace it with:

```html
<link rel="stylesheet" href="/static/css/components/button-group.css">
<link rel="stylesheet" href="/static/css/components/toolbar.css">
```

Find this block:

```html
<div id="app">
  <main>
```

Replace it with:

```html
<div id="app">
  <div id="toolbar"></div>
  <main>
```

Find this line (now right after Task 1's addition):

```html
<script src="/static/tool-mode.js"></script>
```

Replace it with:

```html
<script src="/static/tool-mode.js"></script>
<script src="/static/ui-toolbar.js"></script>
```

- [ ] **Step 4: Mount the toolbar**

In `static/editor.js`, find:

```js
UI.button(document.getElementById("theme-toggle"), { variant: "icon" });
UI.button(document.getElementById("export"), { variant: "accent" });
```

Replace it with:

```js
UI.button(document.getElementById("theme-toggle"), { variant: "icon" });
UI.button(document.getElementById("export"), { variant: "accent" });

UI.toolbar(document.getElementById("toolbar"));
```

- [ ] **Step 5: Manual verification**

With the dev server running (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open the app in the browser preview and:

1. Take a screenshot — confirm a toolbar strip appears at the very top of the page, above the three-column layout, with two icon buttons horizontally centered in it (not left- or right-aligned).
2. Confirm the Select (arrow-cursor) icon shows the active/pressed styling (accent border) by default.
3. Click the Text (type) icon. Confirm it becomes the pressed one and Select's pressed styling clears.
4. Click Select again to leave the toolbar back in its default state before continuing to the next task.

- [ ] **Step 6: Update the codebase map**

In `CLAUDE.md`, find the line added by Task 1:

```
  tool-mode.js       # window.ToolMode.{get, set, onChange} (added 2026-07-24, top-toolbar): DOM-free current-tool ("select"|"text") state holder for the top toolbar; no persistence, resets to "select" on reload
```

Replace it with:

```
  tool-mode.js       # window.ToolMode.{get, set, onChange} (added 2026-07-24, top-toolbar): DOM-free current-tool ("select"|"text") state holder for the top toolbar; no persistence, resets to "select" on reload
  ui-toolbar.js      # UI.toolbar(container) (added 2026-07-24, top-toolbar): renders the Select/Text icon buttons into #toolbar, highlights the active tool via ToolMode.onChange, reuses button-group.css's .icon-btn styling
```

Then find this line (the `index.html` tree-description line, currently line 41 — it's long, matched here by the start of the line):

```
  index.html         # editor page: no top bar (removed 2026-07-18 — its last two children, `#project-name`/`#topbar-spacer`, were dropped: project name now shows via `document.title` instead, set dynamically in editor.js) + 3-column main
```

At the very start of that description (right after `# editor page: `), replace:

```
no top bar (removed 2026-07-18 — its last two children, `#project-name`/`#topbar-spacer`, were dropped: project name now shows via `document.title` instead, set dynamically in editor.js) + 3-column main
```

with:

```
a top `#toolbar` strip (added 2026-07-24, top-toolbar: centered Select/Text tool-mode icon buttons, `UI.toolbar`) above the 3-column main
```

(Leave the rest of that long line — the "no side-panel heading field" clause and everything after — untouched; this is a find-and-replace of just that one clause, not a full-line rewrite.)

Then find this line (the CSS tree, `layout.css`):

```
    layout.css               # app shell: 3-column main (left panel, #center-col, right panel), no top bar (removed 2026-07-18); #center-col is a flex column holding the stage and timeline strip
```

Replace it with:

```
    layout.css               # app shell: 3-column main (left panel, #center-col, right panel); #center-col is a flex column holding the stage and timeline strip. Does not style #toolbar — that's its own toolbar.css, a sibling of <main> inside #app (2026-07-24, top-toolbar)
    toolbar.css               # #toolbar: full-width strip above <main>, centers the Select/Text tool-mode icon buttons (UI.toolbar); button styling reused from button-group.css's .icon-btn (added 2026-07-24, top-toolbar)
```

Finally, add a new Inventory subsection. Find:

```
### Undo/redo
```

Replace it with:

```
### Toolbar & tool modes

Top toolbar strip (`#toolbar`, sibling of `<main>` inside `#app`) with two centered tool icons, added 2026-07-24. Drives whether a stage click selects/drags a box (Select) or edits/inserts text (Text) — see the gating notes on `ui-text-interaction.js`/`video-box-preview.js`/`stage-click-router.js` under Video boxes and Text blocks below.

- `static/tool-mode.js` — `window.ToolMode.{get, set, onChange}`: the current tool, default `"select"`, no persistence.
- `static/ui-toolbar.js` — `UI.toolbar(container)`: renders/highlights the two icon buttons, subscribes to `ToolMode.onChange`.
- `static/css/components/toolbar.css` — `#toolbar` layout only; button look comes from `button-group.css`.

### Undo/redo
```

- [ ] **Step 7: Commit**

```bash
git add static/css/components/toolbar.css static/ui-toolbar.js static/index.html static/editor.js CLAUDE.md
git commit -m "Add centered top toolbar with Select/Text tool icons

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Gate text click-to-edit on Select vs Text tool

**Files:**
- Modify: `static/ui-text-interaction.js`
- Modify: `static/preview-text.js`
- Modify: `CLAUDE.md` (Inventory bullet updates)

**Interfaces:**
- Consumes: `window.ToolMode.get()` (Task 1).
- Produces: `UI.textInteraction(div, { ..., onSelectClick })` — new optional `onSelectClick` callback, fired instead of entering edit mode when the active tool is not `"text"`. `enterEditMode()` (the returned handle, used by `PreviewText.enterEditMode`) is unaffected by tool mode — it always enters edit mode when called programmatically, regardless of the active tool. Task 5 relies on this to drop a freshly-inserted block straight into edit mode even though the tool auto-reverts to Select right after.

- [ ] **Step 1: Gate the plain-click path in `ui-text-interaction.js`**

Read the current file first (`static/ui-text-interaction.js`) to confirm it's unchanged from this plan's assumptions, then replace its full contents with:

```js
// Reusable stage interaction: click-to-edit a contentEditable element, click-drag over glyphs to
// perform a native text selection (reported via onSelectionChange, for rich-text range formatting),
// or click-drag over empty box padding to move the element. Mirrors ui-resize-handles.js's shape (a
// standalone interaction handler preview.js mounts/unmounts per-element via a callback object).
// Returns { enterEditMode } so a caller can programmatically enter edit mode (e.g. immediately
// after creating a new text block), not just on user click.
// isPlaceholder skips the glyph hit-test entirely: placeholder text isn't real content to select
// or format, and classifying it as a glyph made any click on it fragile (native text-selection
// treats the smallest mouse jitter as a drag, so the click silently fails to enter edit mode
// instead of always landing on the padding/click-vs-move threshold logic below).
// Tool-mode gating (added 2026-07-24, top-toolbar): a plain click only enters edit mode when the
// active tool (window.ToolMode) is "text". Outside Text mode (i.e. in Select mode), a plain click
// fires onSelectClick instead (select-without-edit), and glyph hit-testing/native text-selection
// is skipped entirely — every mousedown is treated as the box-move drag branch, so dragging still
// moves the box regardless of tool, only the plain-click outcome differs. enterEditMode() itself
// (the returned handle) is NOT gated — a caller invoking it programmatically always enters edit
// mode, tool mode notwithstanding.
window.UI = window.UI || {};

window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd, onMove, onMoveEnd, onSelectionChange, onSelectClick, isPlaceholder } = {}) {
  function enterEditMode() {
    if (div.contentEditable === "true") return;
    div.contentEditable = "true";
    div.focus();
    if (onEditStart) onEditStart();
    const onInputEvt = () => { if (onInput) onInput(div.textContent); };
    const onBlur = () => {
      div.removeEventListener("input", onInputEvt);
      div.removeEventListener("blur", onBlur);
      div.contentEditable = "false";
      if (onEditEnd) onEditEnd(div.textContent);
    };
    div.addEventListener("input", onInputEvt);
    div.addEventListener("blur", onBlur);
  }

  function isTextToolActive() {
    return !window.ToolMode || window.ToolMode.get() === "text";
  }

  function handlePlainClick() {
    if (isTextToolActive()) enterEditMode();
    else if (onSelectClick) onSelectClick();
  }

  div.addEventListener("mousedown", (e) => {
    if (e.target.closest(".resize-handle")) return; // let resize handles work unmodified
    if (div.contentEditable === "true") return; // already editing, let native caret placement work

    if (!isPlaceholder && isTextToolActive() && UI.rangeContainsPoint(div, e.clientX, e.clientY)) {
      // Landed on a glyph while the Text tool is active: let the browser's native text-selection
      // drag run completely unmodified (no preventDefault, no custom mousemove tracking) and
      // classify the outcome on mouseup — a real drag produces a non-collapsed selection
      // (format-range intent), a plain click leaves it collapsed (edit intent, same as before).
      const onMouseUp = () => {
        document.removeEventListener("mouseup", onMouseUp);
        const offsets = UI.textSelectionOffsets(div);
        if (offsets && offsets.end > offsets.start) {
          if (onSelectionChange) onSelectionChange(offsets);
        } else {
          handlePlainClick();
        }
      };
      document.addEventListener("mouseup", onMouseUp);
      return;
    }

    // Landed on empty box padding — or the Select tool is active, so glyphs are treated the same
    // as padding: box-move drag, unchanged from Phase 1.
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (moved && onMove) onMove({ dx, dy });
    };
    const onMouseUp = (upEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (moved) {
        const dx = upEvent.clientX - startX, dy = upEvent.clientY - startY;
        if (onMoveEnd) onMoveEnd({ dx, dy });
      } else {
        handlePlainClick();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  return { enterEditMode };
};
```

- [ ] **Step 2: Wire `onSelectClick` in `preview-text.js`**

In `static/preview-text.js`, find:

```js
        onSelectionChange: (offsets) => {
          activeFormatSelection = { blockId: block.id, start: offsets.start, end: offsets.end };
          if (boxResizeCallbacks && boxResizeCallbacks.onSelectionChange) boxResizeCallbacks.onSelectionChange(activeFormatSelection);
        },
      }));
```

Replace it with:

```js
        onSelectionChange: (offsets) => {
          activeFormatSelection = { blockId: block.id, start: offsets.start, end: offsets.end };
          if (boxResizeCallbacks && boxResizeCallbacks.onSelectionChange) boxResizeCallbacks.onSelectionChange(activeFormatSelection);
        },
        // Select-tool plain click (ui-text-interaction.js's handlePlainClick when the active tool
        // isn't "text"): select this block without entering edit, same activation path onEditStart
        // uses for the Text tool so both tools route through the one place that switches the right
        // panel to TEXT (editor.js's Preview.setOnStageTextActivate wiring).
        onSelectClick: () => {
          if (block.id !== selectedTextBlockId && onStageTextActivate) onStageTextActivate(block.id);
        },
      }));
```

- [ ] **Step 3: Manual verification**

With the dev server running, open a project that has at least one text block on the stage (create one first with the Text tool if needed — this becomes testable once Task 5 lands; for now, add one via the existing "+ Add text" button in the empty-state TEXT panel).

1. Ensure the toolbar's Select tool is active (default).
2. Click the existing text block on the stage. Expected: it does **not** enter edit mode (no text caret, no contentEditable outline) — instead the TEXT panel opens/stays open with that block selected.
3. Click-and-drag the same block by a noticeable amount. Expected: it moves, same as before this change.
4. Switch the toolbar to the Text tool. Click the block again. Expected: it now enters edit mode (contentEditable, caret visible) exactly as it did before this task (regression check).
5. Type a character, click elsewhere to blur, confirm the edit persisted (autosave indicator shows "Saved").

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`, find:

```
- `static/ui-text-interaction.js` — `UI.textInteraction(div, {onEditStart, onInput, onEditEnd, onMove, onMoveEnd, onSelectionChange})`: click-to-edit (`contentEditable`) vs drag-to-move vs drag-to-select, hit-tested at `mousedown` via `UI.rangeContainsPoint`.
```

Replace it with:

```
- `static/ui-text-interaction.js` — `UI.textInteraction(div, {onEditStart, onInput, onEditEnd, onMove, onMoveEnd, onSelectionChange, onSelectClick})`: click-to-edit (`contentEditable`) vs drag-to-move vs drag-to-select, hit-tested at `mousedown` via `UI.rangeContainsPoint`. Tool-mode gated (added 2026-07-24, top-toolbar): a plain click enters edit mode only when `window.ToolMode.get() === "text"`; otherwise (Select tool) it fires `onSelectClick` instead and glyph hit-testing/native text-selection is skipped entirely (every mousedown is a box-move drag). The returned `enterEditMode()` handle is never gated — programmatic calls (e.g. `PreviewText.enterEditMode`) always work regardless of tool.
```

Then find:

```
- `static/preview-text.js` (`window.PreviewText`, extracted from `static/preview.js` 2026-07-21) — `renderText(project, presets, timelineTime)` composites one `.text-block` div per visible block into `#overlay`.
```

At that point in the line, insert (keeping the rest of the long line unchanged) the following clause right before the final sentence about `static/preview.js` exposing wrappers:

Find (the exact tail of that same bullet):

```
`static/preview.js` exposes all of these as thin `Preview.*` delegating wrappers (`getTextBoxSize`/`getCaptionBoxSize` for the size getters) so no caller changes.
```

Replace it with:

```
Passes `onSelectClick` (added 2026-07-24, top-toolbar) to each block's `UI.textInteraction`, wired to the same `onStageTextActivate` callback `onEditStart` already uses — so a Select-tool click and a Text-tool click both route through the one place that switches the right panel to TEXT. `static/preview.js` exposes all of these as thin `Preview.*` delegating wrappers (`getTextBoxSize`/`getCaptionBoxSize` for the size getters) so no caller changes.
```

- [ ] **Step 5: Commit**

```bash
git add static/ui-text-interaction.js static/preview-text.js CLAUDE.md
git commit -m "Gate text click-to-edit on the Select vs Text tool

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Video-box click-to-select on stage (Select tool)

**Files:**
- Modify: `static/video-box-preview.js`
- Modify: `static/editor.js`
- Modify: `CLAUDE.md` (Inventory bullet update)

**Interfaces:**
- Consumes: `window.ToolMode.get()` (Task 1); `onTimelineSelect({ type: "video-box", item })` (existing, `static/panel-nav.js`).
- Produces: `window.VideoBoxPreview.setOnActivate(fn)` — `fn(boxId)` is called when a not-yet-selected video box is plain-clicked on stage while the Select tool is active.

- [ ] **Step 1: Add click-to-select in `video-box-preview.js`**

In `static/video-box-preview.js`, find:

```js
window.VideoBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <video>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
```

Replace it with:

```js
window.VideoBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <video>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
  let onActivate = null; // (boxId) => void, fired by a plain click on an unselected box in Select mode
```

Then find:

```js
      let video = mounted.get(v.id);
      if (!video) {
        video = document.createElement("video");
        video.className = "video-box";
        video.muted = true;
        video.src = "/media?path=" + encodeURIComponent(v.file_path);
        video.style.pointerEvents = "auto";
        overlay.appendChild(video);
        mounted.set(v.id, video);
      }
```

Replace it with:

```js
      let video = mounted.get(v.id);
      if (!video) {
        video = document.createElement("video");
        video.className = "video-box";
        video.muted = true;
        video.src = "/media?path=" + encodeURIComponent(v.file_path);
        video.style.pointerEvents = "auto";
        // Click-to-select (added 2026-07-24, top-toolbar): a plain click on a not-yet-selected
        // box selects it, Select-tool only — once selected, mountHandles' own drag listener owns
        // clicks/drags on this element instead, so this returns early for the selected box. In
        // Text-tool mode this deliberately does nothing, so the click bubbles up to #stage's
        // click listener (stage-click-router.js) and is treated as "insert text on top" per the
        // top-toolbar design spec.
        video.addEventListener("click", () => {
          if (v.id === selectedBoxId) return;
          if (!window.ToolMode || ToolMode.get() !== "select") return;
          if (onActivate) onActivate(v.id);
        });
        overlay.appendChild(video);
        mounted.set(v.id, video);
      }
```

Then find:

```js
  function setSelectedVideoBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    selectedBoxId = boxId;
    callbacks = cb || null;
  }

  return { render, setSelectedVideoBox };
})();
```

Replace it with:

```js
  function setSelectedVideoBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    selectedBoxId = boxId;
    callbacks = cb || null;
  }

  function setOnActivate(fn) {
    onActivate = fn || null;
  }

  return { render, setSelectedVideoBox, setOnActivate };
})();
```

- [ ] **Step 2: Wire the activation callback in `editor.js`**

In `static/editor.js`, find:

```js
// Clicking stage text while some other right-panel section is open (FILES/VIDEO/CAPTIONS/...)
// should switch to TEXT and fully select the block, in the same click that entered edit mode.
Preview.setOnStageTextActivate((blockId) => {
  selectTextBlock(blockId);
  openTextPanel();
});
```

Replace it with:

```js
// Clicking stage text while some other right-panel section is open (FILES/VIDEO/CAPTIONS/...)
// should switch to TEXT and fully select the block, in the same click that entered edit mode.
Preview.setOnStageTextActivate((blockId) => {
  selectTextBlock(blockId);
  openTextPanel();
});

// Select-tool click on an unselected video box (video-box-preview.js's setOnActivate, added
// 2026-07-24, top-toolbar): open the VIDEO BOX panel for it, same as picking it from a timeline
// click, then explicitly re-render the stage so its drag/resize handles mount immediately —
// VideoBoxPanel.render()'s VideoBoxPreview.setSelectedVideoBox() call alone only updates which
// box is selected, it doesn't itself trigger a render pass.
VideoBoxPreview.setOnActivate((boxId) => {
  const box = project.video_boxes.find((b) => b.id === boxId);
  if (!box) return;
  onTimelineSelect({ type: "video-box", item: box });
  VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
});
```

- [ ] **Step 3: Manual verification**

With the dev server running, open a project with at least one video box (add one via the VIDEO BOX panel's "ADD VIDEO BOX" if none exists) positioned somewhere on the stage away from any text block.

1. Open a different panel (e.g. FILES) so the video box isn't currently selected.
2. Ensure the toolbar's Select tool is active.
3. Click the video box on the stage. Expected: the VIDEO BOX panel opens showing that box's details, and resize handles appear around it on stage.
4. Drag the box by its body (not a handle). Expected: it moves (this exercises the existing drag path, now reachable in one extra click from an unselected state).
5. Switch to the Text tool and click a *different*, currently-unselected video box (or the same one after deselecting via another panel). Expected: nothing is selected — instead a new empty text block is inserted on top of it in edit mode (this second half is fully verifiable only after Task 5 lands; if Task 5 isn't done yet, just confirm the video box does *not* get selected).

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`, find:

```
- `static/video-box-preview.js` — `VideoBoxPreview.render(videoBoxes, timelineTime)` / `VideoBoxPreview.setSelectedVideoBox(id, callbacks)`: mounts one always-muted `<video>` per visible box into `#overlay` (a sibling of preview.js's text/caption divs — each sets an explicit CSS z-index from its model's `z_index`), keeps position/size/`currentTime` in sync with the timeline clock, wires drag-to-move (`UI.videoBoxDrag`) + resize (`UI.resizeHandles`, shared with text blocks) onto the selected box.
```

Replace it with:

```
- `static/video-box-preview.js` — `VideoBoxPreview.render(videoBoxes, timelineTime)` / `VideoBoxPreview.setSelectedVideoBox(id, callbacks)` / `VideoBoxPreview.setOnActivate(fn)` (added 2026-07-24, top-toolbar): mounts one always-muted `<video>` per visible box into `#overlay` (a sibling of preview.js's text/caption divs — each sets an explicit CSS z-index from its model's `z_index`), keeps position/size/`currentTime` in sync with the timeline clock, wires drag-to-move (`UI.videoBoxDrag`) + resize (`UI.resizeHandles`, shared with text blocks) onto the selected box. A plain click on a not-yet-selected box, Select-tool only (`window.ToolMode`), fires `onActivate(boxId)` — `editor.js` wires this to open the VIDEO BOX panel and re-render so handles mount immediately; in Text-tool mode the click listener no-ops so the click bubbles to `#stage` and is treated as an insert-text-here click (see `stage-click-router.js`).
```

- [ ] **Step 5: Commit**

```bash
git add static/video-box-preview.js static/editor.js CLAUDE.md
git commit -m "Add click-to-select for video boxes on stage (Select tool)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Text-tool insert-at-click-point with auto-revert

**Files:**
- Create: `static/stage-click-router.js`
- Modify: `static/panel-text.js`
- Modify: `static/index.html` (script tag)
- Modify: `CLAUDE.md` (map entry + Inventory bullet update)

**Interfaces:**
- Consumes: `window.ToolMode.get/set` (Task 1); `addTextBlockAndEdit(position?)` (this task extends its signature, `static/panel-text.js`).
- Produces: a `#stage` `click` listener (self-registered, no exported function other than the internal pure `canvasPointFromClient`, not attached to `window` since nothing outside this file calls it).

- [ ] **Step 1: Extend `addTextBlockAndEdit` to accept an optional position**

In `static/panel-text.js`, find:

```js
async function addTextBlockAndEdit() {
  const block = addTextBlock();
  selected = { type: "text", item: block };
  showPanel("text");
  await renderTextPanel();
  renderTimeline();
  Preview.enterTextEditMode(block.id);
  await saveProject();
}
```

Replace it with:

```js
// `position` ({x, y} in 1080x1920 canvas px), when given, overrides the new block's default
// centered placement — used by stage-click-router.js's Text-tool insert-at-click (added
// 2026-07-24, top-toolbar). Omitted, this is identical to the pre-existing behavior.
async function addTextBlockAndEdit(position) {
  const block = addTextBlock();
  if (position) {
    const preset = ensureTextPreset(block.preset_id);
    preset.x = position.x;
    preset.y = position.y;
  }
  selected = { type: "text", item: block };
  showPanel("text");
  await renderTextPanel();
  renderTimeline();
  Preview.enterTextEditMode(block.id);
  await saveProject();
}
```

- [ ] **Step 2: Create the stage click router**

Create `static/stage-click-router.js`:

```js
// Routes clicks on the stage background to the active tool (window.ToolMode, top-toolbar
// feature, added 2026-07-24). In Text-tool mode, a click anywhere on #stage that ISN'T an
// existing .text-block (a video box counts as "anywhere else", per the top-toolbar design spec:
// clicking a video box in Text mode inserts text on top of it) inserts a new text block centered
// at the click point and drops the tool back to Select afterward (Figma/Canva-style "insert
// once, then select"). Clicks on an existing .text-block are left entirely to
// ui-text-interaction.js's own click handling (edit-mode entry) — this listener still receives
// that click too (it bubbles up from the block), so it must ignore it explicitly rather than
// relying on event.stopPropagation() anywhere upstream. In Select-tool mode this file does
// nothing at all. Depends on window.ToolMode and on panel-text.js's addTextBlockAndEdit() /
// editor.js's project global — classic-script globals resolved at click time, not at this
// script's load time, so load order relative to those files doesn't matter.

// Converts a mouse event's client coordinates into the 1080x1920 canvas coordinate space used by
// TextPreset.x/y, clamped to the canvas bounds. Pure given `rect` (the overlay's bounding rect).
function canvasPointFromClient(clientX, clientY, rect) {
  const x = Math.round((clientX - rect.left) / rect.width * 1080);
  const y = Math.round((clientY - rect.top) / rect.height * 1920);
  return { x: Math.max(0, Math.min(1080, x)), y: Math.max(0, Math.min(1920, y)) };
}

document.getElementById("stage").addEventListener("click", async (e) => {
  if (!window.ToolMode || ToolMode.get() !== "text") return;
  if (e.target.closest(".text-block")) return; // let the block's own click-to-edit handle it
  const rect = document.getElementById("overlay").getBoundingClientRect();
  const point = canvasPointFromClient(e.clientX, e.clientY, rect);
  await addTextBlockAndEdit(point);
  ToolMode.set("select");
});
```

- [ ] **Step 3: Wire the script tag**

In `static/index.html`, find:

```html
<script src="/static/panel-text.js"></script>
```

Replace it with:

```html
<script src="/static/panel-text.js"></script>
<script src="/static/stage-click-router.js"></script>
```

- [ ] **Step 4: Manual verification**

With the dev server running, open a project (any state) and:

1. Switch the toolbar to the Text tool.
2. Click on an empty area of the stage (not on any existing text block or video box), noting roughly where you clicked relative to the 9:16 frame — e.g. left-third, vertically near the top.
3. Expected: a new text block appears with its center roughly at the clicked point, immediately in edit mode (visible caret / contentEditable), and the TEXT panel is open for it.
4. Type some text, then click elsewhere on the empty stage (not on the new block).
5. Expected: the toolbar's Select tool becomes active again (auto-revert) and a second new text block is inserted at the second click point — confirming revert happened (a second click in Text mode would insert again, so seeing the toolbar back on Select after step 3's click, then having to switch back to Text before step 4's second insert, is the real check — redo this check explicitly): after step 3, take a screenshot of the toolbar and confirm Select is highlighted, not Text.
6. With Select tool now active, click the newly-created block. Expected (per Task 3): it selects without entering edit mode.
7. Switch to Text tool, click an existing text block. Expected: it enters edit mode directly (does not insert a new block, does not auto-revert immediately since no insert happened).
8. Add a video box if one doesn't already exist, switch to Text tool, click on top of the video box. Expected: a new text block is inserted at that point (not a video-box selection), and the tool auto-reverts to Select.

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, find the two lines added by Task 2 (Step 6):

```
  tool-mode.js       # window.ToolMode.{get, set, onChange} (added 2026-07-24, top-toolbar): DOM-free current-tool ("select"|"text") state holder for the top toolbar; no persistence, resets to "select" on reload
  ui-toolbar.js      # UI.toolbar(container) (added 2026-07-24, top-toolbar): renders the Select/Text icon buttons into #toolbar, highlights the active tool via ToolMode.onChange, reuses button-group.css's .icon-btn styling
```

Replace them with:

```
  tool-mode.js       # window.ToolMode.{get, set, onChange} (added 2026-07-24, top-toolbar): DOM-free current-tool ("select"|"text") state holder for the top toolbar; no persistence, resets to "select" on reload
  ui-toolbar.js      # UI.toolbar(container) (added 2026-07-24, top-toolbar): renders the Select/Text icon buttons into #toolbar, highlights the active tool via ToolMode.onChange, reuses button-group.css's .icon-btn styling
  stage-click-router.js # (added 2026-07-24, top-toolbar) self-registered #stage click listener: in Text-tool mode, a click that isn't on an existing .text-block inserts a new text block (addTextBlockAndEdit(position)) centered at the click point (canvasPointFromClient, pure) then reverts ToolMode to "select"; no-ops entirely in Select-tool mode
```

Then find the Inventory subsection added by Task 2 (Step 6):

```
### Toolbar & tool modes

Top toolbar strip (`#toolbar`, sibling of `<main>` inside `#app`) with two centered tool icons, added 2026-07-24. Drives whether a stage click selects/drags a box (Select) or edits/inserts text (Text) — see the gating notes on `ui-text-interaction.js`/`video-box-preview.js`/`stage-click-router.js` under Video boxes and Text blocks below.

- `static/tool-mode.js` — `window.ToolMode.{get, set, onChange}`: the current tool, default `"select"`, no persistence.
- `static/ui-toolbar.js` — `UI.toolbar(container)`: renders/highlights the two icon buttons, subscribes to `ToolMode.onChange`.
- `static/css/components/toolbar.css` — `#toolbar` layout only; button look comes from `button-group.css`.
```

Replace it with:

```
### Toolbar & tool modes

Top toolbar strip (`#toolbar`, sibling of `<main>` inside `#app`) with two centered tool icons, added 2026-07-24. Drives whether a stage click selects/drags a box (Select) or edits/inserts text (Text) — see the gating notes on `ui-text-interaction.js`/`video-box-preview.js`/`stage-click-router.js` under Video boxes and Text blocks below.

- `static/tool-mode.js` — `window.ToolMode.{get, set, onChange}`: the current tool, default `"select"`, no persistence.
- `static/ui-toolbar.js` — `UI.toolbar(container)`: renders/highlights the two icon buttons, subscribes to `ToolMode.onChange`.
- `static/css/components/toolbar.css` — `#toolbar` layout only; button look comes from `button-group.css`.
- `static/stage-click-router.js` — self-registered `#stage` `click` listener: Text-tool mode + click not on a `.text-block` (a video box counts as "not on a text-block") inserts a new text block at the click point via `panel-text.js`'s `addTextBlockAndEdit(position)`, then `ToolMode.set("select")` (auto-revert, one insert per tool switch). `canvasPointFromClient(clientX, clientY, rect)` is the pure client-px → 1080×1920-canvas-px conversion, clamped to canvas bounds.
```

- [ ] **Step 6: Commit**

```bash
git add static/stage-click-router.js static/panel-text.js static/index.html CLAUDE.md
git commit -m "Add Text-tool insert-at-click with auto-revert to Select

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
