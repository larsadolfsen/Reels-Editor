# Style Preset Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete a saved style, overwrite an existing saved style with the current style, and name new styles through a themed in-panel form instead of the native `prompt()`.

**Architecture:** A new `DELETE /api/presets/{id}` backend route + `store.delete_preset`; a hover-revealed trash icon added to the existing `UI.stylePresetCard`; a new shared `UI.styleSaveForm` component; and a `saveMode` flag in each Style tab (`text-panel-style.js`, `caption-panel-style.js`) that swaps the "+ Save current style" button for the form and turns the preset cards into overwrite targets. Overwrite needs no backend change — `store.save_preset` already upserts by id.

**Tech Stack:** FastAPI + pytest backend; framework-free vanilla-JS frontend (`window.UI.*` / `window.Api.*`, one function per file), CSS on `tokens.css` custom properties.

**Spec:** `docs/superpowers/specs/2026-07-24-style-preset-management-design.md`

## Global Constraints

- No inline `style="..."` attributes in HTML or JS-rendered markup — all styling via classes in `static/css/components/*.css`.
- Every new/edited source file starts with a 2–3 line header comment (what it does / exposes / depends on).
- Icons are hand-inlined Lucide SVG paths with wrapper `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- Any commit that adds a file must update the codebase map/inventory in `CLAUDE.md` in that same commit.
- Tests: `.venv/Scripts/python -m pytest -q` from the repo root (subagents scope to the test files they touch).
- No confirmation dialog on delete; no native browser popups anywhere in this feature.

---

### Task 1: Backend delete — `store.delete_preset` + `DELETE /api/presets/{id}`

**Files:**
- Modify: `app/store.py` (add `delete_preset` after `save_preset`, line 41)
- Modify: `app/main.py` (add route after `create_preset`, line 149)
- Test: `tests/test_store.py`, `tests/test_main.py`

**Interfaces:**
- Produces: `store.delete_preset(preset_id: str, data_dir) -> None` (removes by id, no-op if unknown); HTTP `DELETE /api/presets/{preset_id}` -> 204 always (idempotent, matching `DELETE /api/projects/{pid}`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_store.py` (it already imports `save_preset, load_presets` from `app.store`; extend that import line with `delete_preset`):

```python
def test_delete_preset_removes_by_id(tmp_path):
    a = TextPreset(name="Pop")
    save_preset(a, tmp_path)
    save_preset(TextPreset(name="Clean"), tmp_path)
    delete_preset(a.id, tmp_path)
    assert {x.name for x in load_presets(tmp_path)} == {"Clean"}

def test_delete_preset_unknown_id_is_noop(tmp_path):
    save_preset(TextPreset(name="Pop"), tmp_path)
    delete_preset("nope", tmp_path)
    assert {x.name for x in load_presets(tmp_path)} == {"Pop"}
```

Append to `tests/test_main.py` (extend its `from app.main import ...` line with `delete_preset`):

```python
def test_delete_preset_route_removes_and_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = TextPreset(name="Pop")
    create_preset(p)
    delete_preset(p.id)
    assert list_presets() == []
    delete_preset(p.id)  # unknown id: still no error (204 route)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_store.py tests/test_main.py -q`
Expected: FAIL / ERROR with `ImportError: cannot import name 'delete_preset'`.

- [ ] **Step 3: Implement**

Append to `app/store.py`:

```python
def delete_preset(preset_id: str, data_dir) -> None:
    items = [x for x in load_presets(data_dir) if x.id != preset_id]
    _presets_path(data_dir).write_text(json.dumps([x.model_dump() for x in items], indent=2), encoding="utf-8")
```

In `app/main.py`, directly after the `create_preset` route:

```python
@app.delete("/api/presets/{preset_id}", status_code=204)
def delete_preset(preset_id: str) -> None:
    store.delete_preset(preset_id, DATA_DIR)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_store.py tests/test_main.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/store.py app/main.py tests/test_store.py tests/test_main.py
git commit -m "Add preset delete: store.delete_preset + DELETE /api/presets/{id}"
```

---

### Task 2: `Api.deletePreset` client

**Files:**
- Create: `static/api-delete-preset.js`
- Modify: `static/index.html` (script tag after the `/static/api-save-preset.js` line, currently line 805)
- Modify: `CLAUDE.md` (file-structure line + Saved style presets inventory)

**Interfaces:**
- Consumes: Task 1's `DELETE /api/presets/{preset_id}`.
- Produces: `Api.deletePreset(presetId) -> Promise<void>` (used by Tasks 5–6).

