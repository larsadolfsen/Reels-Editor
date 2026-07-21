# Empty New Project + Timeline Add Buttons + Multiple Text Blocks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New projects start truly empty (no seeded caption, no auto-created text block, no stale video frame), the VIDEO and TEXT timeline rows get + add buttons, and the TEXT + button adds *another* block each click — real multi-text-block editing with per-block selection, panel targeting, and delete.

**Architecture:** The data model, `app/ass_render.py`, `static/preview.js`, and `static/timeline.js` already support N text blocks; the single-block assumption lives only in `static/editor.js`'s `ensureTextBlock()` and its ~20 call sites in `text-panel-*.js`. Because `editor.js` (762 lines) and `preview.js` (488 lines) are both over the 400-line hard limit, three pure-refactor extraction tasks come first: `panel-text.js` + `panel-captions.js` + `clip-sequence.js` out of `editor.js`, and `preview-text.js` + `preview-captions.js` out of `preview.js`. Then the feature lands on the smaller files.

**Tech Stack:** Vanilla JS (no bundler, classic scripts sharing global scope), FastAPI/Pydantic backend (untouched except a possible new test), pytest.

## Global Constraints

- `CLAUDE.md` hard rule: never add a feature to a file over 400 lines — the extraction tasks (1–3) MUST land before the feature tasks (4–8).
- Every new/edited source file gets/keeps a 2–3 line header comment.
- No inline `style="..."` in HTML or JS-rendered markup — classes in `static/css/components/*` only. (Dynamic positioning via `el.style.left` etc. in `timeline.js` is the established exception for computed pixel positions.)
- Icons: hand-inlined Lucide SVG paths, `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- One function/component per file for `window.UI.*`/`window.Api.*`; panel sections follow the `panel-video-box.js` pattern (`window.XPanel` namespace, IIFE).
- Classic-script globals: top-level `let`/`function` declarations are visible across script files; call order (not load order) is what matters, but a file whose top level *executes* DOM wiring must load after the DOM ids it touches exist (all scripts sit at the end of `<body>`, so this is already true).
- Every task that adds/moves/deletes files updates the codebase map in `CLAUDE.md` in the same commit.
- Run `pytest -q` (as `.venv/Scripts/python -m pytest -q` from the repo root) after every task; suite must stay green. JS layers are the stated-untested thin-wiring layer — each feature task lists its manual verification, executed live in Task 8.
- Commit after every task on the batch branch.

## Verified-against-code corrections to the design doc

- Stale-video fix is mostly already implemented: `preview.js`'s `load()` already does `player.removeAttribute("src")` and resets `preloadedIndex`/`virtualTime` for clipless projects. Only `player.load()` is missing (without it the old frame stays painted).
- `preview.js`'s `renderText` already renders all blocks, already gates interactivity per block, and `onStageTextActivate` already receives the block id (editor.js just ignores it today).
- `timeline.js`'s TEXT row already renders one block per entry and passes the specific block to `onSelect`.
- `nudgeTime()` in `editor.js` calls `Timeline.render` directly with 4 args — Task 6 routes it through `renderTimeline()` so the + buttons don't vanish on arrow-key nudge.

---

### Task 1: Extract `static/panel-text.js` from `editor.js` (pure move)

**Files:**
- Create: `static/panel-text.js`
- Modify: `static/editor.js` (delete the moved code), `static/index.html` (add script tag), `CLAUDE.md` (map)

**Interfaces:**
- Produces: the same global function names, now defined in `panel-text.js`: `defaultTextPreset(id)`, `ensureTextPreset(id)`, `ensureTextBlock()`, `renderTextPreview()`, `renderTextPanel()`, `renderBoxPanel()`, `stageScale()`, `handleBoxResize`, `handleBoxResizeEnd`, `handleBoxMove`, `handleBoxMoveEnd`. Zero signature changes — `text-panel-*.js` and `editor.js` call sites keep working untouched.

- [ ] **Step 1: Move the code**

Cut these from `static/editor.js` and paste verbatim into new `static/panel-text.js` (current line refs): `POSITION_ANCHORS_X`/`POSITION_ANCHORS_Y` consts (46–47), `defaultTextPreset` (49–59), `ensureTextPreset` (63–68), `ensureTextBlock` (70–81), `renderTextPreview` (83–86), `renderTextPanel` (147–179), `renderBoxPanel` (181–226), `stageScale` (228–231), `handleBoxResize`/`handleBoxResizeEnd`/`handleBoxMove`/`handleBoxMoveEnd` (233–271), plus the four TEXT accordion-wiring calls (273–276: `text-style`/`text-font`/`text-box`/`text-time`) and the three TEXT-panel divider calls (284–286: `text-box-width-height-divider`, `text-box-background-border-divider`, `text-box-border-position-divider`).

Header comment for the new file:

```js
// TEXT context-panel section: renders the FONT/STYLES/BOX/TIME accordions for the selected
// text block, plus the stage resize/move handlers. Plain globals (renderTextPanel, ensureTextBlock,
// ...) shared with text-panel-*.js; reaches into editor.js's `project`/`saveProject` globals.
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, add `<script src="/static/panel-text.js"></script>` immediately after the `panel-video.js` tag (line ~633), before `preview.js`.

