# Phase 1 (Tasks 2+) — Parallel Task Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. This plan's tasks are grouped into parallel batches (see Execution Model) — within a batch, dispatch one worktree per task via superpowers:using-git-worktrees, run them concurrently, review each independently, then merge all of a batch's worktrees back before starting the next batch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the original plan's Tasks 2–9 (which had four tasks — FONT/POSITION/TIME/STYLE — all serializing through the same two shared files) with a decomposition where each `UI.*` component/service module is its own file, so independent tasks can run as true parallel subagents with zero shared-file conflicts.

**Architecture:** No new backend concepts beyond `GET/POST /api/presets` + `TextPreset.usage_count` (unchanged from the original plan). Everything else is: (1) two scaffolding tasks that restructure `index.html`/`editor.js` into stable mount points + an orchestrator, (2) six new `static/text-panel-*.js` component files, each owning one control's markup-independent wiring, (3) two new `static/api-*.js` service files, (4) a new `static/ui-text-interaction.js` mirroring `static/ui-resize-handles.js`'s existing pattern for stage interactions. No bundler, no module system — every script shares one global scope; components reach directly into `editor.js`'s already-established globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPreview()`, `computeXY()`, `project`, `Preview`), exactly like the existing `renderBoxPanel()`/`handleBoxResize()` already do.

**Tech Stack:** Same as the rest of the project — FastAPI/Pydantic backend, vanilla JS frontend (`window.UI.*`/`window.Api.*`/`window.TextPanel.*`), no build step.

**Spec:** `docs/superpowers/specs/2026-07-18-phase-1-parallel-decomposition-design.md` — read it first. Parent: `docs/superpowers/specs/2026-07-17-phase-1-text-styling-complete-design.md`.

## Global Constraints

- One function/component per file under `static/ui-*.js`/`static/api-*.js`/`static/text-panel-*.js`, each attached to `window.UI.*`/`window.Api.*`/`window.TextPanel.*` (per `CLAUDE.md`).
- Every `static/*.js` and `static/css/**/*.css` file opens with a one-or-two-line purpose comment (per `CLAUDE.md`).
- Icon SVGs use the existing wrapper style: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- Support both `data-theme="dark"` (default) and `data-theme="light"` via `tokens.css` custom properties, never hardcoded colors. (No new CSS in this plan — all new markup reuses existing `.style-group`/`.style-field`/`.font-list` classes.)
- `app/main.py` stays wiring-only — no feature logic there (per `CLAUDE.md`).
- UI JS is a stated untested layer: keep it thin, verify manually via each task's "manual verification" step, matching this codebase's existing convention.
- Every task: tests pass (`pytest -q`), commit on the current branch, update `CLAUDE.md` where the task changes something documented there.
- Task 1 (`CLAUDE.md` docs debt) is already complete — this plan starts at Task 2.

## Execution Model (informs dispatch, not task content)

- **Batch 1 (4 tasks, parallel):** Task 2 (backend routes), Task 2b-html (index.html scaffolding), Task 2b-js (editor.js scaffolding), Task 6a (preset API service files). Disjoint files — dispatch all four in separate worktrees simultaneously, review independently, merge all four before Batch 2.
- **Batch 2 (6 tasks, parallel):** Task 3a (font-family), Task 3b (font-style), Task 4a (align), Task 4b (position), Task 5 (time), Task 6b (style UI). Each creates exactly one new file — dispatch all six in separate worktrees simultaneously once Batch 1 is merged, review independently, merge all six before Task 7.
- **Sequential tail:** Task 7 (integration check) → Task 8 (inline edit) → Task 9 (drag) → Task 10 (finish).

---

### Task 2: Backend — saved-style preset library (`usage_count` field + routes)

**Files:**
- Modify: `app/models.py`, `app/main.py`
- Test: `tests/test_models.py`, `tests/test_main.py`

**Interfaces:**
- Consumes: `store.load_presets(data_dir) -> list[TextPreset]`, `store.save_preset(preset, data_dir) -> None` (already exist in `app/store.py`, unchanged).
- Produces: `TextPreset.usage_count: int` field; HTTP `GET /api/presets -> list[TextPreset]`, `POST /api/presets` (body = `TextPreset` JSON; same `id` updates) `-> TextPreset` — consumed by Task 6a's `static/api-list-presets.js`/`static/api-save-preset.js`.

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
In the `app/models.py` Inventory bullet's `TextPreset` clause, append `; usage_count: int = 0 (drives the STYLE accordion's most-used list, added 2026-07-18)`.

- [ ] **Step 10: Commit**

```bash
git add app/models.py app/main.py tests/test_models.py tests/test_main.py CLAUDE.md
git commit -m "feat: saved-style preset library — usage_count field + GET/POST /api/presets"
```

---

### Task 2b-html: TEXT panel scaffolding — markup

**Files:**
- Modify: `static/index.html`

**Interfaces:**
- Consumes: nothing (markup only).
- Produces: empty mount points and accordion containers that Batch 2's six tasks (3a, 3b, 4a, 4b, 5, 6b) each wire into: `#text-font-body` (extended), `#text-style-accordion`/`#text-style-body`, `#text-position-accordion`/`#text-position-body`, `#text-time-accordion`/`#text-time-body`, `#panel-text-style`. Also produces the `<script>` tags for all six `text-panel-*.js` files and the two `api-*.js` files (Task 6a) — their exact filenames are pinned here and in Task 2b-js/3a/3b/4a/4b/5/6a/6b, so no live coordination between tasks is needed.

