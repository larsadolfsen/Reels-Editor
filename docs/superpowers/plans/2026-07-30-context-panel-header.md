# Context-Panel Header Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every one of the ten right-hand context panels (`#panel-*` inside `#style-panel`) shows a type icon + label header, built through the shared `UI.contextPanelHeader` component, instead of the current mix of a static small-caps "eyebrow" label (six panels) and the newer icon+filename style (three panels, VIDEO/IMAGE BOX/AUDIO), with a fourth panel (VIDEO BOX) still unconverted.

**Architecture:** `UI.contextPanelHeader(container, {icon, label})` (`static/ui-context-panel-header.js`) already exists and is idempotent — safe to call once (static-label panels) or on every `render()` (file-backed panels). This plan wires it into the remaining seven panels, folds its one-off CSS modifier into the base `.context-panel-header` class since every header now uses the same layout, and adjusts three already-converted panels' icon/label choices per final review.

**Tech Stack:** Vanilla JS (no build step), plain CSS, `node --test` for the frontend test suite.

## Global Constraints

- No hand-inlined `<svg>` markup anywhere — icons only via `UI.icon(name, {size})` (enforced by `tests/js/no-raw-svg.test.js`).
- No inline `style="..."` attributes in `index.html` or JS-rendered markup — styling lives in `static/css/**`.
- Every `static/*.js` file opens with a 1-2 line header comment stating its purpose.
- Reusable JS logic — one component/function per file (project convention).
- Run `node --test "tests/js/**/*.test.js"` after every task; it must stay green (214 tests passing before this plan starts).
- This is a live-verify-on-a-throwaway-project codebase: the final task's browser check must use a newly created test project, never real project data, and must delete that project when done.

---

### Task 1: Add the `clapperboard` icon

**Files:**
- Modify: `static/ui-icon.js` (add one `ICON_PATHS` entry, near the existing `video`/`music` entries around line 61-63)
- Test: `tests/js/ui-icon.test.js`

**Interfaces:**
- Produces: `UI.icon("clapperboard", { size })` — usable by Task 10.

- [ ] **Step 1: Write the failing test**

Add to `tests/js/ui-icon.test.js`, after the existing `"UI.icon embeds the icon-specific path data"` test:

```js
test("UI.icon embeds the clapperboard icon's path data", () => {
  assert.match(global.UI.icon("clapperboard"), /M20.2 6 3 11l-.9-2.4/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/ui-icon.test.js`
Expected: FAIL — the new test throws `unknown icon: clapperboard` (or similar), since `UI.icon` doesn't recognize the name yet.

- [ ] **Step 3: Add the icon entry**

In `static/ui-icon.js`, find this block (around line 61-63):

```js
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  "audio-lines": '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
```

Add a new line directly after it:

```js
  clapperboard: '<path d="m12.296 3.464 3.02 3.956"/><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m6.18 5.276 3.1 3.899"/>',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/ui-icon.test.js`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests (214 existing + 1 new), 0 failures.

- [ ] **Step 6: Commit**

```bash
git add static/ui-icon.js tests/js/ui-icon.test.js
git commit -m "Add clapperboard icon"
```

---

### Task 2: Fold the header-icon CSS into the base class

**Files:**
- Modify: `static/css/components/style-panel.css`
- Modify: `static/ui-context-panel-header.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `.context-panel-header` now carries the flex/icon/label layout directly — no separate `.context-panel-header-file` modifier class exists after this task. Every later task's `UI.contextPanelHeader` calls rely on this.

- [ ] **Step 1: Update the CSS**

In `static/css/components/style-panel.css`, find:

```css
.context-panel-header {
  margin-bottom: var(--space-4);
}