- [ ] **Step 3: Verify**

Run: `.venv/Scripts/python -m pytest -q` → green (no backend change).
Start the server, open the editor, open the TEXT panel, confirm accordions render and a font change previews — no console errors.

- [ ] **Step 4: Update CLAUDE.md map** (file tree + Text-blocks inventory entry), note editor.js line count drop.

- [ ] **Step 5: Commit** `refactor: extract panel-text.js from editor.js (no behavior change)`

---

### Task 2: Extract `static/panel-captions.js` and `static/clip-sequence.js` from `editor.js` (pure moves)

**Files:**
- Create: `static/panel-captions.js`, `static/clip-sequence.js`
- Modify: `static/editor.js`, `static/index.html`, `CLAUDE.md`

**Interfaces:**
- Produces: unchanged global names `defaultCaptionPreset`, `ensureCaptionPreset`, `ensureCaptionTrack`, `renderCaptionPreview`, `renderCaptionPanel` (in `panel-captions.js`); `insertClipIntoSequence(source, dropTime)`, `stitchVideoBoxIntoSequence(box, dropTime)`, `addClip()` (in `clip-sequence.js`).

- [ ] **Step 1: Move caption code**

Into `static/panel-captions.js`: `defaultCaptionPreset` (88–98), `ensureCaptionPreset` (100–105), `ensureCaptionTrack` (107–118), `renderCaptionPreview` (120–124), `renderCaptionPanel` (126–145), the four CAPTION accordion-wiring calls (278–281), the three caption divider calls (287–289), and the `#caption-auto-btn` click listener (631–645). Header comment stating the file's role.

- [ ] **Step 2: Move clip-sequence code**

Into `static/clip-sequence.js`: `insertClipIntoSequence` (505–557 incl. its doc comment), `stitchVideoBoxIntoSequence` (559–564), `addClip` (566–589), and the `#add-clip` click listener (591). Header comment stating the file's role.

- [ ] **Step 3: Script tags**

Add both after the `panel-text.js` tag: `panel-captions.js`, then `clip-sequence.js`.

- [ ] **Step 4: Verify**

`.venv/Scripts/python -m pytest -q` → green. `wc -l static/editor.js` → must now be **under 400**. Browser: CAPTIONS panel renders, MEDIA-panel import button still opens the file picker (cancel is fine), drag-to-timeline still inserts. No console errors.

- [ ] **Step 5: Update CLAUDE.md map. Commit** `refactor: extract panel-captions.js + clip-sequence.js from editor.js`

---

### Task 3: Extract `static/preview-text.js` + `static/preview-captions.js` from `preview.js` (pure move, delegating wrappers)