- [ ] **Step 1: Replace the entire `#panel-text` block**

In `static/index.html`, replace the whole block from `<div id="panel-text" class="context-panel" hidden>` through its matching closing `</div>` (currently lines 176–310) with:

```html
      <div id="panel-text" class="context-panel" hidden>
        <div id="panel-text-main">
          <div class="style-panel-header">TEXT</div>

        <div class="style-group">
          <textarea id="text-heading" placeholder="Heading" rows="3"></textarea>
        </div>

        <div id="text-font-accordion">
        <div id="text-font-body">
          <div class="style-group">
            <div id="text-font-row"></div>
          </div>

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
        </div>
        </div>

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

        <div id="text-box-accordion">
        <div id="text-box-body">

          <div class="style-group-label">WIDTH</div>
          <div class="style-group">
            <div id="text-box-width-mode-group"></div>
          </div>
          <div class="style-group">
            <label id="text-box-width-field"></label>
          </div>

          <div class="style-group-label">HEIGHT</div>
          <div class="style-group">
            <div id="text-box-height-mode-group"></div>
          </div>
          <div class="style-group">
            <label id="text-box-height-field"></label>
          </div>

          <div id="text-box-width-height-divider"></div>

          <div class="style-group">
            <div class="style-row style-row-tight">
              <label class="style-checkbox"><input id="text-box-background" type="checkbox"> Background</label>
            </div>
            <div id="text-box-background-color-field"></div>
          </div>

          <div id="text-box-background-border-divider"></div>

          <div class="style-group-label">BORDER</div>
          <div class="style-group">
            <div class="style-row">
              <label id="text-box-border-width-field"></label>
              <label id="text-box-border-radius-field"></label>
            </div>
          </div>
          <div class="style-group">
            <div id="text-box-border-color-field"></div>
          </div>

        </div>
        </div>

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

        <div id="text-time-accordion"></div>
        <div id="text-time-body">
          <div class="style-group">
            <div class="style-row">
              <label id="text-start-field"></label>
              <label id="text-end-field"></label>
            </div>
          </div>
        </div>

        </div>

        <div id="panel-text-font" hidden>
          <div id="text-font-subpanel-header"></div>
          <ul id="text-font-list" class="font-list"></ul>
        </div>

        <div id="panel-text-style" hidden>
          <div id="text-style-subpanel-header"></div>
          <ul id="text-style-list" class="font-list"></ul>
        </div>
      </div>
```

- [ ] **Step 2: Add the new script tags**

In `static/index.html`, replace:

```html
<script src="/static/api-ensure-project.js"></script>
<script src="/static/api-save-project.js"></script>
<script src="/static/api-pick-file.js"></script>
<script src="/static/api-probe-media.js"></script>
<script src="/static/api-export-project.js"></script>
<script src="/static/seed.js"></script>
```

with:

```html
<script src="/static/api-ensure-project.js"></script>
<script src="/static/api-save-project.js"></script>
<script src="/static/api-pick-file.js"></script>
<script src="/static/api-probe-media.js"></script>
<script src="/static/api-export-project.js"></script>
<script src="/static/api-list-presets.js"></script>
<script src="/static/api-save-preset.js"></script>
<script src="/static/text-panel-font-family.js"></script>
<script src="/static/text-panel-font-style.js"></script>
<script src="/static/text-panel-style.js"></script>
<script src="/static/text-panel-align.js"></script>
<script src="/static/text-panel-position.js"></script>
<script src="/static/text-panel-time.js"></script>
<script src="/static/seed.js"></script>
```

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched; the new script tags 404 harmlessly in the browser until Batch 2 lands — this task doesn't run the app).

```bash
git add static/index.html
git commit -m "refactor: scaffold TEXT panel mount points for FONT/STYLE/POSITION/TIME split"
```

---

### Task 2b-js: TEXT panel scaffolding — editor.js orchestrator