- [ ] **Step 1: Create the file** (mirrors `static/api-delete-project.js` exactly)

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// DELETE /api/presets/{id}.
window.Api.deletePreset = async function deletePreset(id) {
  await fetch(`/api/presets/${id}`, { method: "DELETE" });
};
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, after `<script src="/static/api-save-preset.js"></script>` add:

```html
<script src="/static/api-delete-preset.js"></script>
```

- [ ] **Step 3: Update `CLAUDE.md`** — add a `api-delete-preset.js` line to the File structure tree next to `api-save-preset.js` (`# Api.deletePreset: DELETE /api/presets/{id}`) and to the "Saved style presets" inventory section, and note the new route on `app/main.py`'s entries (`GET/POST/DELETE /api/presets`).

- [ ] **Step 4: Commit**

```bash
git add static/api-delete-preset.js static/index.html CLAUDE.md
git commit -m "Add Api.deletePreset client for DELETE /api/presets/{id}"
```

---

### Task 3: Trash icon on `UI.stylePresetCard`

**Files:**
- Modify: `static/ui-style-preset-card.js`
- Modify: `static/css/components/style-preset-card.css`
- Modify: `CLAUDE.md` (ui-style-preset-card.js inventory line: note the `onDelete` option)

**Interfaces:**
- Produces: `UI.stylePresetCard(preset, { onClick, onDelete })` — when `onDelete` is provided, a hover-revealed trash icon button renders in the card's top-right corner; clicking it stops propagation and calls `onDelete(preset)`. Omitting `onDelete` renders the card exactly as before.

- [ ] **Step 1: Extend the component**

In `static/ui-style-preset-card.js`, change the signature to `{ onClick, onDelete } = {}` and, after the name element is appended, add:

```js
    if (onDelete) {
      const trashBtn = document.createElement("button");
      trashBtn.type = "button";
      trashBtn.className = "icon-btn style-preset-card-delete";
      trashBtn.title = "Delete style";
      trashBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      trashBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onDelete(preset);
      });
      li.appendChild(trashBtn);
    }
```

Update the file's header comment (mention the optional hover-revealed delete action).

- [ ] **Step 2: Style it**

Append to `static/css/components/style-preset-card.css` (and add `position: relative;` to the existing `.style-preset-card` rule):

```css
.style-preset-card-delete {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  opacity: 0;
}
.style-preset-card:hover .style-preset-card-delete { opacity: 1; }
```

- [ ] **Step 3: Update `CLAUDE.md`** — extend `ui-style-preset-card.js`'s inventory/file-structure lines with the optional `onDelete` hover-trash action.

- [ ] **Step 4: Commit**

```bash
git add static/ui-style-preset-card.js static/css/components/style-preset-card.css CLAUDE.md
git commit -m "Add hover-revealed delete action to UI.stylePresetCard"
```

---

### Task 4: `UI.styleSaveForm` component

**Files:**
- Create: `static/ui-style-save-form.js`
- Create: `static/css/components/style-save-form.css`
- Modify: `static/index.html` — script tag after `/static/ui-style-preset-card.js` (line 787); stylesheet link after the `style-preset-card.css` link (line 21); plus two hidden form containers (see Step 3)
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `UI.styleSaveForm(container, { onSave, onCancel })` — appends a themed name-input + Save/Cancel row + overwrite hint into `container`, autofocuses the input. `onSave(name)` fires on Save click or Enter with a non-empty trimmed name (empty name does nothing); `onCancel()` fires on Cancel click or Escape. Also: `#text-style-form` / `#caption-style-form` container divs exist in `index.html`, `hidden` by default (used by Tasks 5–6).

- [ ] **Step 1: Create `static/ui-style-save-form.js`**

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Inline "save current style" form for the TEXT/CAPTIONS Style tabs: themed name input +
// Save/Cancel buttons + overwrite hint, replacing the native prompt(). Depends on
// the .style-save-form CSS component (style-save-form.css) and .panel-button.
window.UI = window.UI || {};