**Files:**
- Create: `static/preview-text.js`, `static/preview-captions.js`
- Modify: `static/preview.js`, `static/index.html`, `CLAUDE.md`

**Interfaces:**
- Produces: `window.PreviewText = { renderText(project, presets, timelineTime), setSelectedTextBlock(blockId, callbacks), getActiveFormatSelection(), setOnStageTextActivate(fn) }` and `window.PreviewCaptions = { renderCaptions(project, presets, timelineTime) }`. The public `window.Preview.*` API is **unchanged** — `preview.js` keeps thin delegating wrappers so no caller anywhere else changes.

- [ ] **Step 1: Create `preview-text.js`**

Move from `preview.js` into a new `window.PreviewText = (() => { ... })()` IIFE: the state `textProject, textPresets, selectedTextBlockId, boxResizeCallbacks, editingBlockId, editingDiv, onStageTextActivate, activeFormatSelection, fitCache`, the helpers `hexToRgba`, `fitCacheKey`, `maybeRefitFillText`, and the functions `renderText` (183–319, verbatim), `setOnStageTextActivate` (376–378), `setSelectedTextBlock` (380–385), `getActiveFormatSelection` (387–389). It grabs its own `overlay`/`stage` element refs at the top. `setSelectedTextBlock`'s re-render call becomes `renderText(textProject, textPresets, Preview.currentTimelineTime())` — the lazy runtime call to the `Preview` global replaces the internal `computeTimelineTime()` (fine: it only runs on user interaction, long after all scripts load). Return `{ renderText, setSelectedTextBlock, getActiveFormatSelection, setOnStageTextActivate }`.

- [ ] **Step 2: Create `preview-captions.js`**

Move `activeCaptionGroup` (321–324) and `renderCaptions` (326–374) into `window.PreviewCaptions = (() => { ... })()`. It needs its own copies of the tiny `hexToRgba` helper and an `overlay`/`stage` ref (4-line duplication beats a premature shared module). Return `{ renderCaptions }`.

- [ ] **Step 3: Slim `preview.js` to delegating wrappers**

`preview.js` keeps `textProject`/`textPresets` (still needed by `virtualTick`/`zeroClipDuration`) and replaces the moved bodies with:

```js
function renderText(project, presets, timelineTime) {
  textProject = project;
  textPresets = presets;
  PreviewText.renderText(project, presets, timelineTime);
}
function renderCaptions(project, presets, timelineTime) {
  PreviewCaptions.renderCaptions(project, presets, timelineTime);
}
function setSelectedTextBlock(blockId, callbacks) { PreviewText.setSelectedTextBlock(blockId, callbacks); }
function getActiveFormatSelection() { return PreviewText.getActiveFormatSelection(); }
function setOnStageTextActivate(fn) { PreviewText.setOnStageTextActivate(fn); }
```

The returned `Preview` object is unchanged. Delete the now-unused moved state/helpers from `preview.js` (`selectedTextBlockId`, `editingDiv`, `fitCache`, `hexToRgba`, etc. — everything Step 1/2 took). Update both files' header comments.

- [ ] **Step 4: Script tags** — `preview-text.js` and `preview-captions.js` immediately before `preview.js`.

- [ ] **Step 5: Verify**

`.venv/Scripts/python -m pytest -q` → green. `wc -l static/preview.js` → under 400. Browser: stage text renders, click-to-edit works, typing updates the block, captions preview renders (open a project that has captions or seed via console), rich-text drag-select still arms the FONT controls. No console errors.

- [ ] **Step 6: Update CLAUDE.md map. Commit** `refactor: extract preview-text.js + preview-captions.js from preview.js`

---

### Task 4: Truly empty new project — delete `seed.js`, fix the stale-video frame

**Files:**
- Delete: `static/seed.js`
- Modify: `static/editor.js` (`openProject`), `static/index.html` (script tag), `static/preview.js` (`load`), `CLAUDE.md`

- [ ] **Step 1: Delete `static/seed.js`** and its `<script src="/static/seed.js">` tag.