**Files:**
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: nothing new (this task only rearranges existing `editor.js` code).
- Produces: `renderTextPanel()` becomes a thin orchestrator calling `TextPanel.renderFontFamily()`, `TextPanel.renderFontStyle()`, `TextPanel.renderStyle()`, `renderBoxPanel()` (unchanged), `TextPanel.renderAlign()`, `TextPanel.renderPosition()`, `TextPanel.renderTime()` — these six function names are the contract Batch 2's tasks (3a, 3b, 6b, 4a, 4b, 5) must each expose on `window.TextPanel`. Also produces the accordion-header/divider registrations for every accordion (FONT pre-existing + new STYLE/POSITION/TIME) — Batch 2's component files do **not** self-register accordion headers, since FONT and POSITION each have two sibling component files sharing one accordion body and only one registration can exist per header.

- [ ] **Step 1: Replace `renderTextPanel()`**

In `static/editor.js`, replace the entire `renderTextPanel()` function (currently lines 75–138) with:

```js
function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-style").hidden = true;
  document.getElementById("panel-text-main").hidden = false;

  const block = ensureTextBlock();
  const preset = ensureTextPreset(block.preset_id);
  document.getElementById("text-heading").value = block.heading;

  TextPanel.renderFontFamily();
  TextPanel.renderFontStyle();
  TextPanel.renderStyle();
  renderBoxPanel();
  TextPanel.renderAlign();
  TextPanel.renderPosition();
  TextPanel.renderTime();

  renderTextPreview();

  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
  });
}
```

- [ ] **Step 2: Delete the code that's moving into Batch 2's files**