// styleSaveForm(container, {onSave, onCancel}) -> the form element.
// onSave(name) fires on Save/Enter with a non-empty name; onCancel() on Cancel/Escape.
window.UI.styleSaveForm = function styleSaveForm(container, { onSave, onCancel } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "style-save-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "style-save-form-input";
  input.placeholder = "Style name";

  const commit = () => {
    const name = input.value.trim();
    if (name && onSave) onSave(name);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape" && onCancel) onCancel();
  });

  const buttons = document.createElement("div");
  buttons.className = "style-save-form-buttons";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "panel-button";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", commit);
  buttons.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "panel-button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => { if (onCancel) onCancel(); });
  buttons.appendChild(cancelBtn);

  const hint = document.createElement("div");
  hint.className = "style-save-form-hint";
  hint.textContent = "…or click a style below to overwrite it";

  wrap.appendChild(input);
  wrap.appendChild(buttons);
  wrap.appendChild(hint);
  container.appendChild(wrap);
  input.focus();
  return wrap;
};
```

- [ ] **Step 2: Create `static/css/components/style-save-form.css`**

```css
/* Inline save-current-style form (UI.styleSaveForm, static/ui-style-save-form.js):
   name input + Save/Cancel row + overwrite hint in the TEXT/CAPTIONS Style tabs.
   Depends on tokens.css; buttons use panel-button.css. */