.context-panel-header-file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.context-panel-header-icon {
  display: flex;
  flex: none;
  color: var(--text-tertiary);
}
.context-panel-header-label {
  font-size: var(--fs-md);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Replace it with:

```css
.context-panel-header {
  margin-bottom: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.context-panel-header-icon {
  display: flex;
  flex: none;
  color: var(--text-tertiary);
}
.context-panel-header-label {
  font-size: var(--fs-md);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 2: Update the component to stop adding the retired modifier class**

In `static/ui-context-panel-header.js`, replace the entire file with:

```js
// UI.contextPanelHeader(container, {icon, label}): every context-panel's title row — a type icon
// beside a label. For static panels the label is fixed (e.g. "Settings"); for file-backed panels
// (VIDEO, VIDEO BOX, IMAGE BOX, AUDIO) it becomes the selected item's file name once one is
// picked. Idempotent, safe to call every render() (or just once, for static panels).
window.UI = window.UI || {};

UI.contextPanelHeader = function contextPanelHeader(container, { icon, label }) {
  let iconEl = container.querySelector(".context-panel-header-icon");
  let labelEl = container.querySelector(".context-panel-header-label");
  if (!iconEl) {
    iconEl = document.createElement("span");
    iconEl.className = "context-panel-header-icon";
    labelEl = document.createElement("span");
    labelEl.className = "context-panel-header-label";
    container.append(iconEl, labelEl);
  }
  iconEl.innerHTML = icon;
  labelEl.textContent = label;
};
```

- [ ] **Step 3: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures (this component has no dedicated unit test — it's a thin DOM builder, verified live in the browser per this codebase's established convention for `style-section-*.js`/`ui-settings-row.js`/etc.).

- [ ] **Step 4: Commit**

```bash
git add static/css/components/style-panel.css static/ui-context-panel-header.js
git commit -m "Fold context-panel header layout into the base class"
```

---

### Task 3: Convert the FILES panel header

**Files:**
- Modify: `static/index.html` (the `#panel-files-header` div, around line 130)
- Modify: `static/panel-media.js`

**Interfaces:**
- Consumes: `UI.contextPanelHeader` (Task 2), `UI.icon("file", ...)` (already exists).

- [ ] **Step 1: Update the header markup**

In `static/index.html`, find:

```html
      <div id="panel-files" class="context-panel">
        <div id="panel-files-header" class="context-panel-header text-eyebrow">FILES</div>
```

Replace with:

```html
      <div id="panel-files" class="context-panel">
        <div id="panel-files-header" class="context-panel-header"></div>
```

(The `#panel-files-header` id is load-bearing — `style-panel.css` has `#style-panel.collapsed #panel-files:not([hidden]) #panel-files-header { display: none; }`. Keep the id exactly as-is.)

- [ ] **Step 2: Wire the header in panel-media.js**

In `static/panel-media.js`, find the top of the IIFE:

```js
(() => {
  let selectedMediaId = null; // MEDIA panel row highlight only — independent of timeline `selected`
  const silentCache = {}; // media id -> bool, avoids re-fetching peaks on every render
  const SILENCE_THRESHOLD = 0.02;

  const MUTED_ICON_SVG = UI.icon("volume-x", { size: 11 });
```

Add a header wiring call right after the `MUTED_ICON_SVG` line:

```js
(() => {
  let selectedMediaId = null; // MEDIA panel row highlight only — independent of timeline `selected`
  const silentCache = {}; // media id -> bool, avoids re-fetching peaks on every render
  const SILENCE_THRESHOLD = 0.02;

  const MUTED_ICON_SVG = UI.icon("volume-x", { size: 11 });

  UI.contextPanelHeader(document.getElementById("panel-files-header"), { icon: UI.icon("file", { size: 18 }), label: "Files" });
```

- [ ] **Step 3: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 4: Syntax-check the edited files**

Run: `node --check static/panel-media.js`
Expected: no output (valid syntax).

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-media.js
git commit -m "Give the FILES panel an icon+label header"
```

---

### Task 4: Convert the TEXT panel header

**Files:**
- Modify: `static/index.html` (around line 531)
- Modify: `static/panel-text.js`

**Interfaces:**
- Consumes: `UI.contextPanelHeader` (Task 2), `UI.icon("type", ...)` (already exists).

- [ ] **Step 1: Update the header markup**

In `static/index.html`, find:

```html
      <div id="panel-text" class="context-panel" hidden>
        <div id="panel-text-main" class="context-panel-body">
          <div class="context-panel-header text-eyebrow">TEXT</div>
```

Replace with:

```html
      <div id="panel-text" class="context-panel" hidden>
        <div id="panel-text-main" class="context-panel-body">
          <div id="text-header" class="context-panel-header"></div>
```

- [ ] **Step 2: Wire the header in panel-text.js**

In `static/panel-text.js`, find:

```js
UI.tabBar(document.getElementById("text-tab-bar"), TEXT_TABS, activeTextTab, showTextTab);
showTextTab(activeTextTab);
```

Add a header wiring call right after it:

```js
UI.tabBar(document.getElementById("text-tab-bar"), TEXT_TABS, activeTextTab, showTextTab);
showTextTab(activeTextTab);

UI.contextPanelHeader(document.getElementById("text-header"), { icon: UI.icon("type", { size: 18 }), label: "Text" });
```

- [ ] **Step 3: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 4: Syntax-check the edited file**

Run: `node --check static/panel-text.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-text.js
git commit -m "Give the TEXT panel an icon+label header"
```

---

### Task 5: Convert the CAPTIONS panel header

**Files:**
- Modify: `static/index.html` (around line 251)
- Modify: `static/panel-captions.js`

**Interfaces:**
- Consumes: `UI.contextPanelHeader` (Task 2), `UI.icon("captions", ...)` (already exists).

- [ ] **Step 1: Update the header markup**

In `static/index.html`, find:

```html
      <div id="panel-captions" class="context-panel" hidden>
        <div id="panel-captions-main">
          <div class="context-panel-header text-eyebrow">CAPTIONS</div>
```

Replace with:

```html
      <div id="panel-captions" class="context-panel" hidden>
        <div id="panel-captions-main">
          <div id="captions-header" class="context-panel-header"></div>
```

- [ ] **Step 2: Wire the header in panel-captions.js**

In `static/panel-captions.js`, find:

```js
UI.tabBar(document.getElementById("caption-tab-bar"), CAPTION_TABS, activeCaptionTab, showCaptionTab);
showCaptionTab(activeCaptionTab);
```

Add a header wiring call right after it:

```js
UI.tabBar(document.getElementById("caption-tab-bar"), CAPTION_TABS, activeCaptionTab, showCaptionTab);
showCaptionTab(activeCaptionTab);

UI.contextPanelHeader(document.getElementById("captions-header"), { icon: UI.icon("captions", { size: 18 }), label: "Captions" });
```

- [ ] **Step 3: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 4: Syntax-check the edited file**

Run: `node --check static/panel-captions.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-captions.js
git commit -m "Give the CAPTIONS panel an icon+label header"
```

---

### Task 6: Convert the SETTINGS panel header (new panel-settings.js)

**Files:**
- Create: `static/panel-settings.js`
- Modify: `static/index.html` (the `#panel-settings` header, around line 336, plus a new `<script>` tag)
- Modify: `CLAUDE.md` (File structure tree — new file entry)

**Interfaces:**
- Consumes: `UI.contextPanelHeader` (Task 2), `UI.icon("settings", ...)` (already exists).
- Produces: nothing consumed by later tasks — SETTINGS has no other dynamic content.

- [ ] **Step 1: Update the header markup**

In `static/index.html`, find:

```html
      <div id="panel-settings" class="context-panel" hidden>
        <div class="context-panel-header text-eyebrow">SETTINGS</div>
```

Replace with:

```html
      <div id="panel-settings" class="context-panel" hidden>
        <div id="settings-header" class="context-panel-header"></div>
```

- [ ] **Step 2: Create panel-settings.js**

Create `static/panel-settings.js` with this exact content:

```js
// #panel-settings context-panel header wiring. The panel's one control (the dark/light theme
// toggle) is wired inline in editor.js — this file exists only so the header follows the same
// UI.contextPanelHeader pattern every other context panel uses.
UI.contextPanelHeader(document.getElementById("settings-header"), { icon: UI.icon("settings", { size: 18 }), label: "Settings" });
```

- [ ] **Step 3: Load the new script**

In `static/index.html`, find:

```html
<script src="/static/panel-export.js"></script>
```

Add the new script tag right after it:

```html
<script src="/static/panel-export.js"></script>
<script src="/static/panel-settings.js"></script>
```

- [ ] **Step 4: Update the CLAUDE.md file structure tree**

In `CLAUDE.md`, find the line for `panel-export.js` inside the `static/` file tree (search for `panel-export.js          # EXPORT context-panel section`), and add a new line directly after it:

```
  panel-settings.js        # SETTINGS context-panel header wiring only (added 2026-07-30, context-panel-header feature) — the panel's one control (theme toggle) stays wired inline in editor.js; this file exists solely to give SETTINGS the same UI.contextPanelHeader treatment every other context panel has
```

- [ ] **Step 5: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 6: Syntax-check the new file**

Run: `node --check static/panel-settings.js`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/panel-settings.js CLAUDE.md
git commit -m "Add SETTINGS panel header via new panel-settings.js"
```

---

### Task 7: Convert the EXPORT panel header

**Files:**
- Modify: `static/index.html` (around line 354)
- Modify: `static/panel-export.js`

**Interfaces:**
- Consumes: `UI.contextPanelHeader` (Task 2), `UI.icon("upload", ...)` (already exists — matches the rail's EXPORT icon).

- [ ] **Step 1: Update the header markup**

In `static/index.html`, find:

```html
      <div id="panel-export" class="context-panel" hidden>
        <div class="context-panel-header text-eyebrow">EXPORT</div>
```

Replace with:

```html
      <div id="panel-export" class="context-panel" hidden>
        <div id="export-header" class="context-panel-header"></div>
```

- [ ] **Step 2: Wire the header in panel-export.js**

In `static/panel-export.js`, find:

```js
window.ExportPanel = window.ExportPanel || {};

(() => {
  function defaultFilename() {
```

Replace with:

```js
window.ExportPanel = window.ExportPanel || {};

(() => {
  UI.contextPanelHeader(document.getElementById("export-header"), { icon: UI.icon("upload", { size: 18 }), label: "Export" });

  function defaultFilename() {
```

- [ ] **Step 3: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 4: Syntax-check the edited file**

Run: `node --check static/panel-export.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-export.js
git commit -m "Give the EXPORT panel an icon+label header"
```

---

### Task 8: Convert the PROJECTS panel header

**Files:**
- Modify: `static/index.html` (around line 376)
- Modify: `static/panel-projects.js`

**Interfaces:**
- Consumes: `UI.contextPanelHeader` (Task 2), `UI.icon("layout-grid", ...)` (already exists — matches the rail's PROJECTS icon).

- [ ] **Step 1: Update the header markup**

In `static/index.html`, find:

```html
      <div id="panel-projects" class="context-panel" hidden>
        <div class="context-panel-header text-eyebrow">PROJECTS</div>
```

Replace with:

```html
      <div id="panel-projects" class="context-panel" hidden>
        <div id="projects-header" class="context-panel-header"></div>
```

- [ ] **Step 2: Wire the header in panel-projects.js**

In `static/panel-projects.js`, find:

```js
window.ProjectsPanel = window.ProjectsPanel || {};

(() => {
  async function render(currentProjectId, callbacks) {
```

Replace with:

```js
window.ProjectsPanel = window.ProjectsPanel || {};

(() => {
  UI.contextPanelHeader(document.getElementById("projects-header"), { icon: UI.icon("layout-grid", { size: 18 }), label: "Projects" });

  async function render(currentProjectId, callbacks) {
```

- [ ] **Step 3: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 4: Syntax-check the edited file**

Run: `node --check static/panel-projects.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-projects.js
git commit -m "Give the PROJECTS panel an icon+label header"
```

---

### Task 9: Convert the VIDEO BOX panel header

**Files:**
- Modify: `static/index.html` (around lines 383-392)
- Modify: `static/panel-video-box.js`

**Interfaces:**
- Consumes: `UI.contextPanelHeader` (Task 2), `UI.icon("picture-in-picture", ...)` (already exists).
- Produces: nothing new — mirrors the existing IMAGE BOX pattern exactly (`static/panel-image-box.js`).

- [ ] **Step 1: Update the header markup and remove the now-redundant name row**

In `static/index.html`, find:

```html
      <div id="panel-video-box" class="context-panel" hidden>
        <div class="context-panel-header text-eyebrow">VIDEO BOX</div>
        <div class="style-group">
          <button id="video-box-add" class="col-8" data-button data-button-intent="dashed" data-button-icon="plus" hidden>ADD VIDEO BOX</button>
        </div>
        <div id="video-box-picker" hidden>
          <ul id="video-box-picker-list" class="font-list scroll-list"></ul>
        </div>
        <div id="video-box-detail" class="context-panel-body" hidden>
          <div id="video-box-name" class="context-panel-name"></div>

          <div id="video-box-tab-bar"></div>
```

Replace with:

```html
      <div id="panel-video-box" class="context-panel" hidden>
        <div id="video-box-header" class="context-panel-header"></div>
        <div class="style-group">
          <button id="video-box-add" class="col-8" data-button data-button-intent="dashed" data-button-icon="plus" hidden>ADD VIDEO BOX</button>
        </div>
        <div id="video-box-picker" hidden>
          <ul id="video-box-picker-list" class="font-list scroll-list"></ul>
        </div>
        <div id="video-box-detail" class="context-panel-body" hidden>
          <div id="video-box-tab-bar"></div>
```

- [ ] **Step 2: Add the header icon constant**

In `static/panel-video-box.js`, find:

```js
(() => {
  const VIDEO_BOX_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
```

Replace with:

```js
(() => {
  const VIDEO_BOX_HEADER_ICON = UI.icon("picture-in-picture", { size: 18 });
  const VIDEO_BOX_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
```

- [ ] **Step 3: Remove the old name-row line from renderDetail**

In `static/panel-video-box.js`, find:

```js
  function renderDetail(box) {
    document.getElementById("video-box-name").textContent = box.file_path.split(/[\\/]/).pop();
    const media = findMedia(box);
```

Replace with:

```js
  function renderDetail(box) {
    const media = findMedia(box);
```

- [ ] **Step 4: Set the header from render(selectedId)**

In `static/panel-video-box.js`, find:

```js
  function render(selectedId) {
    document.getElementById("video-box-add").onclick = renderPicker;
    const box = selectedId ? project.video_boxes.find((b) => b.id === selectedId) : null;
    document.getElementById("video-box-picker").hidden = !!box;
    document.getElementById("video-box-detail").hidden = !box;
    if (!box) {
```

Replace with:

```js
  function render(selectedId) {
    document.getElementById("video-box-add").onclick = renderPicker;
    const box = selectedId ? project.video_boxes.find((b) => b.id === selectedId) : null;
    UI.contextPanelHeader(document.getElementById("video-box-header"), {
      icon: VIDEO_BOX_HEADER_ICON,
      label: box ? box.file_path.split(/[\\/]/).pop() : "Video",
    });
    document.getElementById("video-box-picker").hidden = !!box;
    document.getElementById("video-box-detail").hidden = !box;
    if (!box) {
```

- [ ] **Step 5: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 6: Syntax-check the edited file**

Run: `node --check static/panel-video-box.js`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/panel-video-box.js
git commit -m "Give the VIDEO BOX panel a file-name header, mirroring IMAGE BOX"
```

---

### Task 10: Final icon/label adjustments on VIDEO, IMAGE BOX, AUDIO

**Files:**
- Modify: `static/panel-video.js` (icon swap: `video` → `clapperboard`)
- Modify: `static/panel-image-box.js` (idle label: `"IMAGE BOX"` → `"Image"`)
- Modify: `static/panel-audio.js` (idle label: `"AUDIO"` → `"Audio"`)

**Interfaces:**
- Consumes: `UI.icon("clapperboard", ...)` (Task 1).

- [ ] **Step 1: Swap the VIDEO panel's header icon**

In `static/panel-video.js`, find:

```js
(() => {
  const VIDEO_HEADER_ICON = UI.icon("video", { size: 18 });
```

Replace with:

```js
(() => {
  const VIDEO_HEADER_ICON = UI.icon("clapperboard", { size: 18 });
```

- [ ] **Step 2: Update the IMAGE BOX idle label**

In `static/panel-image-box.js`, find:

```js
    UI.contextPanelHeader(document.getElementById("image-box-header"), {
      icon: IMAGE_BOX_HEADER_ICON,
      label: box ? box.file_path.split(/[\\/]/).pop() : "IMAGE BOX",
    });
```

Replace with:

```js
    UI.contextPanelHeader(document.getElementById("image-box-header"), {
      icon: IMAGE_BOX_HEADER_ICON,
      label: box ? box.file_path.split(/[\\/]/).pop() : "Image",
    });
```

- [ ] **Step 3: Update the AUDIO idle label**

In `static/panel-audio.js`, find:

```js
    UI.contextPanelHeader(document.getElementById("audio-header"), {
      icon: AUDIO_HEADER_ICON,
      label: music ? ((media && (media.name || media.file_path.split(/[\\/]/).pop())) || "Unknown file") : "AUDIO",
    });
```

Replace with:

```js
    UI.contextPanelHeader(document.getElementById("audio-header"), {
      icon: AUDIO_HEADER_ICON,
      label: music ? ((media && (media.name || media.file_path.split(/[\\/]/).pop())) || "Unknown file") : "Audio",
    });
```

- [ ] **Step 4: Run the full frontend suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 5: Syntax-check the edited files**

Run: `node --check static/panel-video.js && node --check static/panel-image-box.js && node --check static/panel-audio.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add static/panel-video.js static/panel-image-box.js static/panel-audio.js
git commit -m "Use clapperboard for MAIN video, title-case idle labels"
```

---

### Task 11: Update CLAUDE.md's remaining header documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.

- [ ] **Step 1: Update the ui-context-panel-header.js inventory line**

In `CLAUDE.md`, find the line (in the `static/` file structure tree, added after `ui-sub-panel-header.js`):

```
  ui-context-panel-header.js # UI.contextPanelHeader(container, {icon, label}) (added 2026-07-30, panel-header-file-name): builds/updates a context-panel's title row as a type icon + label, idempotent so a render() can call it every time; label starts as the panel's static name (e.g. "AUDIO") and becomes the selected item's file name once one is picked. Shared by panel-video.js/panel-image-box.js/panel-audio.js's headers (`#video-header`/`#image-box-header`/`#audio-header`) so each panel doesn't hand-roll its own icon+text header DOM; VIDEO BOX's header is unaffected (`#panel-video-box` still a static text-eyebrow label — not part of this feature)
```

Replace with:

```
  ui-context-panel-header.js # UI.contextPanelHeader(container, {icon, label}) (added 2026-07-30, context-panel-header feature; extended same day to all ten context panels): every `#panel-*`'s title row — a type icon + label, idempotent so a render() can call it every time (static-label panels call it once; VIDEO/VIDEO BOX/IMAGE BOX/AUDIO call it on every render() since their label is the selected item's file name, falling back to a static label like "Video" when nothing's selected). Icons match the left rail's icon for panels that have a rail entry (`panel-nav.js`); MAIN video clips use `clapperboard`, VIDEO BOX uses `picture-in-picture`, IMAGE BOX `image`, AUDIO `music` — chosen to stay visually distinct from each other. Wired from `panel-media.js`/`panel-text.js`/`panel-captions.js`/`panel-settings.js`/`panel-export.js`/`panel-projects.js` (static, one-time) and `panel-video.js`/`panel-video-box.js`/`panel-image-box.js`/`panel-audio.js` (dynamic, per render)
```

- [ ] **Step 2: Update the style-panel.css inventory line**

In `CLAUDE.md`, find:

```
`.context-panel`/`.context-panel-body`/`.panel-danger-footer` (added 2026-07-30, side-panel delete layout — see "Shared UI components" below) are the shared bottom-pinned-danger-button pattern every panel's Delete/Remove button now uses. `.context-panel-header-file`/`.context-panel-header-icon`/`.context-panel-header-label` (added 2026-07-30, panel-header-file-name) style `UI.contextPanelHeader`'s icon+label header row (VIDEO/IMAGE BOX/AUDIO panels).
```

Replace with:

```
`.context-panel`/`.context-panel-body`/`.panel-danger-footer` (added 2026-07-30, side-panel delete layout — see "Shared UI components" below) are the shared bottom-pinned-danger-button pattern every panel's Delete/Remove button now uses. `.context-panel-header`/`.context-panel-header-icon`/`.context-panel-header-label` (added 2026-07-30, context-panel-header feature) style `UI.contextPanelHeader`'s icon+label row — the layout lives directly on the base `.context-panel-header` class since every context panel uses it now (no separate modifier class).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md map for the unified context-panel header"
```

---

### Task 12: Live verification across all ten panels

**Files:** none (verification only).

- [ ] **Step 1: Run the full frontend suite one more time**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — 215 tests, 0 failures.

- [ ] **Step 2: Start the dev server preview**

Use the `preview_start` tool with `{name: "TikTok-Reels"}` (or the project's configured launch name) to open the app in the browser pane.

- [ ] **Step 3: Create a throwaway test project**

Never test on real project data. In the browser pane's JS console (via the browser tool's javascript_tool), create and switch to a fresh project:

```js
fetch('/api/projects', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:'QA Header Check'})}).then(r=>r.json()).then(p => { localStorage.setItem('projectId', p.id); return p.id; })
```

Then navigate to `http://localhost:8000` again to load it.

- [ ] **Step 4: Verify each static-label panel's header**

For PROJECTS, FILES, TEXT, CAPTIONS, SETTINGS, EXPORT: open each panel (via the left icon rail) and confirm, either visually (screenshot) or via the JS console, that `document.getElementById("<panel>-header").querySelector(".context-panel-header-label").textContent` reads the expected title-case label ("Projects", "Files", "Text", "Captions", "Settings", "Export") and that `.context-panel-header-icon` contains an `<svg>`.

- [ ] **Step 5: Verify the four dynamic panels' idle state**

In the JS console, with the fresh empty project loaded, confirm each idle label:

```js
(function(){
  AudioPanel.render();
  ImageBoxPanel.render(null);
  VideoBoxPanel.render(null);
  return JSON.stringify({
    audio: document.getElementById('audio-header').querySelector('.context-panel-header-label').textContent,
    imageBox: document.getElementById('image-box-header').querySelector('.context-panel-header-label').textContent,
    videoBox: document.getElementById('video-box-header').querySelector('.context-panel-header-label').textContent,
  });
})()
```

Expected: `{"audio":"Audio","imageBox":"Image","videoBox":"Video"}`.

- [ ] **Step 6: Verify the four dynamic panels' selected state**

In the JS console, push a fake media item + video box and re-render, mirroring the same check already done for IMAGE BOX earlier in this project's history:

```js
(function(){
  project.media_library.push({ id: 'mv1', file_path: 'C:/clips/holiday-trip.mp4', name: '', kind: 'video', duration: 5, has_audio: true });
  project.video_boxes.push({ id: 'vb1', media_id: 'mv1', file_path: 'C:/clips/holiday-trip.mp4', in_point: 0, out_point: 5, start: 0, x: 0, y: 0, width: 1080, height: 607, z_index: -1 });
  VideoBoxPanel.render('vb1');
  return document.getElementById('video-box-header').querySelector('.context-panel-header-label').textContent;
})()
```

Expected: `"holiday-trip.mp4"`.

- [ ] **Step 7: Clean up the throwaway project**

```js
fetch('/api/projects/' + project.id, { method: 'DELETE' }).then(r => r.status)
```

Expected: `204`.

- [ ] **Step 8: Stop the preview server**

Use the `preview_stop` tool with the server id returned by `preview_start`.

- [ ] **Step 9: No commit needed**

This task is verification-only — nothing to stage or commit. If any check in Steps 4-6 fails, fix the relevant task's code, re-run the frontend suite, and re-verify before proceeding.