In `static/editor.js`, delete these in full (they're being relocated, not duplicated):
- The `wireTextStyleToggle` function and its three calls (`wireTextStyleToggle("text-bold", "bold");` etc.) — moving to `text-panel-font-style.js` (Task 3b).
- The `renderFontRow`, `openFontPanel`, `closeFontPanel`, `hoverPreviewFont`, `selectFont`, `renderFontList` functions, and the `UI.subPanelHeader(document.getElementById("text-font-subpanel-header"), { title: "Font Family", onBack: closeFontPanel });` call — moving to `text-panel-font-family.js` (Task 3a).

- [ ] **Step 3: Replace the accordion-header and divider registrations**

In `static/editor.js`, replace:

```js
UI.accordionSection(document.getElementById("text-font-accordion"), document.getElementById("text-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("text-box-accordion"), document.getElementById("text-box-body"), { title: "BOX", expanded: false });
UI.accordionSection(document.getElementById("text-misc-accordion"), document.getElementById("text-misc-body"), { title: "MISC", expanded: false });

UI.divider(document.getElementById("video-order-divider"));
UI.divider(document.getElementById("text-style-divider"));
UI.divider(document.getElementById("text-align-divider"));
UI.divider(document.getElementById("text-box-width-height-divider"));
UI.divider(document.getElementById("text-box-background-border-divider"));
```

with:

```js
UI.accordionSection(document.getElementById("text-font-accordion"), document.getElementById("text-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("text-style-accordion"), document.getElementById("text-style-body"), { title: "STYLE", expanded: false });
UI.accordionSection(document.getElementById("text-box-accordion"), document.getElementById("text-box-body"), { title: "BOX", expanded: false });
UI.accordionSection(document.getElementById("text-position-accordion"), document.getElementById("text-position-body"), { title: "POSITION", expanded: false });
UI.accordionSection(document.getElementById("text-time-accordion"), document.getElementById("text-time-body"), { title: "TIME", expanded: false });

UI.divider(document.getElementById("video-order-divider"));
UI.divider(document.getElementById("text-font-family-style-divider"));
UI.divider(document.getElementById("text-box-width-height-divider"));
UI.divider(document.getElementById("text-box-background-border-divider"));
```

- [ ] **Step 4: Load saved presets at startup**

In `static/editor.js`, in the closing `(async () => { ... })()` IIFE at the bottom of the file, replace:

```js
  renderMediaList();
  Preview.load(project);
  renderTextPanel();
```

with:

```js
  renderMediaList();
  Preview.load(project);
  await TextPanel.loadSavedPresets();
  renderTextPanel();
```

(`TextPanel.loadSavedPresets` is the function Task 6b's `text-panel-style.js` must expose — this is the pinned contract between this task and Task 6b.)

- [ ] **Step 5: Run tests**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched; the app itself won't fully render in a browser until Batch 2 lands, since `TextPanel.render*`/`TextPanel.loadSavedPresets` don't exist yet — that's expected and resolved when Batch 2 merges. `pytest` doesn't exercise the browser, so this is safe to commit now).

- [ ] **Step 6: Commit**

```bash
git add static/editor.js
git commit -m "refactor: turn renderTextPanel() into a thin orchestrator over TextPanel.* components"
```

---

### Task 6a: Preset API service files

**Files:**
- Create: `static/api-list-presets.js`, `static/api-save-preset.js`

**Interfaces:**
- Consumes: `GET/POST /api/presets` (Task 2's route contract — already pinned above, not a live dependency on Task 2's actual completion for writing this file).
- Produces: `window.Api.listPresets() -> Promise<TextPreset[]>`, `window.Api.savePreset(preset) -> Promise<TextPreset>` — consumed by Task 6b's `text-panel-style.js`.

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

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (new files not exercised by pytest).

```bash
git add static/api-list-presets.js static/api-save-preset.js
git commit -m "feat: preset-library API service (Api.listPresets/Api.savePreset)"
```

---

### Task 3a: FONT accordion — font-family component

**Files:**
- Create: `static/text-panel-font-family.js`

**Interfaces:**
- Consumes: `editor.js` globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPreview()`, `project`, `AVAILABLE_FONTS`), `UI.settingsRow`, `UI.subPanelHeader`, `UI.divider` (all pre-existing).
- Produces: `window.TextPanel.renderFontFamily()` — called once per `renderTextPanel()` invocation by `editor.js`'s orchestrator (Task 2b-js).

This is a **pure relocation** of `editor.js`'s existing font-family-drill-down code (unchanged behavior) into its own file, wrapped as an IIFE so its private helpers (`openFontPanel`, `closeFontPanel`, etc.) don't leak into the shared global scope as bare names.

- [ ] **Step 1: Create the file**

```js
// TEXT panel FONT accordion: font-family row + drill-down subpanel. Pure UI over TextPreset.font.
// Exposes window.TextPanel.renderFontFamily(). No bundler — reaches directly into editor.js's
// globals (ensureTextBlock, ensureTextPreset, saveProject, renderTextPreview, project, AVAILABLE_FONTS),
// same pattern renderBoxPanel() already uses.
window.TextPanel = window.TextPanel || {};

(() => {
  let fontRowSetValue = null;

  function openFontPanel() {
    renderFontList();
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-font").hidden = false;
  }

  function closeFontPanel() {
    document.getElementById("panel-text-font").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
    renderTextPreview();
  }

  function hoverPreviewFont(fontName) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    const previewPresets = { ...project.text_presets, [preset.id]: { ...preset, font: fontName } };
    Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
  }

  async function selectFont(fontName) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset.font = fontName;
    await saveProject();
    renderFontFamily();
    renderFontList();
    closeFontPanel();
  }

  function renderFontList() {
    const listEl = document.getElementById("text-font-list");
    listEl.innerHTML = "";
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    const orderedFonts = [preset.font, ...AVAILABLE_FONTS.filter((f) => f !== preset.font)];
    orderedFonts.forEach((fontName, index) => {
      if (index > 0) {
        const dividerLi = document.createElement("li");
        dividerLi.className = "font-list-divider";
        UI.divider(dividerLi);
        listEl.appendChild(dividerLi);
      }

      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
      li.addEventListener("mouseleave", () => renderTextPreview());
      li.addEventListener("click", () => selectFont(fontName));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.style.fontFamily = fontName;
      nameEl.textContent = fontName;
      li.appendChild(nameEl);

      if (fontName === preset.font) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "font-list-checkmark");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("fill", "none");
        check.setAttribute("stroke", "currentColor");
        check.setAttribute("stroke-width", "2");
        check.setAttribute("stroke-linecap", "round");
        check.setAttribute("stroke-linejoin", "round");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6 9 17l-5-5");
        check.appendChild(path);
        li.appendChild(check);
      }

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("text-font-subpanel-header"), { title: "Font Family", onBack: closeFontPanel });

  function renderFontFamily() {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    if (fontRowSetValue) {
      fontRowSetValue(preset.font, preset.font);
    } else {
      fontRowSetValue = UI.settingsRow(document.getElementById("text-font-row"), {
        label: "Font Family", value: preset.font, valueFontFamily: preset.font,
        onClick: openFontPanel,
      });
    }
  }

  window.TextPanel.renderFontFamily = renderFontFamily;
})();
```

- [ ] **Step 2: Manual verification**

Requires Batch 1 (2b-html, 2b-js) already merged. Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000`, select the text block, expand FONT. Confirm the font-family row shows and its drill-down (hover-preview, click-to-select, checkmark on the applied font) works exactly as before.

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched).

```bash
git add static/text-panel-font-family.js
git commit -m "refactor: extract FONT family drill-down into text-panel-font-family.js"
```

---

### Task 3b: FONT accordion — style component

**Files:**
- Create: `static/text-panel-font-style.js`

**Interfaces:**
- Consumes: `editor.js` globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPreview()`), `UI.numberField`, `UI.colorSwatch` (all pre-existing).
- Produces: `window.TextPanel.renderFontStyle()` — called once per `renderTextPanel()` invocation by `editor.js`'s orchestrator (Task 2b-js).

- [ ] **Step 1: Create the file**

```js
// TEXT panel FONT accordion: SIZE/Bold/Italic/Underline/Color/Outline controls, whole-block
// text styling. Exposes window.TextPanel.renderFontStyle(). Reaches into editor.js's globals
// (ensureTextBlock, ensureTextPreset, saveProject, renderTextPreview), same pattern as renderBoxPanel().
window.TextPanel = window.TextPanel || {};