.style-save-form {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.style-save-form-input {
  width: 100%;
  font-family: var(--font-ui);
  font-size: 12px;
}

.style-save-form-buttons {
  display: flex;
  gap: var(--space-2);
}

.style-save-form-buttons .panel-button { flex: 1; }

.style-save-form-hint {
  font-family: var(--font-ui);
  font-size: 10.5px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Wire into `static/index.html`**

Add `<link rel="stylesheet" href="/static/css/components/style-save-form.css">` after the `style-preset-card.css` link. Add `<script src="/static/ui-style-save-form.js"></script>` after the `ui-style-preset-card.js` script. Then add a hidden form container in each Style tab body, between the save-button group and the list group:

In `#text-style-body` (after the `.style-group` holding `#text-style-save`, line 593):

```html
          <div id="text-style-form" class="style-group" hidden></div>
```

In `#caption-style-body` (after the `.style-group` holding `#caption-style-save`, line 217):

```html
            <div id="caption-style-form" class="style-group" hidden></div>
```

- [ ] **Step 4: Update `CLAUDE.md`** — add `ui-style-save-form.js` + `style-save-form.css` to the File structure tree and the Shared UI components inventory.

- [ ] **Step 5: Commit**

```bash
git add static/ui-style-save-form.js static/css/components/style-save-form.css static/index.html CLAUDE.md
git commit -m "Add UI.styleSaveForm themed inline save form component"
```

---

### Task 5: TEXT Style tab — save mode, overwrite, delete

**Files:**
- Modify: `static/text-panel-style.js`
- Modify: `CLAUDE.md` (text-panel-style.js description lines)

**Interfaces:**
- Consumes: `Api.deletePreset` (Task 2), `UI.stylePresetCard(preset, {onClick, onDelete})` (Task 3), `UI.styleSaveForm` + `#text-style-form` (Task 4).
- Produces: unchanged public surface (`TextPanel.renderStyle()`/`loadSavedPresets()`).

- [ ] **Step 1: Rewrite the save/render logic**

In `static/text-panel-style.js`, replace `saveCurrentStyleAsPreset` and `renderStyle` with (and update the header comment: save-as-new now via inline form, cards double as overwrite targets in save mode, hover-trash deletes):

```js
  let saveMode = false; // true while the inline save form is open: cards become overwrite targets

  function enterSaveMode() { saveMode = true; renderStyle(); }
  function exitSaveMode() { saveMode = false; renderStyle(); }

  async function saveNewPreset(name) {
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    saveMode = false;
    await loadSavedPresets();
    renderStyle();
  }

  // Save-mode card click: overwrite that saved style's look (id/name/usage_count kept).
  async function overwriteSavedPreset(saved) {
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    Object.assign(saved, styleFieldsOf(preset));
    await Api.savePreset(saved);
    saveMode = false;
    await loadSavedPresets();
    renderStyle();
  }

  async function deleteSavedPreset(saved) {
    await Api.deletePreset(saved.id);
    await loadSavedPresets();
    renderStyle();
  }

  function renderStyle() {
    const saveBtn = document.getElementById("text-style-save");
    const formEl = document.getElementById("text-style-form");
    saveBtn.hidden = saveMode;
    formEl.hidden = !saveMode;
    formEl.innerHTML = "";
    if (saveMode) UI.styleSaveForm(formEl, { onSave: saveNewPreset, onCancel: exitSaveMode });

    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    const listEl = document.getElementById("text-style-list");
    listEl.innerHTML = "";
    sorted.forEach((saved) => listEl.appendChild(UI.stylePresetCard(saved, {
      onClick: saveMode ? overwriteSavedPreset : applySavedPreset,
      onDelete: deleteSavedPreset,
    })));
  }
```

Change the save-button listener to:

```js
  document.getElementById("text-style-save").addEventListener("click", enterSaveMode);
```

`styleFieldsOf`, `applySavedPreset`, `loadSavedPresets`, and the exports stay as they are.

- [ ] **Step 2: Verify no `prompt(` remains**

Run: `grep -n "prompt(" static/text-panel-style.js`
Expected: no matches.

- [ ] **Step 3: Update `CLAUDE.md`** — refresh `text-panel-style.js`'s description (inline save form via `UI.styleSaveForm` replaces `prompt()`; save mode overwrites an existing preset on card click; hover-trash delete via `Api.deletePreset`).

- [ ] **Step 4: Commit**

```bash
git add static/text-panel-style.js CLAUDE.md
git commit -m "TEXT Style tab: inline save form, overwrite-existing mode, delete"
```

---

### Task 6: CAPTIONS Style tab — same behavior

**Files:**
- Modify: `static/caption-panel-style.js`
- Modify: `CLAUDE.md` (caption-panel-style.js description line)

**Interfaces:**
- Consumes: same as Task 5, but `#caption-style-form`, `#caption-style-save`, `#caption-style-list`, and the caption preset accessors.
- Produces: unchanged public surface (`CaptionPanel.renderStyle()`).

- [ ] **Step 1: Apply the mirrored change**

In `static/caption-panel-style.js`, replace `saveCurrentStyleAsPreset` and `renderStyle` with (note: caption preset accessor + caption element ids; `styleFieldsOf` here includes the highlight fields — unchanged):

```js
  let saveMode = false; // true while the inline save form is open: cards become overwrite targets

  function enterSaveMode() { saveMode = true; renderStyle(); }
  function exitSaveMode() { saveMode = false; renderStyle(); }

  async function saveNewPreset(name) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    saveMode = false;
    await loadSavedPresets();
    renderStyle();
  }

  // Save-mode card click: overwrite that saved style's look (id/name/usage_count kept).
  async function overwriteSavedPreset(saved) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    Object.assign(saved, styleFieldsOf(preset));
    await Api.savePreset(saved);
    saveMode = false;
    await loadSavedPresets();
    renderStyle();
  }

  async function deleteSavedPreset(saved) {
    await Api.deletePreset(saved.id);
    await loadSavedPresets();
    renderStyle();
  }

  function renderStyle() {
    const saveBtn = document.getElementById("caption-style-save");
    const formEl = document.getElementById("caption-style-form");
    saveBtn.hidden = saveMode;
    formEl.hidden = !saveMode;
    formEl.innerHTML = "";
    if (saveMode) UI.styleSaveForm(formEl, { onSave: saveNewPreset, onCancel: exitSaveMode });

    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    const listEl = document.getElementById("caption-style-list");
    listEl.innerHTML = "";
    sorted.forEach((saved) => listEl.appendChild(UI.stylePresetCard(saved, {
      onClick: saveMode ? overwriteSavedPreset : applySavedPreset,
      onDelete: deleteSavedPreset,
    })));
  }
```

Change the save-button listener to `enterSaveMode` (same as Task 5). Update the header comment the same way.

- [ ] **Step 2: Verify no `prompt(` remains anywhere**

Run: `grep -rn "prompt(" static/`
Expected: no matches.

- [ ] **Step 3: Update `CLAUDE.md`** — refresh `caption-panel-style.js`'s description to mirror Task 5's.

- [ ] **Step 4: Commit**

```bash
git add static/caption-panel-style.js CLAUDE.md
git commit -m "CAPTIONS Style tab: inline save form, overwrite-existing mode, delete"
```

---

### Task 7: Full suite + manual browser verification (orchestrator)

- [ ] **Step 1:** Run the full suite: `.venv/Scripts/python -m pytest -q` — all pass.
- [ ] **Step 2:** Manual check in the browser preview **on a throwaway project** (never real project data), with a cache-busted reload: open TEXT panel → Style tab; click "+ Save current style" → themed inline form appears (no native popup), Enter/Save with a name creates a card, Escape/Cancel exits; in save mode click an existing card → its preview updates to the current style; hover a card → trash appears, click deletes with no confirmation; repeat the save/overwrite/delete cycle once on the CAPTIONS Style tab.
- [ ] **Step 3:** Commit anything outstanding; report done and ask about merging.
