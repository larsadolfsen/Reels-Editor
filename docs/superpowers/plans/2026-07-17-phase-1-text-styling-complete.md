# Phase 1 — Text Styling Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish every whole-block text-styling feature for a text block before rich-text (per-selection) formatting starts in Phase 2: close out the existing Text Box plan's docs, restructure the TEXT panel into five accordions (FONT, STYLE, BOX, POSITION, TIME), add a saved-style-preset library, replace the side-panel heading textarea with inline on-stage editing, and add drag-to-reposition for the box.

**Architecture:** No new backend concepts beyond a small global preset library (`GET/POST /api/presets`, already partially built in `app/store.py`) and a `usage_count` field on `TextPreset`. Everything else is UI reorganization (`static/index.html`/`static/editor.js`) plus two new stage interactions (inline editing, drag) in `static/preview.js`, following the same callback-object pattern `preview.js`/`editor.js` already use for resize (`Preview.setSelectedTextBlock(blockId, callbacks)`).

**Tech Stack:** Same as the rest of the project — FastAPI/Pydantic backend, vanilla JS frontend (`window.UI.*`/`window.Api.*`), no build step.

**Spec:** `docs/superpowers/specs/2026-07-17-phase-1-text-styling-complete-design.md` — read it first.

## Global Constraints

- One function/component per file under `static/ui-*.js`/`static/api-*.js`, each attached to `window.UI.*`/`window.Api.*` (per `CLAUDE.md`).
- Every `static/*.js` and `static/css/**/*.css` file opens with a one-or-two-line purpose comment (per `CLAUDE.md`).
- Icon SVGs use the existing wrapper style: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- Support both `data-theme="dark"` (default) and `data-theme="light"` via `tokens.css` custom properties, never hardcoded colors.
- `app/main.py` stays wiring-only — no feature logic there (per `CLAUDE.md`).
- UI JS is a stated untested layer: keep it thin, verify manually via each task's "manual verification" step, matching this codebase's existing convention (see the Text Box plan).
- Every task: tests pass (`pytest -q`), commit on the current branch, update `CLAUDE.md` where the task changes something documented there.

---

### Task 1: Finish the existing Text Box plan's documentation debt

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (documentation only) — but Task 6 below points at this task's updated Inventory bullets when it documents the new preset library.

- [ ] **Step 1: Apply Task 12 of the existing Text Box plan**