- [ ] **Step 2: Simplify `openProject`** in `editor.js` — remove the seed round-trip (current lines 31–33):

```js
async function openProject(target) {
  const res = await fetch(`/api/projects/${target.id}`);
  project = await res.json();
  localStorage.setItem("projectId", project.id);
  showEditorShell();
  ...
```

- [ ] **Step 3: Stale-video fix** in `preview.js`'s `load()` — the clipless branch already clears `src`/`preloadedIndex`; add `player.load()` so the painted frame actually blanks:

```js
    } else {
      player.removeAttribute("src");
      player.load();
      timeEl.textContent = "0.0";
    }
```

- [ ] **Step 4: Verify**

`.venv/Scripts/python -m pytest -q` → green. Browser: create a new project from the PROJECTS panel while a clip-bearing project is open → stage is black (no stale frame), CAPTIONS row and panel are empty, `project.captions === null`, `project.text_blocks` is `[]` (nothing auto-creates one yet — the TEXT panel will still lazily create until Task 5; that's acceptable mid-batch).

- [ ] **Step 5: Update CLAUDE.md (remove seed.js everywhere). Commit** `feat: new projects start truly empty; clear stale video frame on clipless load`

---

### Task 5: Multi-block core — `selectedTextBlockId`, `currentTextBlock()`, `addTextBlock()`, empty state, per-block selection

**Files:**
- Modify: `static/panel-text.js`, every `static/text-panel-*.js` (bulk rename), `static/editor.js` (`onTimelineSelect` text branch + stage-activate hook), `static/index.html` (empty-state markup + accordion wrapper), `static/css/components/style-panel.css` (if the empty state needs it), `CLAUDE.md`

**Interfaces:**
- Produces (globals in `panel-text.js`): `currentTextBlock() -> block | null` (selected block, falling back to the first block, never creating), `selectTextBlock(id)`, `addTextBlock() -> block` (creates + selects, does not render), `renderTextPanel()` (now empty-state aware). `ensureTextBlock` **ceases to exist** — grep must find zero references after this task.

- [ ] **Step 1: Replace `ensureTextBlock` in `panel-text.js`**

```js
let selectedTextBlockId = null;

// The TEXT panel's target block: the explicitly selected one, else the first block, else null.
// Never creates — creation is only ever explicit via addTextBlock() (+ buttons).
function currentTextBlock() {
  const blocks = project.text_blocks || [];
  const sel = blocks.find((b) => b.id === selectedTextBlockId);
  if (sel) return sel;
  selectedTextBlockId = blocks[0] ? blocks[0].id : null;
  return blocks[0] || null;
}

function selectTextBlock(id) { selectedTextBlockId = id; }

// Creates a new empty block (with its own preset) starting at the playhead and selects it.
function addTextBlock() {
  const start = Math.floor(Preview.currentTimelineTime() * 10) / 10;
  const block = {
    id: crypto.randomUUID().replaceAll("-", ""),
    heading: "", preset_id: crypto.randomUUID().replaceAll("-", ""),
    start, end: start + 3,
  };
  project.text_blocks.push(block);
  ensureTextPreset(block.preset_id);
  selectedTextBlockId = block.id;
  return block;
}
```

- [ ] **Step 2: Bulk-rename call sites**

In every `static/text-panel-*.js` file (font-family, font-style, font-weight, align, position, time, style), replace all `ensureTextBlock()` with `currentTextBlock()` (about 20 occurrences; simple textual replace — every call site runs only while the panel shows a block, so null can't reach them). Also rename inside `panel-text.js`'s own `renderBoxPanel` (line `ensureTextPreset(ensureTextBlock().preset_id)`).

- [ ] **Step 3: Empty state in `renderTextPanel`**

In `static/index.html`, wrap `#panel-text-main`'s accordion children (everything from `<div id="text-style-accordion">` through the end of the TIME body) in a new `<div id="text-accordions">`, and add above it:

```html
<div id="text-empty-state" class="style-group" hidden>
  <p class="context-panel-name col-8">No text yet.</p>
  <button id="text-add-block-btn" class="col-8" type="button">+ Add text</button>
</div>
```

`renderTextPanel` becomes:

```js
async function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-weight").hidden = true;
  document.getElementById("panel-text-style").hidden = true;
  document.getElementById("panel-text-main").hidden = false;

  const block = currentTextBlock();
  document.getElementById("text-empty-state").hidden = !!block;
  document.getElementById("text-accordions").hidden = !block;
  if (!block) {
    Preview.setSelectedTextBlock(null, null);
    renderTextPreview();
    return;
  }
  const preset = ensureTextPreset(block.preset_id);
  ... // unchanged from here (TextPanel.render* calls + Preview.setSelectedTextBlock(block.id, {...}))
}
```

Wire `#text-add-block-btn` (top level of `panel-text.js`): `document.getElementById("text-add-block-btn").addEventListener("click", () => addTextBlockAndEdit());` — `addTextBlockAndEdit` arrives in Task 6; for this task define it minimally without the enter-edit call:

```js
async function addTextBlockAndEdit() {
  const block = addTextBlock();
  selected = { type: "text", item: block };
  showPanel("text");
  await renderTextPanel();
  renderTimeline();
  await saveProject();
}
```

- [ ] **Step 4: Per-block selection from timeline + stage**

`editor.js` `onTimelineSelect`, text branch: add `selectTextBlock(item.id);` before `showPanel("text")`.

`editor.js` stage-activate hook — select the clicked block and always re-render (drop the early return):

```js
Preview.setOnStageTextActivate((blockId) => {
  selectTextBlock(blockId);
  openTextPanel();
});
```

- [ ] **Step 5: Verify**

`.venv/Scripts/python -m pytest -q` → green. `grep -rn "ensureTextBlock" static/` → zero hits. Browser (seed two blocks via console: `project.text_blocks.push({id:"b2...",heading:"SECOND",preset_id:"p2...",start:0,end:5}); ensureTextPreset("p2..."); saveProject(); renderTimeline()`): clicking each block in the timeline TEXT row targets the panel at that block (TIME start/end shows the right values); clicking each on the stage switches selection; styling one block doesn't touch the other; on a zero-block project the TEXT panel shows the empty state and "+ Add text" creates block #1.

- [ ] **Step 6: Update CLAUDE.md. Commit** `feat: multi-text-block selection + TEXT panel empty state (no auto-created block)`

---

### Task 6: Timeline + add buttons (VIDEO and TEXT rows) + enter-edit-on-create

**Files:**
- Modify: `static/timeline.js`, `static/editor.js` (`renderTimeline`, `nudgeTime`), `static/ui-text-interaction.js`, `static/preview-text.js`, `static/preview.js` (one wrapper), `static/panel-text.js` (`addTextBlockAndEdit`), `static/css/components/timeline.css`, `CLAUDE.md`

**Interfaces:**
- Consumes: `addClip()` (clip-sequence.js), `addTextBlockAndEdit()` (panel-text.js, Task 5).
- Produces: `Timeline.render(project, timelineTime, selected, onSelect, actions = {})` where `actions.onAddClip`/`actions.onAddText` render a + button on the VIDEO/TEXT row; `UI.textInteraction(...)` now returns `{ enterEditMode }`; `PreviewText.enterEditMode(blockId)` + wrapper `Preview.enterTextEditMode(blockId)`.

- [ ] **Step 1: + buttons in `timeline.js`**

Add a helper and call it from `render` (which gains the `actions = {}` 5th param):

```js
  // Small + button appended after a row's content (VIDEO: end of the clip sequence,
  // TEXT: after the last block). Only rendered when the caller passes the action.
  function addRowAddButton(track, left, label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-add-btn";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
    btn.style.left = `${left}px`;
    btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    track.appendChild(btn);
  }
```

After the VIDEO-row clip loop (where `acc` holds the sequence end): `if (actions.onAddClip) addRowAddButton(videoTrack, acc * PX_PER_SEC, "Add clip", actions.onAddClip);`

After the TEXT-row block loop: compute `const textEnd = (project.text_blocks || []).reduce((m, b) => Math.max(m, b.end), 0);` then `if (actions.onAddText) addRowAddButton(textTrack, textEnd * PX_PER_SEC, "Add text", actions.onAddText);`

- [ ] **Step 2: CSS** in `static/css/components/timeline.css`:

```css
/* + add button at the end of the VIDEO/TEXT row content */
.row-add-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 6px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  cursor: pointer;
}
.row-add-btn:hover {
  border-style: solid;
  border-color: var(--accent);
  color: var(--text);
}
```

- [ ] **Step 3: Pass actions from `editor.js`**

```js
function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect,
    { onAddClip: () => addClip(), onAddText: () => addTextBlockAndEdit() });
}
```

And route `nudgeTime` through it (so the buttons survive arrow-key nudges):

```js
function nudgeTime(delta) {
  const cur = parseFloat(document.getElementById("time").textContent) || 0;
  Preview.seek(Math.max(0, cur + delta));
  renderTimeline();
}
```

- [ ] **Step 4: Enter-edit plumbing**

`ui-text-interaction.js`: add `return { enterEditMode };` as the last line of `textInteraction` (additive — existing callers ignore the return).

`preview-text.js`: keep a `const interactionHandles = new Map();` cleared at the top of `renderText` (`interactionHandles.clear()`), store `interactionHandles.set(block.id, UI.textInteraction(div, {...}))` at the existing mount site, and expose:

```js
  function enterEditMode(blockId) {
    const h = interactionHandles.get(blockId);
    if (h) h.enterEditMode();
  }
```

(add it to the returned object). `preview.js`: expose the wrapper `enterTextEditMode(blockId) { PreviewText.enterEditMode(blockId); }` on the returned `Preview` object.

`panel-text.js`'s `addTextBlockAndEdit` gains the final line before `saveProject()`: `Preview.enterTextEditMode(block.id);`

- [ ] **Step 5: Verify**

`.venv/Scripts/python -m pytest -q` → green. Browser: VIDEO row shows a + at the end of the sequence (and at x=0 on an empty project) that opens the native file picker (cancel is fine — can't automate the picker); TEXT + creates a block at the playhead, opens the TEXT panel, and the caret is live on the stage (typing immediately mutates `block.heading`); every + click adds another block; buttons still present after arrow-key nudge and after scrubbing.

- [ ] **Step 6: Update CLAUDE.md. Commit** `feat: timeline + add buttons (VIDEO/TEXT) with enter-edit-on-create`

---

### Task 7: Delete text block — panel button + Delete key

**Files:**
- Modify: `static/panel-text.js`, `static/editor.js` (keydown), `static/index.html` (button markup), `static/css/components/style-panel.css`, `CLAUDE.md`

**Interfaces:**
- Consumes: `currentTextBlock()`, `selectTextBlock` (Task 5).
- Produces: global `deleteSelectedTextBlock()` in `panel-text.js`.

- [ ] **Step 1: Markup** — inside `#text-accordions` (so it hides with the empty state), after the TIME accordion body:

```html
<div class="style-group">
  <button id="text-delete" class="col-8" type="button">Delete text</button>
</div>
```

CSS: extend the existing danger rule — change the `#video-delete` selector in `style-panel.css` to `#video-delete, #text-delete`.

- [ ] **Step 2: `deleteSelectedTextBlock` in `panel-text.js`**

```js
// Removes the selected block and its preset. The panel then auto-targets the first remaining
// block (currentTextBlock's fallback), or shows the empty state when none are left.
async function deleteSelectedTextBlock() {
  const block = currentTextBlock();
  if (!block) return;
  project.text_blocks = project.text_blocks.filter((b) => b.id !== block.id);
  delete project.text_presets[block.preset_id];
  selectedTextBlockId = null;
  await saveProject();
  await renderTextPanel();
  renderTimeline();
}
```

Wire at top level: `document.getElementById("text-delete").addEventListener("click", () => deleteSelectedTextBlock());`

- [ ] **Step 3: Delete key** — in `editor.js`'s keydown handler add before the video branch's `else`:

```js
  else if (e.key === "Delete" && selected && selected.type === "text") { e.preventDefault(); deleteSelectedTextBlock(); }
```

(The handler's existing first-line guard already skips inputs/contentEditable, so deleting while typing in a block is impossible.)

- [ ] **Step 4: Verify**

`.venv/Scripts/python -m pytest -q` → green. Browser: with two blocks, delete one → the other survives and becomes the panel target, its preset intact, the deleted block's preset gone from `project.text_presets`; delete the last → empty state; Delete key works when a timeline TEXT block is selected and does nothing while editing text on the stage or focused in a number field.

- [ ] **Step 5: Update CLAUDE.md. Commit** `feat: delete text block (panel button + Delete key)`

---

### Task 8: Multi-block export test + whole-item verification

**Files:**
- Modify: `tests/test_ass_render.py` (only if the case is missing), `CLAUDE.md`, `docs/superpowers/backlog.md`

- [ ] **Step 1: Check test coverage** — `tests/test_ass_render.py` has a two-block test around line 218, but it exercises the `text_blocks=` filter param. If no test asserts that a plain `render_ass(p, presets)` with two blocks emits **both** Dialogue lines, add:

```python
def test_render_ass_two_blocks_both_render():
    pr1 = TextPreset(name="a")
    pr2 = TextPreset(name="b")
    b1 = TextBlockLayer(heading="FIRST", preset_id=pr1.id, start=0, end=2)
    b2 = TextBlockLayer(heading="SECOND", preset_id=pr2.id, start=2, end=4)
    p = Project(name="r", text_blocks=[b1, b2])
    out = render_ass(p, {pr1.id: pr1, pr2.id: pr2})
    assert "FIRST" in out and "SECOND" in out
```

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -q` → green, then the full suite.

- [ ] **Step 2: Full manual checklist (live browser, single pass)**

1. New project via the picker → stage black, all timeline rows empty, `project.captions === null`, `text_blocks: []`, TEXT panel shows empty state.
2. Switch from a clip-bearing project to the empty one via PROJECTS → no stale frame.
3. TEXT + adds a block, caret live, type "HELLO" → persists. Second + click adds another; both render; each independently selectable/stylable from stage and timeline.
4. VIDEO + opens the picker (cancel).
5. Delete one block (button), delete the other (Delete key) → empty state.
6. Zero console errors throughout.

(Any step whose UI can't be automated: seed state via the JS console — but never against a real saved project's data; create a throwaway project first.)

- [ ] **Step 3: Update `docs/superpowers/backlog.md`** — move the item to Done with a summary of what was actually built (including the two extraction prerequisites and any live corrections).

- [ ] **Step 4: Commit** `docs: record empty-project + multi-text-block item in backlog`

---

## Self-review notes

- Spec coverage: seed removal (T4), stale video (T4), no auto-create + empty state (T5), VIDEO + (T6), TEXT + multi-add (T6), multi-block selection/panel targeting (T5), delete (T7), tests/visual checkpoint (T8). Out-of-scope items (CAPTIONS +, z-order UI, copy/duplicate) untouched.
- Type consistency: `currentTextBlock`/`selectTextBlock`/`addTextBlock`/`addTextBlockAndEdit`/`deleteSelectedTextBlock` names match across Tasks 5–7; `PreviewText.enterEditMode` + `Preview.enterTextEditMode` wrapper fixed to one naming (Task 6 Step 4).
- Deviation from the design doc, stated: deleting a block auto-targets the first remaining block instead of leaving nothing selected (falls out of `currentTextBlock()`'s fallback; better UX, same safety). New blocks start at the playhead, not at 0 (a block created at t=5 with start=0 wouldn't be visible/editable on the stage).
