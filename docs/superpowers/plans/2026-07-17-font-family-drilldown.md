# Font Family Drill-Down Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TEXT panel's FONT accordion/`<select>` with a "Font Family" settings row that opens a full-panel drill-down list of fonts, each rendered in its own font, with live preview + explicit Apply.

**Architecture:** Two new generic, presentational `window.UI.*` components (`settingsRow`, `subPanelHeader`) plus a markup restructure of `#panel-text` into two mutually-exclusive views (`#panel-text-main` / `#panel-text-font`), driven by module-level state in `editor.js`. No backend changes — this is purely an editor UI change to font *selection*; `preset.font` is still just a string persisted the same way it always was.

**Tech Stack:** Vanilla JS (`window.UI.*` components, no framework), hand-written CSS on top of `tokens.css` custom properties. No JS test framework exists in this repo (only Python `pytest` for `app/*.py`); JS UI work is verified manually in the browser, matching how every existing `ui-*.js` component in this codebase was built.

## Global Constraints

- One function/component per file under `static/ui-*.js`, each attached to `window.UI.*` — never grouped into a shared catch-all (per `CLAUDE.md`).
- Every `static/*.js` and `static/css/**/*.css` file opens with a one-or-two-line comment stating its purpose (per `CLAUDE.md`).
- Icon SVGs are hand-inlined using the existing wrapper style: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` (per `CLAUDE.md`).
- Support both `data-theme="dark"` (default) and `data-theme="light"` — style with `tokens.css` custom properties (`--accent`, `--text`, etc.), never hardcoded colors, so the new UI matches the rest of the app in both themes.
- Available fonts are exactly the two vendored families: `"Public Sans"` and `"JetBrains Mono"` (per `static/fonts/` and the spec's explicit out-of-scope note — no font vendoring changes).

---

## File Structure

- **Create `static/ui-settings-row.js`** — `UI.settingsRow(container, {label, value, valueFontFamily, onClick})`. Generic clickable row: label left, value + chevron-right on the right, value optionally styled in `valueFontFamily`. Returns `setValue(value, valueFontFamily)`.
- **Create `static/css/components/settings-row.css`** — `.settings-row`/`.settings-row-btn`/`.settings-row-label`/`.settings-row-value-group`/`.settings-row-value`/`.settings-row-chevron`.
- **Create `static/ui-sub-panel-header.js`** — `UI.subPanelHeader(container, {title, onBack})`. Generic back-chevron + title header for any drill-down view.
- **Create `static/css/components/sub-panel.css`** — `.sub-panel-header`/`.sub-panel-back`/`.sub-panel-title`/`.font-list`/`.font-list-row`/`.font-list-row-name`/`.font-list-apply-btn`.
- **Modify `static/index.html`** — remove the old FONT accordion + `<select>`; wrap `#panel-text`'s existing content in `#panel-text-main`; add `#panel-text-font` (header slot + `<ul id="text-font-list">`); add `<link>`/`<script>` tags for the two new files.
- **Modify `static/editor.js`** — `AVAILABLE_FONTS` constant, `fontPreviewValue` state, `openFontPanel`/`previewFont`/`applyFont`/`renderFontList`/`renderFontRow` functions, reset logic inside `renderTextPanel()`, removal of the old `#text-font` select wiring and `UI.accordion` call for the FONT header.
- **Modify `CLAUDE.md`** — update the `static/index.html`, `static/editor.js`, and inventory entries to describe the new Font Family row/drill-down instead of the FONT accordion (the file's "Inventory" and "File structure" sections are meant to stay current, per its own framing).

---

### Task 1: `UI.settingsRow` component + CSS

**Files:**
- Create: `static/ui-settings-row.js`
- Create: `static/css/components/settings-row.css`
- Modify: `static/index.html:14` (CSS link), `static/index.html:279` (script tag, alongside the other `ui-*.js` tags)

**Interfaces:**
- Produces: `window.UI.settingsRow(container, {label, value, valueFontFamily, onClick}) -> setValue(value, valueFontFamily)` — used by Task 4.

- [x] **Step 1: Create the CSS component**

Create `static/css/components/settings-row.css`:

```css
/* Clickable settings row: label left, value (optionally in a custom font) + chevron right. */
/* Exposes .settings-row/.settings-row-btn/.settings-row-label/.settings-row-value-group/.settings-row-value/.settings-row-chevron. Depends on tokens.css. */
.settings-row-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 40px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}
.settings-row-btn:hover .settings-row-value { color: var(--text); }
.settings-row-btn:hover .settings-row-chevron { color: var(--text); }

.settings-row-label {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.settings-row-value-group {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.settings-row-value {
  font-size: 14px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-row-chevron {
  flex-shrink: 0;
  color: var(--text-dim);
}
```

- [x] **Step 2: Add the CSS link to `index.html`**

In `static/index.html`, after line 15 (`<link rel="stylesheet" href="/static/css/components/accordion.css">`), add:

```html
<link rel="stylesheet" href="/static/css/components/settings-row.css">
```

- [x] **Step 3: Create the component**

Create `static/ui-settings-row.js`:

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .settings-row CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a clickable row into `container`: a label on the left, a value (optionally styled
// in valueFontFamily) plus a right-chevron on the right. onClick() fires on click.
// Returns a setValue(value, valueFontFamily) updater.
window.UI.settingsRow = function settingsRow(container, { label, value, valueFontFamily, onClick }) {
  container.innerHTML = "";
  container.classList.add("settings-row");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-row-btn";

  const labelEl = document.createElement("span");
  labelEl.className = "settings-row-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "settings-row-value";
  valueEl.textContent = value;
  if (valueFontFamily) valueEl.style.fontFamily = valueFontFamily;

  const valueGroup = document.createElement("span");
  valueGroup.className = "settings-row-value-group";
  valueGroup.innerHTML = '<svg class="settings-row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  valueGroup.prepend(valueEl);

  btn.append(labelEl, valueGroup);
  btn.addEventListener("click", () => onClick());
  container.appendChild(btn);

  return (v, fontFamily) => {
    valueEl.textContent = v;
    valueEl.style.fontFamily = fontFamily || "";
  };
};
```

- [x] **Step 4: Add the script tag to `index.html`**

In `static/index.html`, after the line `<script src="/static/ui-accordion.js"></script>`, add:

```html
<script src="/static/ui-settings-row.js"></script>
```

- [x] **Step 5: Manual verification**

This component has no consumer yet, so verify it loads without errors: start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000`, open the browser console, and confirm there are no script errors and `window.UI.settingsRow` is a function (type `UI.settingsRow` in the console — expect `[Function: settingsRow]`).

- [ ] **Step 6: Commit**

```bash
git add static/ui-settings-row.js static/css/components/settings-row.css static/index.html
git commit -m "feat: add UI.settingsRow component"
```

---

### Task 2: `UI.subPanelHeader` component + CSS

**Files:**
- Create: `static/ui-sub-panel-header.js`
- Create: `static/css/components/sub-panel.css`
- Modify: `static/index.html` (CSS link, script tag)

**Interfaces:**
- Produces: `window.UI.subPanelHeader(container, {title, onBack})` — used by Task 4. Also defines the `.font-list`/`.font-list-row`/`.font-list-row-name`/`.font-list-apply-btn` CSS classes Task 4's `renderFontList()` depends on.

- [ ] **Step 1: Create the CSS component**

Create `static/css/components/sub-panel.css`:

```css
/* Drill-down sub-panel: back-arrow + title header, plus the font-selection list it hosts. */
/* Exposes .sub-panel-header/.sub-panel-back/.sub-panel-title/.font-list/.font-list-row/.font-list-row-name/.font-list-apply-btn. Depends on tokens.css, button.css. */
.sub-panel-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  margin-bottom: var(--space-4);
}

.sub-panel-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}
.sub-panel-back:hover { color: var(--text); }

.sub-panel-title {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.font-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.font-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: 3px;
  margin-bottom: var(--space-1);
  background: var(--bg-2);
  border: 1px solid var(--border-soft);
  cursor: pointer;
}
.font-list-row:hover { border-color: var(--border-hover-color); }
.font-list-row.active { border-color: var(--accent); }

.font-list-row-name {
  font-size: 16px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-list-apply-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 10px;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Add the CSS link to `index.html`**

After the `settings-row.css` link added in Task 1, add:

```html
<link rel="stylesheet" href="/static/css/components/sub-panel.css">
```

- [ ] **Step 3: Create the component**

Create `static/ui-sub-panel-header.js`:

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .sub-panel-header CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a back-chevron button + title into `container`, for the header of any drill-down
// sub-panel view (a settings row's detail view). onBack() fires when the back button is clicked.
window.UI.subPanelHeader = function subPanelHeader(container, { title, onBack }) {
  container.innerHTML = "";
  container.classList.add("sub-panel-header");

  const back = document.createElement("button");
  back.type = "button";
  back.className = "sub-panel-back";
  back.setAttribute("aria-label", "Back");
  back.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  back.addEventListener("click", () => onBack());

  const titleEl = document.createElement("span");
  titleEl.className = "sub-panel-title";
  titleEl.textContent = title;

  container.append(back, titleEl);
};
```

- [ ] **Step 4: Add the script tag to `index.html`**

After the `ui-settings-row.js` script tag added in Task 1, add:

```html
<script src="/static/ui-sub-panel-header.js"></script>
```

- [ ] **Step 5: Manual verification**

Reload the page in the browser, check the console for errors, and confirm `typeof UI.subPanelHeader === "function"` in the console.

- [ ] **Step 6: Commit**

```bash
git add static/ui-sub-panel-header.js static/css/components/sub-panel.css static/index.html
git commit -m "feat: add UI.subPanelHeader component"
```

---

### Task 3: Restructure `#panel-text` markup

**Files:**
- Modify: `static/index.html:170-272` (the `#panel-text` block)

**Interfaces:**
- Consumes: nothing new (pure markup change).
- Produces: `#panel-text-main` (wraps the existing TEXT content), `#panel-text-font` (new, hidden by default, contains `#text-font-subpanel-header` mount div + `<ul id="text-font-list">`), `#text-font-row` (mount div for `UI.settingsRow`) — all consumed by Task 4.

- [ ] **Step 1: Replace the `#panel-text` block**

In `static/index.html`, replace the entire block from `<div id="panel-text" class="context-panel" hidden>` (line 170) through its matching closing `</div>` (line 272) with:

```html
      <div id="panel-text" class="context-panel" hidden>
        <div id="panel-text-main">
          <div class="style-panel-header">TEXT</div>

          <div class="style-group">
            <textarea id="text-heading" placeholder="Heading" rows="3"></textarea>
          </div>

          <div class="style-group">
            <div id="text-font-row"></div>
          </div>

          <button id="text-misc-header" class="accordion-header" type="button" aria-expanded="false">
            MISC
            <svg class="accordion-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <div id="text-misc-body" class="accordion-body" hidden>

            <div class="style-group-label">TIME</div>
            <div class="style-group">
              <div class="style-row">
                <label id="text-start-field"></label>
                <label id="text-end-field"></label>
              </div>
            </div>

            <div class="style-divider"></div>

            <div class="style-group-label">STYLE</div>
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

            <div class="style-group">
              <div class="style-row style-row-tight">
                <label class="style-checkbox"><input id="text-box" type="checkbox"> Box</label>
              </div>
              <div id="text-box-color-field"></div>
            </div>

            <div class="style-divider"></div>

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
        </div>

        <div id="panel-text-font" hidden>
          <div id="text-font-subpanel-header"></div>
          <ul id="text-font-list" class="font-list"></ul>
        </div>
      </div>
    </aside>
  </main>
</div>
```

Note: everything inside `#panel-text-main` is unchanged from the original except the FONT accordion (removed) and the new `#text-font-row` div in its place. `#panel-text-font` is new.

- [ ] **Step 2: Manual verification**

Reload the page. Select the text block (click its TEXT timeline row or however the panel is opened in this app) and confirm the TEXT panel still renders (it will look slightly broken until Task 4 wires `#text-font-row` and `#panel-text-font` — that's expected at this point). Confirm no console errors from missing `#text-font`/`#text-font-header` elements yet (Task 4 removes those references in the same commit sequence, so a transient error here is fine to note but not required to fix before committing this task, since Task 4 immediately follows).

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "refactor: restructure panel-text markup for Font Family drill-down"
```

---

### Task 4: Wire `editor.js` state and behavior

**Files:**
- Modify: `static/editor.js:1-20` (add `AVAILABLE_FONTS` + `fontPreviewValue` near the top, with the other module-level state)
- Modify: `static/editor.js:77-163` (replace `renderTextPanel`'s font line, remove the old `#text-font` change listener and its `UI.accordion` wiring, add the new functions)

**Interfaces:**
- Consumes: `UI.settingsRow` (Task 1), `UI.subPanelHeader` (Task 2), `#text-font-row`/`#panel-text-main`/`#panel-text-font`/`#text-font-subpanel-header`/`#text-font-list` (Task 3), `ensureTextBlock()`, `ensureTextPreset(id)`, `saveProject()`, `Preview.renderText(project, presets, timelineTime)`, `Preview.currentTimelineTime()` (all pre-existing in `editor.js`/`preview.js`).
- Produces: `AVAILABLE_FONTS` (array of strings), `renderFontRow()`, `renderFontList()`, `openFontPanel()`, `previewFont(fontName)`, `applyFont(fontName)` — all module-level in `editor.js`, no other task depends on them.

- [ ] **Step 1: Add module-level state**

In `static/editor.js`, after line 6 (`let selectedMediaId = null; ...`), add:

```js
const AVAILABLE_FONTS = ["Public Sans", "JetBrains Mono"]; // the only vendored font families (static/fonts/)
let fontPreviewValue = null; // font being live-previewed in the Font Family drill-down view; null when not open
let fontRowSetValue = null; // updater returned by UI.settingsRow, set once wireFontRow() runs
```

- [ ] **Step 2: Replace the old font-select line in `renderTextPanel`**

In `static/editor.js`, find this line inside `renderTextPanel()`:

```js
  document.getElementById("text-font").value = preset.font;
```

Replace it with:

```js
  renderFontRow();
```

- [ ] **Step 3: Add the reset-to-main-view line in `renderTextPanel`**

At the very top of `renderTextPanel()` (immediately after the `function renderTextPanel() {` line), add:

```js
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-main").hidden = false;
  fontPreviewValue = null;
```

This is the single choke point that discards any unsaved font preview whenever the TEXT panel is (re)opened or the selection changes — covering "back without apply" and "navigated away entirely", since `renderTextPanel()` is already called on every such transition (verify this by checking the existing call sites of `renderTextPanel()` — it's called from `showPanel`/selection-change code and at module init; no new call sites are needed).

- [ ] **Step 4: Remove the old `#text-font` change listener**

In `static/editor.js`, delete this block entirely:

```js
document.getElementById("text-font").addEventListener("change", async () => {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  preset.font = document.getElementById("text-font").value;
  await saveProject();
  renderTextPreview();
});
```

- [ ] **Step 5: Remove the FONT accordion wiring**

In `static/editor.js`, delete this line:

```js
UI.accordion(document.getElementById("text-font-header"), document.getElementById("text-font-body"), { expanded: false });
```

(Keep the `UI.accordion(document.getElementById("text-misc-header"), ...)` line right below it — MISC is unaffected.)

- [ ] **Step 6: Add the font row + drill-down functions**

In `static/editor.js`, after the `wireTextStyleToggle(...)` calls (right after the three `wireTextStyleToggle("text-bold"/"text-italic"/"text-underline", ...)` lines, before the `clampTrim` function), add:

```js
function renderFontRow() {
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

function openFontPanel() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  fontPreviewValue = preset.font;
  renderFontList();
  document.getElementById("panel-text-main").hidden = true;
  document.getElementById("panel-text-font").hidden = false;
}

function closeFontPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-main").hidden = false;
}

function previewFont(fontName) {
  fontPreviewValue = fontName;
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  const previewPresets = { ...project.text_presets, [preset.id]: { ...preset, font: fontName } };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
  renderFontList();
}

async function applyFont(fontName) {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  preset.font = fontName;
  await saveProject();
  fontPreviewValue = null;
  renderFontRow();
  renderTextPreview();
  closeFontPanel();
}

function renderFontList() {
  const listEl = document.getElementById("text-font-list");
  listEl.innerHTML = "";
  for (const fontName of AVAILABLE_FONTS) {
    const li = document.createElement("li");
    li.className = "font-list-row" + (fontName === fontPreviewValue ? " active" : "");
    li.addEventListener("click", () => previewFont(fontName));

    const nameEl = document.createElement("span");
    nameEl.className = "font-list-row-name";
    nameEl.style.fontFamily = fontName;
    nameEl.textContent = fontName;
    li.appendChild(nameEl);

    if (fontName === fontPreviewValue) {
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      UI.button(applyBtn, { variant: "accent" });
      applyBtn.classList.add("font-list-apply-btn");
      applyBtn.textContent = "Apply";
      applyBtn.addEventListener("click", (e) => { e.stopPropagation(); applyFont(fontName); });
      li.appendChild(applyBtn);
    }

    listEl.appendChild(li);
  }
}

UI.subPanelHeader(document.getElementById("text-font-subpanel-header"), { title: "Font Family", onBack: closeFontPanel });
```

- [ ] **Step 7: Manual verification — reload and exercise the full flow**

Start the dev server if not already running (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000`, open the browser console (watch for errors throughout), then:

1. Select the text block so the TEXT panel opens. Confirm the "Font Family" row shows, with the current font name rendered in that font, and a right-chevron.
2. Click the row. Confirm the panel swaps to a "Font Family" header (with a back arrow) and a list of two rows: "Public Sans" (rendered in Public Sans) and "JetBrains Mono" (rendered in JetBrains Mono).
3. Click the row that is NOT the currently-applied font. Confirm: the row gets highlighted (`.active`), an "Apply" button appears on it, and the canvas text immediately re-renders in the new font (live preview).
4. Click a different font row without applying. Confirm the Apply button moves to the newly-clicked row and the canvas preview updates to that font.
5. Click "Apply". Confirm the panel navigates back to the TEXT view, the Font Family row now shows the newly-applied font, and the canvas still shows it.
6. Reload the page (or reselect the clip/text) and confirm the applied font persisted (i.e. it was actually saved, not just previewed).
7. Open the Font Family view again, click a different font to preview it (canvas changes), then click the back arrow instead of Apply. Confirm the canvas and the Font Family row both revert to the previously-saved font (the preview was discarded).
8. Confirm the MISC accordion (heading, size, color, align, position, etc.) still works exactly as before — unaffected by this change.

- [ ] **Step 8: Commit**

```bash
git add static/editor.js
git commit -m "feat: wire Font Family drill-down state and behavior in editor.js"
```

---

### Task 5: Update `CLAUDE.md` inventory

**Files:**
- Modify: `CLAUDE.md:32` (the `static/index.html` line in the "File structure" tree)
- Modify: `CLAUDE.md:78` (the `static/css/components/style-panel.css` bullet under "Inventory")
- Modify: `CLAUDE.md:79` (the `static/editor.js` bullet under "Inventory")

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (documentation only).

- [ ] **Step 1: Update the `static/index.html` File structure line**

In `CLAUDE.md`, find this exact clause on line 32:

```
the TEXT context-panel section (`#panel-text`) has a `#text-misc-header`/`#text-misc-body` accordion (wired via `UI.accordion`, added 2026-07-15) collapsing everything below the heading textarea into a MISC section, collapsed by default
```

Replace it with:

```
the TEXT context-panel section (`#panel-text`) has a "Font Family" settings row (`UI.settingsRow`, `static/ui-settings-row.js`) below the heading textarea that opens a full-panel drill-down list of fonts (`UI.subPanelHeader`, `static/ui-sub-panel-header.js`, plus `#panel-text-font`/`#text-font-list` in `editor.js`, added 2026-07-17), and a `#text-misc-header`/`#text-misc-body` accordion (wired via `UI.accordion`, added 2026-07-15) collapsing everything below the Font Family row into a MISC section, collapsed by default
```

- [ ] **Step 2: Update the `static/css/components/style-panel.css` Inventory bullet**

In `CLAUDE.md` line 78, find this exact clause:

```
a multiline `#text-heading` `<textarea>`, TIME, STYLE — Word-toolbar-style FONT `<select>` + SIZE `UI.numberField` + Bold/Italic/Underline `.icon-btn` toggles (SVG icons) — TEXT ALIGN, POSITION; added 2026-07-14
```

Replace it with:

```
a multiline `#text-heading` `<textarea>`, a "Font Family" settings row (`UI.settingsRow`) opening a full-panel font drill-down list (`.font-list`, `static/css/components/sub-panel.css`, added 2026-07-17), TIME, STYLE — SIZE `UI.numberField` + Bold/Italic/Underline `.icon-btn` toggles (SVG icons) — TEXT ALIGN, POSITION; added 2026-07-14
```

- [ ] **Step 3: Update the `static/editor.js` Inventory bullet**

In `CLAUDE.md` line 79, find this exact clause:

```
`renderTextPanel()` (populate controls + button groups from state on load, incl. FONT select, SIZE `UI.numberField`, and `wireTextStyleToggle(id, prop)` for the Bold/Italic/Underline buttons' `aria-pressed` state)
```

Replace it with:

```
`renderTextPanel()` (populate controls + button groups from state on load, incl. the Font Family row via `renderFontRow()`, SIZE `UI.numberField`, and `wireTextStyleToggle(id, prop)` for the Bold/Italic/Underline buttons' `aria-pressed` state; also resets `#panel-text` to its main view and discards any unsaved font preview on every call), `renderFontRow()`/`openFontPanel()`/`previewFont()`/`applyFont()`/`renderFontList()` (Font Family settings row + drill-down list: live-previews a font via a shallow-cloned presets map before an explicit Apply persists it, added 2026-07-17)
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md inventory for Font Family drill-down"
```

---

### Task 6: Finish the development branch

- [ ] **Step 1: Run `superpowers:finishing-a-development-branch`**

Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate this work (merge, PR, or cleanup), now that Tasks 1-5 are complete and manually verified.