Follow `docs/superpowers/plans/2026-07-17-text-box.md`, Task 12, Steps 1–5 verbatim — it was written but never executed (the plan's own Task 13 note confirms Tasks 1–11 shipped without it). That task adds `app/font_metrics.py` to the file tree/Inventory, updates the `app/models.py`/`app/ass_render.py`/`static/preview.js`/`static/editor.js` Inventory bullets for the Box fields, and adds `static/ui-resize-handles.js`/`static/css/components/resize-handles.css` to the file tree/Inventory.

- [ ] **Step 2: Add the still-missing icon-rail and button component files**

`CLAUDE.md`'s file tree and Inventory predate the MEDIA/TEXT/CAPTIONS icon-rail navigation (`static/ui-icon-rail.js`) and the generic button component (`static/ui-button.js`), both already shipped and referenced in `static/index.html`'s script tags. Add to the file tree (under `static/`, alongside the other `ui-*.js` entries):

```
  ui-icon-rail.js         # left-panel icon rail (FILES/TEXT/CAPTIONS nav), single-select
  ui-button.js             # generic button variant styling (icon/outline/accent) applied to existing <button> elements
```

Add two Inventory bullets after the `static/ui-components.js` bullet:

```
- `static/ui-icon-rail.js` — `window.UI.iconRail(container, items, activeValue, onSelect)`: renders a vertical icon+label rail, single-select, used for the left panel's FILES/TEXT/CAPTIONS nav (`#panel-nav`).
- `static/ui-button.js` — `window.UI.button(el, {variant})`: applies `icon`/`outline`/`accent` variant classes to an existing `<button>` element (no new markup, just styling hooks) — used for the theme toggle, safe-zones toggle, and export button.
```

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (docs-only change, no test impact).

```bash
git add CLAUDE.md
git commit -m "docs: finish Text Box plan's Task 12, document icon-rail/button components"
```

---

### Task 2: Backend — saved-style preset library (`usage_count` field + routes)

**Files:**
- Modify: `app/models.py`, `app/main.py`
- Test: `tests/test_models.py`, `tests/test_main.py`

**Interfaces:**
- Consumes: `store.load_presets(data_dir) -> list[TextPreset]`, `store.save_preset(preset, data_dir) -> None` (already exist in `app/store.py`, unchanged).
- Produces: `TextPreset.usage_count: int` field; HTTP `GET /api/presets -> list[TextPreset]`, `POST /api/presets` (body = `TextPreset` JSON; same `id` updates) `-> TextPreset` — consumed by Task 6's `static/api-list-presets.js`/`static/api-save-preset.js`.

- [ ] **Step 1: Write the failing test for the model field**

Add to `tests/test_models.py`:

```python
def test_text_preset_usage_count_defaults_zero():
    p = TextPreset(name="Pop")
    assert p.usage_count == 0

def test_text_preset_usage_count_round_trips():
    p = TextPreset(name="Pop", usage_count=7)
    assert TextPreset.model_validate_json(p.model_dump_json()).usage_count == 7
```

- [ ] **Step 2: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: FAIL — `usage_count` is not a valid field.

- [ ] **Step 3: Add the field**

In `app/models.py`, in `TextPreset`, add after `offset_y: int = 0`:

```python
    usage_count: int = 0    # how many times this saved preset has been applied to a block; drives the STYLE accordion's "most used" list
```

- [ ] **Step 4: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the routes**

Add to `tests/test_main.py`:

```python
from app.main import list_presets, create_preset

def test_create_and_list_presets(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = TextPreset(name="Pop")
    result = create_preset(p)
    assert result == p
    assert list_presets() == [p]

def test_create_preset_same_id_updates(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = TextPreset(name="Pop")
    create_preset(p)
    p.usage_count = 3
    create_preset(p)
    result = list_presets()
    assert len(result) == 1
    assert result[0].usage_count == 3
```

- [ ] **Step 6: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: FAIL — `list_presets`/`create_preset` don't exist in `app.main`.

- [ ] **Step 7: Add the routes**

In `app/main.py`, add the import and routes. Change:

```python
from app.models import Project
```

to:

```python
from app.models import Project, TextPreset
```

Add after the `probe`/`pick_file` routes (wiring only, per the file's composition-root rule):

```python
@app.get("/api/presets")
def list_presets() -> list[TextPreset]:
    return store.load_presets(DATA_DIR)

@app.post("/api/presets")
def create_preset(preset: TextPreset) -> TextPreset:
    store.save_preset(preset, DATA_DIR)
    return preset
```

- [ ] **Step 8: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all PASS.

- [ ] **Step 9: Update `CLAUDE.md`**

In the `app/main.py` Inventory bullet, append `, GET/POST /api/presets` to the routes list.
In the `app/models.py` Inventory bullet's `TextPreset` clause, append `; usage_count: int = 0 (drives the STYLE accordion's most-used list, added 2026-07-17)`.

- [ ] **Step 10: Commit**

```bash
git add app/models.py app/main.py tests/test_models.py tests/test_main.py CLAUDE.md
git commit -m "feat: saved-style preset library — usage_count field + GET/POST /api/presets"
```

---

### Task 3: FONT accordion consolidation

**Files:**
- Modify: `static/index.html`, `static/editor.js`

**Interfaces:**
- Consumes: `UI.numberField`, `UI.colorSwatch` (both pre-existing).
- Produces: nothing new exported — moves existing markup/wiring, no new functions.

- [ ] **Step 1: Move the SIZE/style/color/outline markup from MISC into FONT**

In `static/index.html`, inside `#text-font-body`, after the existing `<div class="style-group"><div id="text-font-row"></div></div>` block and before the closing `</div>` of `#text-font-body`, insert:

```html
          <div id="text-font-family-style-divider"></div>

          <div class="style-group">
            <div class="style-row">
              <label id="text-size-field"></label>
            </div>
          </div>

          <div class="style-group">
            <div class="style-row">
              <button class="icon-btn" id="text-bold" type="button" aria-pressed="false" title="Bold">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>
              </button>
              <button class="icon-btn" id="text-italic" type="button" aria-pressed="false" title="Italic">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
              </button>
              <button class="icon-btn" id="text-underline" type="button" aria-pressed="false" title="Underline">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
              </button>
            </div>
          </div>

          <div class="style-group">
            <label id="text-color-field"></label>
          </div>

          <div class="style-group">
            <label id="text-outline-color-field"></label>
          </div>

          <div class="style-group">
            <label id="text-outline-px-field"></label>
          </div>
```

Then delete that exact same block (STYLE label + SIZE field + bold/italic/underline buttons + color/outline-color/outline-px fields) from `#text-misc-body`, i.e. everything from the `<div class="style-group-label">STYLE</div>` line through the `<label id="text-outline-px-field"></label>` field's closing `</div>`, along with the `<div id="text-style-divider"></div>` immediately above it (the divider moves with the content — Step 1 above already added its own divider inside FONT).

- [ ] **Step 2: Update the divider wiring in `editor.js`**

In `static/editor.js`, change:

```js
UI.divider(document.getElementById("text-style-divider"));
```

to:

```js
UI.divider(document.getElementById("text-font-family-style-divider"));
```

(The other `UI.divider(...)` calls for `text-align-divider`, `text-box-width-height-divider`, `text-box-background-border-divider`, `video-order-divider` are untouched.)

- [ ] **Step 3: Manual verification**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000`, select the text block, expand FONT. Confirm: font-family row, then a divider, then SIZE/Bold/Italic/Underline/Color/Outline/Outline-width controls, all functioning exactly as before (change size, toggle bold, pick a color — canvas updates live). Confirm MISC no longer shows STYLE fields.

- [ ] **Step 4: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched).

```bash
git add static/index.html static/editor.js
git commit -m "refactor: consolidate SIZE/style/color/outline controls into the FONT accordion"
```

---

### Task 4: POSITION accordion extraction

**Files:**
- Modify: `static/index.html`, `static/editor.js`

**Interfaces:**
- Consumes: `UI.accordionSection`, `UI.buttonGroup`, `UI.numberField`, `UI.divider` (all pre-existing).
- Produces: `#text-position-accordion`/`#text-position-body` (new accordion, wired the same way as `#text-box-accordion`).

- [ ] **Step 1: Add the POSITION accordion markup**

In `static/index.html`, immediately after the closing `</div>` of `#text-box-accordion`'s wrapper and before `<div id="text-misc-accordion">`, insert:

```html
        <div id="text-position-accordion"></div>
        <div id="text-position-body">

          <div class="style-group-label">TEXT ALIGN</div>
          <div class="style-group">
            <div id="text-align-group"></div>
          </div>

          <div class="style-group-label">POSITION</div>
          <div class="style-group">
            <div id="position-row-group"></div>
            <div id="position-col-group"></div>
          </div>

          <div class="style-group">
            <div class="style-row">
              <label id="text-offset-x-field"></label>
              <label id="text-offset-y-field"></label>
            </div>
          </div>

        </div>
```

- [ ] **Step 2: Remove that content from MISC**

In the same file, delete from `#text-misc-body`: the `<div id="text-align-divider"></div>` line, the `TEXT ALIGN` style-group-label + `#text-align-group` block, the `POSITION` style-group-label + `#position-row-group`/`#position-col-group` block, and the offset-X/offset-Y field row. (What remains in `#text-misc-body` after this task is just the TIME block — removed in Task 5.)

- [ ] **Step 3: Wire the new accordion in `editor.js`**

In `static/editor.js`, add alongside the existing `UI.accordionSection(...)` calls:

```js
UI.accordionSection(document.getElementById("text-position-accordion"), document.getElementById("text-position-body"), { title: "POSITION", expanded: false });
```

The `text-align-divider` `UI.divider(...)` call is now unused (its element was deleted in Step 2) — delete that line too:

```js
UI.divider(document.getElementById("text-align-divider"));
```

- [ ] **Step 4: Manual verification**

Reload, select the text block, collapse FONT/BOX, expand POSITION. Confirm TEXT ALIGN + the anchor grid + OFFSET H/V all render and function as before (dragging offsets moves the text on the canvas).

- [ ] **Step 5: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

```bash
git add static/index.html static/editor.js
git commit -m "refactor: extract POSITION into its own accordion"
```

---

### Task 5: TIME accordion extraction + remove MISC

**Files:**
- Modify: `static/index.html`, `static/editor.js`

**Interfaces:**
- Consumes: `UI.accordionSection`, `UI.numberField` (pre-existing).
- Produces: `#text-time-accordion`/`#text-time-body`. Removes `#text-misc-accordion`/`#text-misc-body` entirely (empty after this task).

- [ ] **Step 1: Add the TIME accordion markup, remove MISC's wrapper**

In `static/index.html`, replace the entire `<div id="text-misc-accordion">...</div>` block (now containing only the TIME group after Tasks 3–4) with:

```html
        <div id="text-time-accordion"></div>
        <div id="text-time-body">
          <div class="style-group">
            <div class="style-row">
              <label id="text-start-field"></label>
              <label id="text-end-field"></label>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Update the accordion wiring in `editor.js`**

In `static/editor.js`, replace:

```js
UI.accordionSection(document.getElementById("text-misc-accordion"), document.getElementById("text-misc-body"), { title: "MISC", expanded: false });
```

with:

```js
UI.accordionSection(document.getElementById("text-time-accordion"), document.getElementById("text-time-body"), { title: "TIME", expanded: false });
```

- [ ] **Step 3: Manual verification**

Reload, select the text block. Confirm the TEXT panel now shows four accordions in order: FONT, BOX, POSITION, TIME (STYLE is added in Task 6, landing between FONT and BOX — verified at the end of that task). Expand TIME, confirm START/END still work.

- [ ] **Step 4: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

```bash
git add static/index.html static/editor.js
git commit -m "refactor: extract TIME into its own accordion, remove the MISC catch-all"
```

---

### Task 6: STYLE accordion — saved-preset library UI

**Files:**
- Create: `static/api-list-presets.js`, `static/api-save-preset.js`
- Modify: `static/index.html`, `static/editor.js`, `CLAUDE.md`

**Interfaces:**
- Consumes: `GET/POST /api/presets` (Task 2), `UI.settingsRow`, `UI.subPanelHeader` (pre-existing), the existing `.font-list`/`.font-list-row`/`.font-list-row-name` CSS classes from `static/css/components/sub-panel.css` (reused as-is — already generic despite the "font" name).
- Produces: `window.Api.listPresets() -> Promise<TextPreset[]>`, `window.Api.savePreset(preset) -> Promise<TextPreset>`; `#text-style-accordion`/`#text-style-body`, `#panel-text-style` drill-down — no other task depends on these directly, but Phase 3 (Captions) reuses this same pattern against a different preset.

- [ ] **Step 1: `static/api-list-presets.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the data.
window.Api = window.Api || {};

// Fetches every saved TextPreset from the server's global preset library.
window.Api.listPresets = async function listPresets() {
  const res = await fetch("/api/presets");
  return res.json();
};
```

- [ ] **Step 2: `static/api-save-preset.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the data.
window.Api = window.Api || {};

// Saves `preset` to the server's global preset library (same id updates, new id creates).
window.Api.savePreset = async function savePreset(preset) {
  const res = await fetch("/api/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  });
  return res.json();
};
```

- [ ] **Step 3: Add the STYLE accordion + drill-down markup**

In `static/index.html`, insert between `#text-font-accordion`'s wrapper and `#text-box-accordion`'s wrapper:

```html
        <div id="text-style-accordion"></div>
        <div id="text-style-body">
          <div class="style-group">
            <button id="text-style-save" type="button">+ Save current style</button>
          </div>
          <div class="style-group">
            <ul id="text-style-most-used" class="font-list"></ul>
          </div>
          <div class="style-group">
            <div id="text-style-browse-row"></div>
          </div>
        </div>
```

Add the drill-down subpanel as a sibling of `#panel-text-font`, inside `#panel-text` (after `#panel-text-font`'s closing `</div>`):

```html
        <div id="panel-text-style" hidden>
          <div id="text-style-subpanel-header"></div>
          <ul id="text-style-list" class="font-list"></ul>
        </div>
```

Add the two new script tags after `<script src="/static/api-save-project.js"></script>`:

```html
<script src="/static/api-list-presets.js"></script>
<script src="/static/api-save-preset.js"></script>
```

- [ ] **Step 4: Wire the STYLE accordion in `editor.js`**

Add near the other module-level state at the top of `static/editor.js` (after `let fontRowSetValue = null;`):

```js
let savedPresets = []; // the global preset library, fetched once on load and refreshed after every save/apply
```

Add these functions after `renderBoxPanel()`:

```js
// Fields copied when saving/applying a saved style — everything TextPreset holds except
// identity (id/name), stage placement (x/y/pos_row/pos_col/offset_x/offset_y), and usage stats.
function styleFieldsOf(preset) {
  const { font, size_px, color, outline_color, outline_px, bold, italic, underline,
    box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
    box_border_width, box_border_color, box_border_radius, align, entrance } = preset;
  return { font, size_px, color, outline_color, outline_px, bold, italic, underline,
    box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
    box_border_width, box_border_color, box_border_radius, align, entrance };
}

async function loadSavedPresets() {
  savedPresets = await Api.listPresets();
}

async function saveCurrentStyleAsPreset() {
  const name = prompt("Name this style:");
  if (!name) return;
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
  await Api.savePreset(saved);
  await loadSavedPresets();
  renderStylePanel();
}

async function applySavedPreset(saved) {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  Object.assign(preset, styleFieldsOf(saved));
  saved.usage_count = (saved.usage_count || 0) + 1;
  await Api.savePreset(saved);
  await saveProject();
  await loadSavedPresets();
  renderTextPanel();
  closeStylePanel();
}

function renderStyleListRow(saved) {
  const li = document.createElement("li");
  li.className = "font-list-row";
  li.addEventListener("click", () => applySavedPreset(saved));
  const nameEl = document.createElement("span");
  nameEl.className = "font-list-row-name";
  nameEl.textContent = saved.name;
  li.appendChild(nameEl);
  return li;
}

function renderStylePanel() {
  const mostUsed = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 3);
  const listEl = document.getElementById("text-style-most-used");
  listEl.innerHTML = "";
  mostUsed.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));

  UI.settingsRow(document.getElementById("text-style-browse-row"), {
    label: "Browse all styles", value: String(savedPresets.length), onClick: openStylePanel,
  });
}

function openStylePanel() {
  renderStyleList();
  document.getElementById("panel-text-main").hidden = true;
  document.getElementById("panel-text-style").hidden = false;
}

function closeStylePanel() {
  document.getElementById("panel-text-style").hidden = true;
  document.getElementById("panel-text-main").hidden = false;
}

function renderStyleList() {
  const listEl = document.getElementById("text-style-list");
  listEl.innerHTML = "";
  const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  sorted.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));
}

UI.subPanelHeader(document.getElementById("text-style-subpanel-header"), { title: "Saved Styles", onBack: closeStylePanel });
document.getElementById("text-style-save").addEventListener("click", saveCurrentStyleAsPreset);
UI.accordionSection(document.getElementById("text-style-accordion"), document.getElementById("text-style-body"), { title: "STYLE", expanded: false });
```

In `renderTextPanel()`, add a call to `renderStylePanel()` right after `renderFontRow();`:

```js
  renderFontRow();
  renderStylePanel();
  renderBoxPanel();
```

Also reset the STYLE drill-down when re-entering the TEXT panel, at the top of `renderTextPanel()` alongside the existing font-panel reset:

```js
function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-style").hidden = true;
  document.getElementById("panel-text-main").hidden = false;
```

Finally, load the preset library once on startup. In the closing `(async () => { ... })()` IIFE at the bottom of the file, add `await loadSavedPresets();` right before `renderTextPanel();`:

```js
  renderMediaList();
  Preview.load(project);
  await loadSavedPresets();
  renderTextPanel();
```

- [ ] **Step 5: Manual verification**

Reload, select the text block, expand STYLE. Confirm: "+ Save current style" prompts for a name and, after entering one, the style appears in the "most used" list and the drill-down (click "Browse all styles"). Style a second text block differently, apply the saved style to it, confirm its appearance changes to match. Restart the server (`Ctrl+C`, re-run `uvicorn`), reload, confirm the saved style is still there. Confirm the five accordions now appear in the order FONT, STYLE, BOX, POSITION, TIME.

- [ ] **Step 6: Update `CLAUDE.md`**

Add to the file tree under `static/`:

```
  api-list-presets.js     # GET /api/presets -> saved TextPreset[]
  api-save-preset.js      # POST /api/presets -> saves/updates a saved TextPreset
```

Add two Inventory bullets after the `static/api-save-project.js`-adjacent entries (or alongside the other `api-*.js` bullets if grouped): document `Api.listPresets()`/`Api.savePreset(preset)`. Update the `static/editor.js` Inventory bullet to mention `renderStylePanel()`/`saveCurrentStyleAsPreset()`/`applySavedPreset()` (the STYLE accordion: a global preset library, distinct from `project.text_presets` which holds each block's live working style).

- [ ] **Step 7: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched by this task).

```bash
git add static/api-list-presets.js static/api-save-preset.js static/index.html static/editor.js CLAUDE.md
git commit -m "feat: STYLE accordion — saved style presets (save-as-new, most-used list, browse-all drill-down)"
```

---

### Task 7: Inline stage text editing

**Files:**
- Modify: `static/index.html`, `static/preview.js`, `static/editor.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: extends `Preview.setSelectedTextBlock(blockId, callbacks)`'s `callbacks` shape with `onEdit(heading)`/`onEditEnd(heading)`, alongside the existing `onResize`/`onDragEnd` — consumed by Task 8 (drag) which extends this same callbacks object further.

- [ ] **Step 1: Remove the side-panel heading textarea**

In `static/index.html`, delete:

```html
        <div class="style-group">
          <textarea id="text-heading" placeholder="Heading" rows="3"></textarea>
        </div>
```

- [ ] **Step 2: Make the selected text block editable in `preview.js`**

In `static/preview.js`, add module-level state after `let boxResizeCallbacks = null;`:

```js
  let editingBlockId = null;
  let editingDiv = null;
```

Rename `boxResizeCallbacks` references to a more general `activeCallbacks` name is unnecessary — instead, extend what's already passed through it. Replace:

```js
  function renderText(project, presets, timelineTime) {
    textProject = project;
    textPresets = presets;
    overlay.innerHTML = "";
    let stageW = overlay.clientWidth || stage.clientWidth;
```

with:

```js
  function renderText(project, presets, timelineTime) {
    textProject = project;
    textPresets = presets;
    const keepEditingDiv = editingDiv && overlay.contains(editingDiv);
    overlay.innerHTML = "";
    if (keepEditingDiv) overlay.appendChild(editingDiv); // preserve focus/caret across re-renders while typing
    let stageW = overlay.clientWidth || stage.clientWidth;
```

In the `for (const block of ...)` loop, right after the existing `if (!preset) continue;` line, add:

```js
      if (keepEditingDiv && block.id === editingBlockId) continue; // already re-attached above, leave untouched
```

At the end of the loop body, replace:

```js
      if (block.id === selectedTextBlockId && boxResizeCallbacks) {
        div.style.pointerEvents = "auto";
        UI.resizeHandles(div, {
          getSize: () => ({ width: div.offsetWidth, height: div.offsetHeight }),
          onResize: (size) => boxResizeCallbacks.onResize(size),
          onDragEnd: (size) => boxResizeCallbacks.onDragEnd(size),
        });
      }
```

with:

```js
      if (block.id === selectedTextBlockId) {
        div.style.pointerEvents = "auto";
        div.addEventListener("click", () => enterEditMode(block, div));
        if (boxResizeCallbacks) {
          UI.resizeHandles(div, {
            getSize: () => ({ width: div.offsetWidth, height: div.offsetHeight }),
            onResize: (size) => boxResizeCallbacks.onResize(size),
            onDragEnd: (size) => boxResizeCallbacks.onDragEnd(size),
          });
        }
      }
```

Add `enterEditMode` as a new function (near `setSelectedTextBlock`):

```js
  function enterEditMode(block, div) {
    if (editingDiv === div) return;
    editingBlockId = block.id;
    editingDiv = div;
    div.contentEditable = "true";
    div.focus();
    const onInput = () => {
      block.heading = div.textContent;
      if (boxResizeCallbacks && boxResizeCallbacks.onEdit) boxResizeCallbacks.onEdit(block.heading);
    };
    const onBlur = () => {
      div.removeEventListener("input", onInput);
      div.removeEventListener("blur", onBlur);
      div.contentEditable = "false";
      editingBlockId = null;
      editingDiv = null;
      if (boxResizeCallbacks && boxResizeCallbacks.onEditEnd) boxResizeCallbacks.onEditEnd(block.heading);
    };
    div.addEventListener("input", onInput);
    div.addEventListener("blur", onBlur);
  }
```

- [ ] **Step 3: Wire the callbacks and remove the textarea's JS in `editor.js`**

In `static/editor.js`, delete the `updateTextBlock` function entirely:

```js
async function updateTextBlock() {
  const block = ensureTextBlock();
  block.heading = document.getElementById("text-heading").value;
  await saveProject();
  renderTextPreview();
}
```

Delete its listener registration:

```js
document.getElementById("text-heading").addEventListener("input", updateTextBlock);
```

In `renderTextPanel()`, delete the line that reads the old textarea's value:

```js
  document.getElementById("text-heading").value = block.heading;
```

In `renderTextPanel()`, extend the `Preview.setSelectedTextBlock(...)` call at the bottom with the new edit callbacks:

```js
  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
    onEdit: (heading) => { block.heading = heading; },
    onEditEnd: async (heading) => { block.heading = heading; await saveProject(); },
  });
```

Remove the two remaining `document.getElementById("text-heading").focus();` calls (in `onTimelineSelect`'s `text` branch and in `openTextPanel()`) — there's no side-panel field left to focus; the user clicks the block on the stage to start editing.

- [ ] **Step 4: Manual verification**

Reload, select the text block. Confirm there's no heading textarea in the side panel. Click the heading text on the stage — confirm a text cursor appears and you can type; confirm the heading updates live as you type. Click elsewhere (blur) — confirm the change persists after a page reload. Confirm playback (`timeupdate`-driven re-renders) doesn't kick you out of edit mode or lose your cursor position while you're mid-edit and the block is still within its `start`/`end` window.

- [ ] **Step 5: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched).

```bash
git add static/index.html static/preview.js static/editor.js
git commit -m "feat: inline stage text editing, replacing the side-panel heading textarea"
```

---

### Task 8: Drag-to-reposition the box body

**Files:**
- Modify: `static/preview.js`, `static/editor.js`

**Interfaces:**
- Consumes: `boxResizeCallbacks` shape from Task 7 (extends it with `onMove`/`onMoveEnd`).
- Produces: nothing new exported — extends existing stage interaction.

- [ ] **Step 1: Replace the plain click listener with a click-vs-drag mousedown handler**

In `static/preview.js`, replace the line added in Task 7:

```js
        div.addEventListener("click", () => enterEditMode(block, div));
```

with:

```js
        div.addEventListener("mousedown", (e) => {
          if (e.target.closest(".resize-handle")) return; // let resize handles work unmodified
          e.preventDefault();
          const startX = e.clientX, startY = e.clientY;
          let moved = false;
          const onMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
            if (!moved && Math.hypot(dx, dy) > 4) moved = true;
            if (moved && boxResizeCallbacks && boxResizeCallbacks.onMove) boxResizeCallbacks.onMove({ dx, dy });
          };
          const onUp = (upEvent) => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            if (moved) {
              const dx = upEvent.clientX - startX, dy = upEvent.clientY - startY;
              if (boxResizeCallbacks && boxResizeCallbacks.onMoveEnd) boxResizeCallbacks.onMoveEnd({ dx, dy });
            } else {
              enterEditMode(block, div);
            }
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
```

- [ ] **Step 2: Add the move handlers in `editor.js`**

Add after `handleBoxResizeEnd`:

```js
function nearestAnchorKey(value, anchors) {
  return Object.keys(anchors).reduce((best, key) =>
    Math.abs(value - anchors[key]) < Math.abs(value - anchors[best]) ? key : best);
}

// Recomputes pos_row/pos_col from the preset's current x/y (after a free-pixel drag), then
// rebases offset_x/offset_y to the remaining distance from that anchor cell — keeps the
// anchor-grid model meaningful after a drag that isn't itself snapped.
function rebaseAnchorFromXY(preset) {
  preset.pos_row = nearestAnchorKey(preset.y, POSITION_ANCHORS_Y);
  preset.pos_col = nearestAnchorKey(preset.x, POSITION_ANCHORS_X);
  preset.offset_x = preset.x - POSITION_ANCHORS_X[preset.pos_col];
  preset.offset_y = preset.y - POSITION_ANCHORS_Y[preset.pos_row];
}

function handleBoxMove(preset, { dx, dy }) {
  const scale = stageScale();
  const previewPreset = { ...preset, offset_x: preset.offset_x + dx * scale, offset_y: preset.offset_y + dy * scale };
  computeXY(previewPreset);
  const previewPresets = { ...project.text_presets, [preset.id]: previewPreset };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
}

async function handleBoxMoveEnd(preset, { dx, dy }) {
  const scale = stageScale();
  preset.offset_x += dx * scale;
  preset.offset_y += dy * scale;
  computeXY(preset);
  rebaseAnchorFromXY(preset);
  await saveProject();
  renderTextPanel();
}
```

Extend the `Preview.setSelectedTextBlock(...)` call in `renderTextPanel()` (from Task 7) with the new callbacks:

```js
  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
    onMove: (delta) => handleBoxMove(preset, delta),
    onMoveEnd: (delta) => handleBoxMoveEnd(preset, delta),
    onEdit: (heading) => { block.heading = heading; },
    onEditEnd: async (heading) => { block.heading = heading; await saveProject(); },
  });
```

- [ ] **Step 3: Manual verification**

Reload, select the text block. Click-and-drag the box body (not a resize handle, not just a click) — confirm it moves live with the cursor. Release — confirm the POSITION accordion's anchor grid and OFFSET H/V fields update to reflect the new position, and the position persists after a reload. Confirm a plain click (no drag) still enters edit mode (from Task 7) instead of moving the box. Confirm dragging a resize handle still resizes, not moves.

- [ ] **Step 4: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched).

```bash
git add static/preview.js static/editor.js
git commit -m "feat: drag-to-reposition the text box body on the stage"
```

---

### Task 9: End-to-end verification + finish the branch

- [ ] **Step 1: Full automated test pass**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all PASS.

- [ ] **Step 2: Full manual walkthrough**

With the dev server running, in the browser:
1. Confirm the TEXT panel shows exactly five accordions in order: FONT, STYLE, BOX, POSITION, TIME.
2. FONT: change family, size, bold/italic/underline, color, outline — all apply live.
3. STYLE: save the current look as a named preset, confirm it shows in the most-used list and the browse-all drill-down; apply a saved preset to a different block and confirm it takes effect; restart the server and confirm the preset persisted.
4. BOX: toggle background/border, resize via drag handles — confirm it still works exactly as before this phase (regression check, this phase didn't touch BOX's own logic).
5. POSITION: anchor grid + offsets still work.
6. TIME: start/end still work.
7. Click directly into the heading on the stage, edit the text, confirm it saves; confirm there's no side-panel textarea.
8. Drag the box body (not a resize handle) to reposition it; confirm a plain click still enters edit mode.
9. Click EXPORT, download the mp4, confirm it visually matches the preview for all of the above (font, saved-style-applied look, box, position, edited heading text).

- [ ] **Step 3: Update `CLAUDE.md`**

Update the `static/index.html`/`static/editor.js`/`static/preview.js` Inventory bullets to reflect the five-accordion TEXT panel structure (FONT/STYLE/BOX/POSITION/TIME, replacing the old FONT/MISC description), the removal of `#text-heading`, and the new stage-drag/edit interaction — in particular, the `static/css/components/style-panel.css` bullet's `#panel-text` description (currently still describes a `#text-heading` textarea and a MISC-bundled TIME/STYLE/TEXT ALIGN/POSITION section, both now stale).

- [ ] **Step 4: Run `superpowers:finishing-a-development-branch`**

Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate this work (merge, PR, or cleanup), now that all of this phase's tasks are complete and manually verified. This is the phase's visual/functional checkpoint — Phase 2 (rich-text formatting) does not start until this passes.