function wireTextStyleToggle(id, prop) {
  const btn = document.getElementById(id);
  btn.addEventListener("click", async () => {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset[prop] = !preset[prop];
    btn.setAttribute("aria-pressed", String(preset[prop]));
    await saveProject();
    renderTextPreview();
  });
}
wireTextStyleToggle("text-bold", "bold");
wireTextStyleToggle("text-italic", "italic");
wireTextStyleToggle("text-underline", "underline");

window.TextPanel.renderFontStyle = function renderFontStyle() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  document.getElementById("text-bold").setAttribute("aria-pressed", String(preset.bold));
  document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
  document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));

  UI.numberField(document.getElementById("text-size-field"),
    { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200,
      onChange: (v) => { preset.size_px = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-color-field"),
    { label: "Color", value: preset.color,
      onChange: (v) => { preset.color = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-outline-color-field"),
    { label: "Outline", value: preset.outline_color,
      onChange: (v) => { preset.outline_color = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-outline-px-field"),
    { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20,
      onChange: (v) => { preset.outline_px = v; saveProject(); renderTextPreview(); } });
};
```

- [ ] **Step 2: Manual verification**

Requires Batch 1 already merged. Reload, select the text block, expand FONT. Confirm: font-family row, then a divider, then SIZE/Bold/Italic/Underline/Color/Outline-color/Outline-width controls, all functioning exactly as before (change size, toggle bold, pick a color — canvas updates live).

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

```bash
git add static/text-panel-font-style.js
git commit -m "refactor: extract FONT size/style/color/outline controls into text-panel-font-style.js"
```

---

### Task 4a: POSITION accordion — TEXT ALIGN component

**Files:**
- Create: `static/text-panel-align.js`

**Interfaces:**
- Consumes: `editor.js` globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPreview()`), `UI.buttonGroup` (pre-existing).
- Produces: `window.TextPanel.renderAlign()` — called once per `renderTextPanel()` invocation by `editor.js`'s orchestrator (Task 2b-js).

- [ ] **Step 1: Create the file**

```js
// TEXT panel POSITION accordion: TEXT ALIGN button group. Exposes window.TextPanel.renderAlign().
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderAlign = function renderAlign() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-align-group"),
    [{ value: "left", label: "LEFT" }, { value: "center", label: "CENTER" }, { value: "right", label: "RIGHT" }],
    preset.align, (value) => { preset.align = value; saveProject(); renderTextPreview(); });
};
```

- [ ] **Step 2: Manual verification**

Requires Batch 1 already merged. Reload, select the text block, expand POSITION. Confirm TEXT ALIGN buttons change the heading's text alignment on canvas.

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

```bash
git add static/text-panel-align.js
git commit -m "feat: TEXT ALIGN component (text-panel-align.js)"
```

---

### Task 4b: POSITION accordion — anchor grid + offset component

**Files:**
- Create: `static/text-panel-position.js`

**Interfaces:**
- Consumes: `editor.js` globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPreview()`, `computeXY()`), `UI.buttonGroup`, `UI.numberField` (pre-existing).
- Produces: `window.TextPanel.renderPosition()` — called once per `renderTextPanel()` invocation by `editor.js`'s orchestrator (Task 2b-js).

- [ ] **Step 1: Create the file**

```js
// TEXT panel POSITION accordion: anchor grid (row/col thirds of the canvas) + pixel offset.
// Exposes window.TextPanel.renderPosition(). Reaches into editor.js's globals (ensureTextBlock,
// ensureTextPreset, saveProject, renderTextPreview, computeXY).
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderPosition = function renderPosition() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "OFFSET H", unit: "PX", value: preset.offset_x, step: 1,
      onChange: (v) => { preset.offset_x = v; computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "OFFSET V", unit: "PX", value: preset.offset_y, step: 1,
      onChange: (v) => { preset.offset_y = v; computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP" }, { value: "mid", label: "MID" }, { value: "btm", label: "BTM" }],
    preset.pos_row, (value) => { preset.pos_row = value; computeXY(preset); saveProject(); renderTextPreview(); });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT" }, { value: "mid", label: "MID" }, { value: "right", label: "RIGHT" }],
    preset.pos_col, (value) => { preset.pos_col = value; computeXY(preset); saveProject(); renderTextPreview(); });
};
```

- [ ] **Step 2: Manual verification**

Requires Batch 1 already merged. Reload, select the text block, expand POSITION. Confirm the anchor grid (row/col buttons) and OFFSET H/V fields move the text on canvas and persist after reload.

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

```bash
git add static/text-panel-position.js
git commit -m "feat: POSITION anchor grid + offset component (text-panel-position.js)"
```

---

### Task 5: TIME accordion component

**Files:**
- Create: `static/text-panel-time.js`

**Interfaces:**
- Consumes: `editor.js` globals (`ensureTextBlock()`, `saveProject()`, `renderTextPreview()`), `UI.numberField` (pre-existing).
- Produces: `window.TextPanel.renderTime()` — called once per `renderTextPanel()` invocation by `editor.js`'s orchestrator (Task 2b-js).

- [ ] **Step 1: Create the file**

```js
// TEXT panel TIME accordion: block start/end seconds. Exposes window.TextPanel.renderTime().
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderTime = function renderTime() {
  const block = ensureTextBlock();

  UI.numberField(document.getElementById("text-start-field"),
    { label: "START", unit: "SEC", value: block.start, step: 0.1,
      onChange: (v) => { block.start = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-end-field"),
    { label: "END", unit: "SEC", value: block.end, step: 0.1,
      onChange: (v) => { block.end = v; saveProject(); renderTextPreview(); } });
};
```

- [ ] **Step 2: Manual verification**

Requires Batch 1 already merged. Reload, select the text block, expand TIME. Confirm START/END fields still work (change values, confirm block visibility window shifts).

- [ ] **Step 3: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

```bash
git add static/text-panel-time.js
git commit -m "feat: TIME accordion component (text-panel-time.js)"
```

---

### Task 6b: STYLE accordion — saved-preset library UI

**Files:**
- Create: `static/text-panel-style.js`

**Interfaces:**
- Consumes: `Api.listPresets()`/`Api.savePreset(preset)` (Task 6a), `editor.js` globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPanel()`), `UI.settingsRow`, `UI.subPanelHeader` (pre-existing), the existing `.font-list`/`.font-list-row`/`.font-list-row-name` CSS classes.
- Produces: `window.TextPanel.renderStyle()` (called once per `renderTextPanel()` invocation by `editor.js`'s orchestrator) and `window.TextPanel.loadSavedPresets()` (called once at startup by `editor.js`'s init IIFE, per Task 2b-js Step 4).

- [ ] **Step 1: Create the file**

```js
// TEXT panel STYLE accordion: saved-style preset library — save current style as new, most-used
// inline list, browse-all drill-down. Exposes window.TextPanel.renderStyle()/loadSavedPresets().
// Distinct from project.text_presets (per-block live working style) — this is the separate global
// library persisted via GET/POST /api/presets (app/main.py).
window.TextPanel = window.TextPanel || {};

(() => {
  let savedPresets = []; // the global preset library, fetched once on load and refreshed after every save/apply

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

  async function saveCurrentStyleAsPreset() {
    const name = prompt("Name this style:");
    if (!name) return;
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    await loadSavedPresets();
    renderStyle();
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

  function renderStyle() {
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

  async function loadSavedPresets() {
    savedPresets = await Api.listPresets();
  }

  UI.subPanelHeader(document.getElementById("text-style-subpanel-header"), { title: "Saved Styles", onBack: closeStylePanel });
  document.getElementById("text-style-save").addEventListener("click", saveCurrentStyleAsPreset);

  window.TextPanel.renderStyle = renderStyle;
  window.TextPanel.loadSavedPresets = loadSavedPresets;
})();
```

- [ ] **Step 2: Manual verification**

Requires Batch 1 already merged (and Task 6a's API files, and Task 2's backend routes running). Reload, select the text block, expand STYLE. Confirm: "+ Save current style" prompts for a name and, after entering one, the style appears in the "most used" list and the drill-down (click "Browse all styles"). Style a second text block differently, apply the saved style to it, confirm its appearance changes to match. Restart the server (`Ctrl+C`, re-run `uvicorn`), reload, confirm the saved style is still there.

- [ ] **Step 3: Update `CLAUDE.md`**

Add to the file tree under `static/`:

```
  api-list-presets.js     # GET /api/presets -> saved TextPreset[]
  api-save-preset.js      # POST /api/presets -> saves/updates a saved TextPreset
  text-panel-font-family.js  # TEXT panel FONT accordion: font-family row + drill-down
  text-panel-font-style.js   # TEXT panel FONT accordion: size/bold/italic/underline/color/outline
  text-panel-align.js        # TEXT panel POSITION accordion: TEXT ALIGN button group
  text-panel-position.js     # TEXT panel POSITION accordion: anchor grid + offset
  text-panel-time.js         # TEXT panel TIME accordion: start/end
  text-panel-style.js        # TEXT panel STYLE accordion: saved-style preset library
```

Add Inventory bullets documenting `Api.listPresets()`/`Api.savePreset(preset)` and each `TextPanel.render*()`/`TextPanel.loadSavedPresets()` function (one line each, matching the existing Inventory's style). Update the `static/editor.js` Inventory bullet: `renderTextPanel()` is now a thin orchestrator delegating to `TextPanel.*`; remove references to `renderFontRow()`/`openFontPanel()` etc. (moved out) and the SIZE/color/outline/align/position/time `UI.*` calls (moved out) — note `renderBoxPanel()`/`handleBoxResize()`/`handleBoxResizeEnd()` are unchanged and still live in `editor.js`.

- [ ] **Step 4: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched by this task).

```bash
git add static/text-panel-style.js CLAUDE.md
git commit -m "feat: STYLE accordion — saved style presets (save-as-new, most-used list, browse-all drill-down)"
```

---

### Task 7: Integration check — confirm five-accordion order

**Files:** none (verification only, per the original design's subthread 7 — "no code expected, just placement/verification").

**Interfaces:**
- Consumes: all of Batch 1 and Batch 2, merged.
- Produces: nothing — this is the gate before Task 8 starts.

- [ ] **Step 1: Full automated test pass**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all PASS.

- [ ] **Step 2: Manual walkthrough**

With the dev server running (`.venv/Scripts/python -m uvicorn app.main:app --reload`), in the browser:
1. Select the text block. Confirm the TEXT panel shows exactly five accordions in order: FONT, STYLE, BOX, POSITION, TIME.
2. FONT: family drill-down + SIZE/bold/italic/underline/color/outline all apply live.
3. STYLE: save-as-new, most-used list, browse-all drill-down, apply-to-different-block, and server-restart persistence all work (re-verify Task 6b's checks now that everything is merged together).
4. BOX: unchanged regression check — background/border toggle, resize via drag handles still work exactly as before this phase.
5. POSITION: TEXT ALIGN + anchor grid + offsets all work together in one accordion body.
6. TIME: start/end still work.

- [ ] **Step 3: Commit (if any fixes were needed)**

If the manual walkthrough surfaces any integration bug (e.g., a wrong container id), fix it directly, re-run `pytest -q`, and commit:

```bash
git add -A
git commit -m "fix: integration check — TEXT panel five-accordion order"
```

If no fixes are needed, this task produces no commit — just proceed to Task 8.

---

### Task 8: Inline stage text editing

**Files:**
- Create: `static/ui-text-interaction.js`
- Modify: `static/index.html`, `static/preview.js`, `static/editor.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `window.UI.textInteraction(div, { onEditStart, onInput, onEditEnd })` — a new stage-interaction file mirroring `static/ui-resize-handles.js`'s existing pattern (a standalone interaction handler that `preview.js` mounts/unmounts per-element via a callback object). Task 9 extends this same function's signature and body with `onMove`/`onMoveEnd`.

- [ ] **Step 1: Remove the side-panel heading textarea**

In `static/index.html`, delete:

```html
        <div class="style-group">
          <textarea id="text-heading" placeholder="Heading" rows="3"></textarea>
        </div>
```

Add the new script tag before `preview.js`'s:

```html
<script src="/static/ui-text-interaction.js"></script>
<script src="/static/preview.js"></script>
```

- [ ] **Step 2: Create `static/ui-text-interaction.js`**

```js
// Reusable stage interaction: click-to-edit a contentEditable element. Mirrors ui-resize-handles.js's
// shape (a standalone interaction handler preview.js mounts/unmounts per-element via a callback object).
window.UI = window.UI || {};

window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd } = {}) {
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

  div.addEventListener("click", enterEditMode);
};
```

- [ ] **Step 3: Wire it into `preview.js`**

In `static/preview.js`, add module-level state after `let boxResizeCallbacks = null;`:

```js
  let editingBlockId = null;
  let editingDiv = null;
```

Replace:

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
        UI.textInteraction(div, {
          onEditStart: () => { editingBlockId = block.id; editingDiv = div; },
          onInput: (text) => {
            block.heading = text;
            if (boxResizeCallbacks && boxResizeCallbacks.onEdit) boxResizeCallbacks.onEdit(text);
          },
          onEditEnd: (text) => {
            block.heading = text;
            editingBlockId = null;
            editingDiv = null;
            if (boxResizeCallbacks && boxResizeCallbacks.onEditEnd) boxResizeCallbacks.onEditEnd(text);
          },
        });
        if (boxResizeCallbacks) {
          UI.resizeHandles(div, {
            getSize: () => ({ width: div.offsetWidth, height: div.offsetHeight }),
            onResize: (size) => boxResizeCallbacks.onResize(size),
            onDragEnd: (size) => boxResizeCallbacks.onDragEnd(size),
          });
        }
      }
```

- [ ] **Step 4: Wire the callbacks and remove the textarea's JS in `editor.js`**

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

- [ ] **Step 5: Manual verification**

Reload, select the text block. Confirm there's no heading textarea in the side panel. Click the heading text on the stage — confirm a text cursor appears and you can type; confirm the heading updates live as you type. Click elsewhere (blur) — confirm the change persists after a page reload. Confirm playback (`timeupdate`-driven re-renders) doesn't kick you out of edit mode or lose your cursor position while you're mid-edit and the block is still within its `start`/`end` window.

- [ ] **Step 6: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched).

```bash
git add static/index.html static/preview.js static/editor.js static/ui-text-interaction.js
git commit -m "feat: inline stage text editing via ui-text-interaction.js, replacing the side-panel heading textarea"
```

---

### Task 9: Drag-to-reposition the box body

**Files:**
- Modify: `static/ui-text-interaction.js`, `static/editor.js`

**Interfaces:**
- Consumes: `boxResizeCallbacks` shape from Task 8 (extends it with `onMove`/`onMoveEnd`).
- Produces: nothing new exported — extends `UI.textInteraction`'s existing signature.

- [ ] **Step 1: Replace the plain click listener with a click-vs-drag mousedown handler**

In `static/ui-text-interaction.js`, change the function signature:

```js
window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd } = {}) {
```

to:

```js
window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd, onMove, onMoveEnd } = {}) {
```

Replace the line added in Task 8:

```js
  div.addEventListener("click", enterEditMode);
```

with:

```js
  div.addEventListener("mousedown", (e) => {
    if (e.target.closest(".resize-handle")) return; // let resize handles work unmodified
    if (div.contentEditable === "true") return; // already editing, let native caret placement work
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
        enterEditMode();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
```

- [ ] **Step 2: Pass the new callbacks through in `preview.js`**

In `static/preview.js`, extend the `UI.textInteraction(div, {...})` call added in Task 8 with:

```js
          onMove: (delta) => { if (boxResizeCallbacks && boxResizeCallbacks.onMove) boxResizeCallbacks.onMove(delta); },
          onMoveEnd: (delta) => { if (boxResizeCallbacks && boxResizeCallbacks.onMoveEnd) boxResizeCallbacks.onMoveEnd(delta); },
```

(added as two more properties alongside `onEditStart`/`onInput`/`onEditEnd` in that same call).

- [ ] **Step 3: Add the move handlers in `editor.js`**

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

Extend the `Preview.setSelectedTextBlock(...)` call in `renderTextPanel()` (from Task 8) with the new callbacks:

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

- [ ] **Step 4: Manual verification**

Reload, select the text block. Click-and-drag the box body (not a resize handle, not just a click) — confirm it moves live with the cursor. Release — confirm the POSITION accordion's anchor grid and OFFSET H/V fields update to reflect the new position, and the position persists after a reload. Confirm a plain click (no drag) still enters edit mode (from Task 8) instead of moving the box. Confirm dragging a resize handle still resizes, not moves.

- [ ] **Step 5: Run tests, commit**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (backend untouched).

```bash
git add static/ui-text-interaction.js static/preview.js static/editor.js
git commit -m "feat: drag-to-reposition the text box body via ui-text-interaction.js"
```

---

### Task 10: End-to-end verification + finish the branch

- [ ] **Step 1: Full automated test pass**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all PASS.

- [ ] **Step 2: Full manual walkthrough**

With the dev server running, in the browser:
1. Confirm the TEXT panel shows exactly five accordions in order: FONT, STYLE, BOX, POSITION, TIME.
2. FONT: change family, size, bold/italic/underline, color, outline — all apply live.
3. STYLE: save the current look as a named preset, confirm it shows in the most-used list and the browse-all drill-down; apply a saved preset to a different block and confirm it takes effect; restart the server and confirm the preset persisted.
4. BOX: toggle background/border, resize via drag handles — confirm it still works exactly as before this phase (regression check).
5. POSITION: TEXT ALIGN + anchor grid + offsets still work.
6. TIME: start/end still work.
7. Click directly into the heading on the stage, edit the text, confirm it saves; confirm there's no side-panel textarea.
8. Drag the box body (not a resize handle) to reposition it; confirm a plain click still enters edit mode.
9. Click EXPORT, download the mp4, confirm it visually matches the preview for all of the above (font, saved-style-applied look, box, position, edited heading text).

- [ ] **Step 3: Update `CLAUDE.md`**

Update the `static/index.html`/`static/editor.js`/`static/preview.js` Inventory bullets to reflect the final structure: the five-accordion TEXT panel (FONT/STYLE/BOX/POSITION/TIME) built from `text-panel-*.js` component files plus `renderBoxPanel()` still in `editor.js`; the removal of `#text-heading`; the new `static/ui-text-interaction.js` stage-drag/edit interaction (mirroring `ui-resize-handles.js`) — in particular, the `static/css/components/style-panel.css` bullet's `#panel-text` description (currently still describes a `#text-heading` textarea and a MISC-bundled TIME/STYLE/TEXT ALIGN/POSITION section, both now stale).

- [ ] **Step 4: Run `superpowers:finishing-a-development-branch`**

Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate this work (merge, PR, or cleanup), now that all of this phase's tasks are complete and manually verified. This is the phase's visual/functional checkpoint — Phase 2 (rich-text formatting) does not start until this passes.
