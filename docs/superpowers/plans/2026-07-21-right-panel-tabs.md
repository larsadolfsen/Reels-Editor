# Right Panel Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the right-panel's stacked accordions with a four-icon tab bar (Style/Design/Box/Time, plus a permanent Closed-caption tab on CAPTIONS) on TEXT, CAPTIONS, VIDEO, and VIDEO BOX — same controls, new sectioning, no new features.

**Architecture:** One new microcomponent (`UI.tabBar`, mirrors `UI.iconRail`'s single-select API) plus a per-panel restructure: each panel's existing accordion-body `<div>`s (ids unchanged) become tab panes toggled by `hidden`, replacing the `UI.accordionSection` header wrappers. All existing `text-panel-*.js`/`caption-panel-*.js` render functions are untouched — they still populate the same ids, wherever those ids now live in the DOM.

**Tech Stack:** Vanilla JS (no build step), hand-inlined Lucide SVG icons, existing CSS token/grid system (`tokens.css`, `style-panel.css`'s 8-column grid).

## Global Constraints

- No new controls of any kind — this is IA/layout only (per spec's Out of scope).
- Active tab is session-only module state, never persisted (per spec).
- No tabs on FILES/PROJECTS/SETTINGS/EXPORT/LAYERS (per spec).
- Icons: Lucide, hand-inlined `<path>`/`<rect>`/`<circle>`/`<line>` markup with the existing wrapper style (`viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`), per CLAUDE.md's icon convention.
- No inline `style="..."` attributes anywhere (CLAUDE.md rule) — all new visual rules go in `static/css/components/tab-bar.css`.
- Every new file gets a 2–3 line header comment (CLAUDE.md rule).
- Each batch (task group) below ends in its own commit; batches merge to main and push individually per the user's session habits — do not bundle batches into one commit.
- Untested layer: this is UI wiring only, same as the rest of the right panel. Per CLAUDE.md's "genuinely can't be test-covered" carve-out: no automated tests are added; every task's manual verification step is the substitute, run against a **throwaway project** (never real project data — the app's unload autosave will overwrite whatever's open). `pytest -q` must stay green throughout (no backend touched).

## Icons (verified against lucide.dev's raw SVG source 2026-07-21 — use verbatim, do not re-derive)

```
Style (paintbrush):
<path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/>

Design (pencil — already used verbatim as the media-rename icon in panel-media.js, reuse identically):
<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>

Box (vector-square):
<path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/><path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="2" y="2" width="5" height="5" rx="1"/>

Time (timer):
<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>

Closed-caption (captions):
<rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>
```

Each panel file inlines only the icon strings it needs, as its own local `const` (top-level for `panel-text.js`/`panel-captions.js` since they aren't IIFE-wrapped, so name them uniquely per file to avoid classic-script global-scope collisions; scoped inside the existing IIFE for `panel-video.js`/`panel-video-box.js`).

---

## Batch 1 — `UI.tabBar` component (no consumers yet)

### Task 1: `UI.tabBar` + `tab-bar.css`

**Files:**
- Create: `static/ui-tab-bar.js`
- Create: `static/css/components/tab-bar.css`
- Modify: `static/index.html` (add `<link>` + `<script>` tags, no markup changes yet)

**Interfaces:**
- Produces: `window.UI.tabBar(container, tabs, activeValue, onSelect)` where `tabs = [{value, icon, label}]` — renders one button per tab into `container` (`role="tablist"`, each button `role="tab"`, `aria-label` from `label`, `aria-selected` reflecting the active tab), calls `onSelect(value)` on click, returns a `setActive(value)` updater. Mirrors `UI.iconRail`'s shape (`static/ui-icon-rail.js`) and `UI.buttonGroup`'s single-select behavior (`static/ui-button-group.js`).

- [ ] **Step 1: Create `static/ui-tab-bar.js`**

```javascript
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .tab-bar CSS component. No app state — callers own the active tab and
// which panes it shows/hides.
window.UI = window.UI || {};

// Renders a horizontal row of icon tab buttons into `container`; exactly one active at a time.
// tabs: [{value, icon (inline SVG markup string), label}] — aria-label comes from `label`.
// onSelect(value) fires on click. Returns a setActive(value) updater (mirrors buttonGroup/iconRail).
window.UI.tabBar = function tabBar(container, tabs, activeValue, onSelect) {
  container.innerHTML = "";
  container.classList.add("tab-bar");
  container.setAttribute("role", "tablist");
  const buttons = tabs.map(({ value, icon, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-bar-btn";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-selected", String(value === activeValue));
    btn.dataset.value = value;
    btn.innerHTML = icon;
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.value === value)));
      onSelect(value);
    });
    container.appendChild(btn);
    return btn;
  });
  return (value) => buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.value === value)));
};
```

- [ ] **Step 2: Create `static/css/components/tab-bar.css`**

```css
/* Horizontal row of icon tab buttons at the top of a context-panel section, replacing the
   old stacked accordions. Exposes .tab-bar/.tab-bar-btn. Depends on tokens.css. Built by
   static/ui-tab-bar.js (UI.tabBar). */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border-soft);
  margin-bottom: var(--space-3);
}

.tab-bar-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2) 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-dim);
  cursor: pointer;
}

.tab-bar-btn svg { width: 18px; height: 18px; }

.tab-bar-btn:hover { color: var(--text-secondary); }

.tab-bar-btn[aria-selected="true"] {
  color: var(--text);
  border-bottom-color: var(--accent);
}
```

- [ ] **Step 3: Wire into `static/index.html`**

Add the stylesheet link next to the other component CSS (after `icon-rail.css`):

```html
<link rel="stylesheet" href="/static/css/components/icon-rail.css">
<link rel="stylesheet" href="/static/css/components/tab-bar.css">
```

Add the script tag next to the other `ui-*.js` includes (after `ui-icon-rail.js`):

```html
<script src="/static/ui-icon-rail.js"></script>
<script src="/static/ui-tab-bar.js"></script>
```

- [ ] **Step 4: Manual smoke test**

Run `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000` on a throwaway project, open the browser console. Confirm:
- Page loads with no console errors (component has no consumers yet, so nothing visibly changes).
- `pytest -q` stays green (no backend touched): `.venv/Scripts/python -m pytest -q`.

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, under "Shared UI components", add a line after the `ui-icon-rail.js` entry:

```
- `static/ui-tab-bar.js` — `UI.tabBar(container, tabs, activeValue, onSelect)`: horizontal row of icon tab buttons (Style/Design/Box/Time/Closed-caption), single-select, mirrors `UI.iconRail`'s API shape; replaces the per-panel `UI.accordionSection` stacks on TEXT/CAPTIONS/VIDEO/VIDEO BOX (see each panel's entry).
```

And in the `static/css/components/` bullet list, add `tab-bar.css` to the list of one-stylesheet-per-component files.

- [ ] **Step 6: Commit**

```bash
git add static/ui-tab-bar.js static/css/components/tab-bar.css static/index.html CLAUDE.md
git commit -m "feat: add UI.tabBar component (no consumers yet)"
```

---

## Batch 2 — TEXT panel

### Task 2: TEXT panel tab bar

**Files:**
- Modify: `static/index.html` (TEXT section, lines ~449–585)
- Modify: `static/panel-text.js` (lines 252–255, the four `UI.accordionSection` calls)
- Modify: `CLAUDE.md` (panel-text.js / index.html map entries)

**Interfaces:**
- Consumes: `window.UI.tabBar` (Task 1).
- Produces: nothing new consumed by later tasks — TEXT, CAPTIONS, VIDEO, VIDEO BOX are independent panels; each task only needs Task 1's `UI.tabBar`.

- [ ] **Step 1: Restructure `static/index.html`'s TEXT section**

Read `static/index.html` and locate the TEXT section (`#panel-text`, inside `#text-accordions`). It currently has four `UI.accordionSection` wrapper divs: `#text-style-accordion` (self-closing, immediately followed by the sibling `#text-style-body`), `#text-font-accordion` (wraps `#text-font-body` — opens before it, closes after it), `#text-box-accordion` (wraps `#text-box-body` the same way), and `#text-time-accordion` (self-closing, immediately followed by the sibling `#text-time-body`).

Edit it so that:
- `#text-style-accordion` is replaced by a single new `<div id="text-tab-bar"></div>`.
- `#text-font-accordion` and `#text-box-accordion` are deleted — remove their opening `<div id="...">` tag and its one matching closing `</div>` (the one that currently closes the wrapper, right after `#text-font-body`'s / `#text-box-body`'s own closing `</div>`). Do not touch `#text-font-body`/`#text-box-body`'s own opening/closing tags or anything inside them.
- `#text-time-accordion` is deleted with no replacement (its sibling `#text-time-body` is untouched).
- Nothing else in the TEXT section changes: `#text-empty-state`, every `#text-*-body` div's contents (all ids inside), the `#text-duplicate`/`#text-delete` buttons, and the three drill-down divs (`#panel-text-font`/`#panel-text-weight`/`#panel-text-style`) are byte-for-byte unchanged.

- [ ] **Step 2: Verify the resulting TEXT section**

Read back `static/index.html` and confirm the TEXT section (`#panel-text`) now has exactly this shape, with no orphaned accordion divs:

```html
<div id="panel-text" class="context-panel" hidden>
  <div id="panel-text-main">
    <div class="style-panel-header">TEXT</div>
    <div id="text-empty-state" class="style-group" hidden> ... </div>
    <div id="text-accordions">
    <div id="text-tab-bar"></div>

    <div id="text-style-body"> ... </div>

    <div id="text-font-body"> ... </div>

    <div id="text-box-body"> ... </div>

    <div id="text-time-body"> ... </div>

    <div class="style-group">
      <button id="text-duplicate" class="col-8" type="button">Duplicate text</button>
    </div>
    <div class="style-group">
      <button id="text-delete" class="col-8" type="button">Delete text</button>
    </div>
    </div>
  </div>
  <div id="panel-text-font" hidden> ... </div>
  <div id="panel-text-weight" hidden> ... </div>
  <div id="panel-text-style" hidden> ... </div>
</div>
```

- [ ] **Step 3: Replace the accordion wiring in `static/panel-text.js`**

Find:

```javascript
UI.accordionSection(document.getElementById("text-style-accordion"), document.getElementById("text-style-body"), { title: "STYLES", expanded: false });
UI.accordionSection(document.getElementById("text-font-accordion"), document.getElementById("text-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("text-box-accordion"), document.getElementById("text-box-body"), { title: "BOX", expanded: false });
UI.accordionSection(document.getElementById("text-time-accordion"), document.getElementById("text-time-body"), { title: "TIME", expanded: false });
```

Replace with:

```javascript
const TEXT_TAB_ICON_STYLE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/></svg>';
const TEXT_TAB_ICON_DESIGN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
const TEXT_TAB_ICON_BOX = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/><path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="2" y="2" width="5" height="5" rx="1"/></svg>';
const TEXT_TAB_ICON_TIME = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>';

const TEXT_TABS = [
  { value: "style", icon: TEXT_TAB_ICON_STYLE, label: "Style" },
  { value: "design", icon: TEXT_TAB_ICON_DESIGN, label: "Design" },
  { value: "box", icon: TEXT_TAB_ICON_BOX, label: "Box" },
  { value: "time", icon: TEXT_TAB_ICON_TIME, label: "Time" },
];
const textTabPanes = {
  style: document.getElementById("text-style-body"),
  design: document.getElementById("text-font-body"),
  box: document.getElementById("text-box-body"),
  time: document.getElementById("text-time-body"),
};
let activeTextTab = "style";
function showTextTab(value) {
  activeTextTab = value;
  Object.entries(textTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
}
UI.tabBar(document.getElementById("text-tab-bar"), TEXT_TABS, activeTextTab, showTextTab);
showTextTab(activeTextTab);
```

- [ ] **Step 4: Manual verification (throwaway project)**

Start the server, open a throwaway project, add a text block. In the TEXT panel:
- Confirm four tab icons show at the top (Style/Design/Box/Time), Style active by default.
- Click each tab: confirm its pane shows and the others hide, with no accordion chevrons/headers left anywhere.
- Design tab: change the font size — reload the page, reopen the same block, confirm the new size_px persisted (spot-check per spec's testing plan).
- Box tab: toggle SIZE mode FIT/FREE/FILL, confirm width/height fields show/hide correctly (unchanged behavior, just under the new tab).
- Time tab: edit start/end, confirm it moves the block on the timeline.
- Duplicate/Delete buttons remain visible and working regardless of which tab is active.
- Switch to another panel (e.g. VIDEO) and back to TEXT: confirm the previously active tab is still shown (session-only module state, not reset).
- `pytest -q` stays green.

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`'s `panel-text.js` inventory entry, replace the phrase `FONT/STYLES/BOX/TIME accordion orchestration` with `FONT/STYLES/BOX/TIME tab-bar orchestration (UI.tabBar, replacing the old per-section accordions)`.

In the `index.html` file-structure entry, replace the sentence describing `#panel-text`'s accordions with: `the TEXT context-panel section (#panel-text) has a four-tab bar in order Style/Design/Box/Time (UI.tabBar, static/ui-tab-bar.js, replacing the old UI.accordionSection stack), each pane wired by its own static/text-panel-*.js file except Box (wired in panel-text.js)`.

- [ ] **Step 6: Commit**

```bash
git add static/index.html static/panel-text.js CLAUDE.md
git commit -m "feat: replace TEXT panel accordions with icon tab bar"
```

---

## Batch 3 — CAPTIONS panel

### Task 3: CAPTIONS panel tab bar, HIGHLIGHT folded into Design, words drill-down becomes a permanent tab

**Files:**
- Modify: `static/index.html` (CAPTIONS section, lines ~184–349)
- Modify: `static/panel-captions.js` (lines 44–68)
- Modify: `static/caption-panel-words.js` (remove the drill-down open/close/settings-row, render the list directly)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `window.UI.tabBar` (Task 1).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Restructure `static/index.html`'s CAPTIONS section**

Read `static/index.html` and locate the CAPTIONS section (`#panel-captions` / `#panel-captions-main`). It currently has four `UI.accordionSection` wrapper divs: `#caption-style-accordion` (self-closing, immediately followed by sibling `#caption-style-body`), `#caption-font-accordion` (wraps `#caption-font-body`), `#caption-box-accordion` (wraps `#caption-box-body`), `#caption-highlight-accordion` (self-closing, immediately followed by sibling `#caption-highlight-body`).

Edit it so that:
- `#caption-style-accordion` is replaced by a single new `<div id="caption-tab-bar"></div>`.
- `#caption-font-accordion` and `#caption-box-accordion` are deleted — remove their opening `<div id="...">` tag and its one matching closing `</div>` (right after `#caption-font-body`'s / `#caption-box-body`'s own closing `</div>`). Do not touch `#caption-font-body`/`#caption-box-body`'s own tags or contents.
- `#caption-highlight-accordion` is deleted with no replacement (its sibling `#caption-highlight-body` is untouched — it stays a normal div, shown/hidden together with `#caption-font-body` as the Design tab's two panes, wired in Step 3).
- The `<div class="style-group"><div id="caption-words-row" class="col-8"></div></div>` block (the settings-row opener for the old words drill-down) is replaced by:
  ```html
  <div id="caption-words-body">
    <ul id="caption-words-list" class="font-list"></ul>
  </div>
  ```
- The entire `#panel-captions-words` sub-panel div (containing `#caption-words-subpanel-header` and the old `<ul id="caption-words-list">`) is deleted — its list moved to `#caption-words-body` above, so do not leave a duplicate `#caption-words-list`.
- Nothing else in the CAPTIONS section changes: the auto-caption button/empty-state block, every other `#caption-*-body` div's contents (all ids inside), and the remaining drill-down divs (`#panel-captions-font`/`#panel-captions-weight`/`#panel-captions-style`) are byte-for-byte unchanged.

- [ ] **Step 2: Verify the resulting CAPTIONS section**

Read back `static/index.html` and confirm `#panel-captions-main` now contains, after the auto-caption button/empty-state block: `#caption-tab-bar`, `#caption-style-body`, `#caption-font-body`, `#caption-highlight-body`, `#caption-box-body`, `#caption-words-body` (with `#caption-words-list` inside it) — no accordion wrapper divs, no `#panel-captions-words` sub-panel, no `#caption-words-row`/`#caption-words-subpanel-header`.

- [ ] **Step 3: Replace the accordion wiring in `static/panel-captions.js`**

Find:

```javascript
UI.accordionSection(document.getElementById("caption-style-accordion"), document.getElementById("caption-style-body"), { title: "STYLE", expanded: false });
UI.accordionSection(document.getElementById("caption-font-accordion"), document.getElementById("caption-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("caption-box-accordion"), document.getElementById("caption-box-body"), { title: "BOX", expanded: false });
UI.accordionSection(document.getElementById("caption-highlight-accordion"), document.getElementById("caption-highlight-body"), { title: "HIGHLIGHT", expanded: false });
```

Replace with:

```javascript
const CAPTION_TAB_ICON_STYLE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/></svg>';
const CAPTION_TAB_ICON_DESIGN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
const CAPTION_TAB_ICON_BOX = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/><path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="2" y="2" width="5" height="5" rx="1"/></svg>';
const CAPTION_TAB_ICON_CLOSED_CAPTION = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg>';

const CAPTION_TABS = [
  { value: "style", icon: CAPTION_TAB_ICON_STYLE, label: "Style" },
  { value: "design", icon: CAPTION_TAB_ICON_DESIGN, label: "Design" },
  { value: "box", icon: CAPTION_TAB_ICON_BOX, label: "Box" },
  { value: "closed-caption", icon: CAPTION_TAB_ICON_CLOSED_CAPTION, label: "Closed captions" },
];
// Design groups two existing bodies (FONT + HIGHLIGHT) — both show/hide together.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body"), document.getElementById("caption-highlight-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
};
let activeCaptionTab = "style";
function showCaptionTab(value) {
  activeCaptionTab = value;
  Object.entries(captionTabPanes).forEach(([k, els]) => els.forEach((el) => { el.hidden = k !== value; }));
}
UI.tabBar(document.getElementById("caption-tab-bar"), CAPTION_TABS, activeCaptionTab, showCaptionTab);
showCaptionTab(activeCaptionTab);
```

- [ ] **Step 4: Fold the words drill-down into a direct render in `static/caption-panel-words.js`**

Replace the entire file with:

```javascript
// CAPTIONS panel Closed-caption tab: every transcribed word, inline-editable text (empty
// text deletes the word) and inline-editable start/end timing (seconds, one decimal).
// Exposes window.CaptionPanel.renderWords(). Was a settings-row + drill-down sub-panel;
// folded into a permanent tab pane (2026-07-21, right-panel-tabs item) — same list rendering,
// no more back-arrow/open-close wiring.
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  // Pure validation: t_start clamped to >= 0, and t_start must be < t_end.
  // Returns the clamped {t_start, t_end} when valid, or null when invalid
  // (caller should revert the field to the previously-stored value).
  function clampWordTiming(t_start, t_end) {
    if (Number.isNaN(t_start) || Number.isNaN(t_end)) return null;
    const clampedStart = Math.max(0, t_start);
    if (!(clampedStart < t_end)) return null;
    return { t_start: clampedStart, t_end };
  }

  async function commitWordEdit(word, newText) {
    const track = ensureCaptionTrack();
    if (!newText.trim()) {
      track.words = track.words.filter((w) => w.id !== word.id);
    } else {
      word.text = newText.trim();
    }
    await saveProject();
    renderCaptionPreview();
  }

  async function commitWordTiming(word, newStart, newEnd) {
    word.t_start = newStart;
    word.t_end = newEnd;
    await saveProject();
    renderCaptionPreview();
    renderTimeline();
  }

  function renderWordsList() {
    const listEl = document.getElementById("caption-words-list");
    listEl.innerHTML = "";
    const track = ensureCaptionTrack();
    [...track.words].sort((a, b) => a.t_start - b.t_start).forEach((word) => {
      const li = document.createElement("li");
      li.className = "font-list-row";

      const startInput = document.createElement("input");
      startInput.type = "number";
      startInput.step = "0.1";
      startInput.className = "font-list-row-time";
      startInput.value = word.t_start.toFixed(1);
      startInput.addEventListener("change", () => {
        const result = clampWordTiming(parseFloat(startInput.value), word.t_end);
        if (!result) {
          startInput.value = word.t_start.toFixed(1);
          return;
        }
        commitWordTiming(word, result.t_start, result.t_end).then(renderWordsList);
      });
      li.appendChild(startInput);

      const endInput = document.createElement("input");
      endInput.type = "number";
      endInput.step = "0.1";
      endInput.className = "font-list-row-time";
      endInput.value = word.t_end.toFixed(1);
      endInput.addEventListener("change", () => {
        const result = clampWordTiming(word.t_start, parseFloat(endInput.value));
        if (!result) {
          endInput.value = word.t_end.toFixed(1);
          return;
        }
        commitWordTiming(word, result.t_start, result.t_end).then(renderWordsList);
      });
      li.appendChild(endInput);

      const input = document.createElement("input");
      input.type = "text";
      input.value = word.text;
      input.addEventListener("change", () => commitWordEdit(word, input.value).then(renderWordsList));
      li.appendChild(input);

      listEl.appendChild(li);
    });
  }

  window.CaptionPanel.renderWords = renderWordsList;
})();
```

- [ ] **Step 5: Remove the now-dead `#panel-captions-words` hide/show line in `renderCaptionPanel()`**

In `static/panel-captions.js`, find:

```javascript
async function renderCaptionPanel() {
  document.getElementById("panel-captions-font").hidden = true;
  document.getElementById("panel-captions-weight").hidden = true;
  document.getElementById("panel-captions-style").hidden = true;
  document.getElementById("panel-captions-words").hidden = true;
  document.getElementById("panel-captions-main").hidden = false;
```

Replace with:

```javascript
async function renderCaptionPanel() {
  document.getElementById("panel-captions-font").hidden = true;
  document.getElementById("panel-captions-weight").hidden = true;
  document.getElementById("panel-captions-style").hidden = true;
  document.getElementById("panel-captions-main").hidden = false;
```

- [ ] **Step 6: Manual verification (throwaway project)**

Start the server, open a throwaway project with at least one imported clip that has audio. In the CAPTIONS panel:
- Click Auto-caption to get a real word list (or use an existing throwaway project that already has captions).
- Confirm four tabs: Style/Design/Box/Closed captions. Style active by default.
- Design tab: confirm BOTH the font controls and the HIGHLIGHT controls (mode/color/max words) show together in one pane.
- Closed-caption tab: confirm every word is listed with editable text/start/end, matching the old drill-down's behavior (empty text deletes a word on blur; editing start/end updates the timeline caption row).
- Confirm there is no more "Caption words" settings row or back-arrow sub-panel anywhere.
- `pytest -q` stays green.

- [ ] **Step 7: Update the codebase map**

In `CLAUDE.md`'s `panel-captions.js` entry, replace `its accordion/divider wiring` with `its tab-bar/divider wiring (UI.tabBar; Design tab groups the FONT + HIGHLIGHT bodies together)`.

Replace the `caption-panel-words.js` entry's description (`CAPTIONS panel "Caption words" drill-down: ...`) with: `CAPTIONS panel Closed-caption tab: every transcribed word, inline-editable text (empty text deletes the word) and inline-editable start/end timing (number inputs, validated via clampWordTiming()) — was a settings-row + drill-down, folded into a permanent tab pane 2026-07-21.`

- [ ] **Step 8: Commit**

```bash
git add static/index.html static/panel-captions.js static/caption-panel-words.js CLAUDE.md
git commit -m "feat: replace CAPTIONS panel accordions with icon tab bar, fold words drill-down into a permanent tab"
```

---

## Batch 4 — VIDEO + VIDEO BOX panels

### Task 4: VIDEO panel tab bar (Design: FILL + SPEED; Time: TRIM + ORDER)

**Files:**
- Modify: `static/index.html` (VIDEO section, lines ~134–182)
- Modify: `static/panel-video.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `window.UI.tabBar` (Task 1).

- [ ] **Step 1: Restructure `static/index.html`'s VIDEO section**

Find:

```html
      <div id="panel-video" class="context-panel" hidden>
        <div class="style-panel-header">VIDEO</div>

        <div class="style-group">
          <div id="video-name" class="context-panel-name col-8"></div>
        </div>

        <div class="style-group-label">TRIM</div>
        <div class="style-group">
          <div class="style-row">
            <label id="video-in-field"></label>
            <label id="video-out-field"></label>
          </div>
        </div>
        <div class="style-group">
          <div class="style-row">
            <button class="col-4" id="video-set-in">Set in</button>
            <button class="col-4" id="video-set-out">Set out</button>
          </div>
        </div>

        <div id="video-order-divider"></div>

        <div class="style-group-label">ORDER</div>
        <div class="style-group">
          <div class="style-row">
            <button class="col-4" id="video-move-up">&#9650; Move up</button>
            <button class="col-4" id="video-move-down">&#9660; Move down</button>
          </div>
        </div>

        <div class="style-group-label">FILL</div>
        <div class="style-group">
          <div id="video-fill-mode-group"></div>
        </div>

        <div class="style-group-label">SPEED</div>
        <div class="style-group">
          <div id="video-speed-field"></div>
        </div>

        <div class="style-group">
          <button id="video-duplicate" class="col-8" type="button">Duplicate clip</button>
        </div>

        <div class="style-group">
          <button id="video-delete" class="col-8" type="button">Delete clip</button>
        </div>
      </div>
```

Replace with:

```html
      <div id="panel-video" class="context-panel" hidden>
        <div class="style-panel-header">VIDEO</div>

        <div class="style-group">
          <div id="video-name" class="context-panel-name col-8"></div>
        </div>

        <div id="video-tab-bar"></div>

        <div id="video-design-body">
          <div class="style-group-label">FILL</div>
          <div class="style-group">
            <div id="video-fill-mode-group"></div>
          </div>

          <div class="style-group-label">SPEED</div>
          <div class="style-group">
            <div id="video-speed-field"></div>
          </div>
        </div>

        <div id="video-time-body">
          <div class="style-group-label">TRIM</div>
          <div class="style-group">
            <div class="style-row">
              <label id="video-in-field"></label>
              <label id="video-out-field"></label>
            </div>
          </div>
          <div class="style-group">
            <div class="style-row">
              <button class="col-4" id="video-set-in">Set in</button>
              <button class="col-4" id="video-set-out">Set out</button>
            </div>
          </div>

          <div id="video-order-divider"></div>

          <div class="style-group-label">ORDER</div>
          <div class="style-group">
            <div class="style-row">
              <button class="col-4" id="video-move-up">&#9650; Move up</button>
              <button class="col-4" id="video-move-down">&#9660; Move down</button>
            </div>
          </div>
        </div>

        <div class="style-group">
          <button id="video-duplicate" class="col-8" type="button">Duplicate clip</button>
        </div>

        <div class="style-group">
          <button id="video-delete" class="col-8" type="button">Delete clip</button>
        </div>
      </div>
```

(Design tab is listed first in the markup since VIDEO has no Style/Box tab and Design is the canonical first-available tab, matching the "first tab is the default" rule.)

- [ ] **Step 2: Add the tab-bar wiring to `static/panel-video.js`**

Find the top of the existing IIFE:

```javascript
UI.divider(document.getElementById("video-order-divider"));

(() => {
  function render(c) {
```

Replace with:

```javascript
UI.divider(document.getElementById("video-order-divider"));

(() => {
  const VIDEO_TAB_ICON_DESIGN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
  const VIDEO_TAB_ICON_TIME = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>';

  const VIDEO_TABS = [
    { value: "design", icon: VIDEO_TAB_ICON_DESIGN, label: "Design" },
    { value: "time", icon: VIDEO_TAB_ICON_TIME, label: "Time" },
  ];
  const videoTabPanes = {
    design: document.getElementById("video-design-body"),
    time: document.getElementById("video-time-body"),
  };
  let activeVideoTab = "design";
  function showVideoTab(value) {
    activeVideoTab = value;
    Object.entries(videoTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
  }
  UI.tabBar(document.getElementById("video-tab-bar"), VIDEO_TABS, activeVideoTab, showVideoTab);
  showVideoTab(activeVideoTab);

  function render(c) {
```

- [ ] **Step 3: Manual verification (throwaway project)**

Start the server, open a throwaway project, select a clip in the VIDEO panel:
- Confirm two tabs: Design (default) and Time.
- Design tab: FILL and SPEED controls show; changing FILL/SPEED still updates the preview and persists (spot-check via saved JSON or reload).
- Time tab: TRIM in/out, Set in/out, ORDER move up/down all still work exactly as before.
- Duplicate/Delete clip buttons remain visible and working under either tab.
- `pytest -q` stays green.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`'s `panel-video.js` entry, add: `A tab bar (UI.tabBar, added 2026-07-21) splits the panel into Design (FILL + SPEED) and Time (TRIM + ORDER) panes, Design shown by default; Duplicate/Delete remain always-visible below the panes.`

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-video.js CLAUDE.md
git commit -m "feat: add Design/Time tab bar to VIDEO panel"
```

### Task 5: VIDEO BOX panel tab bar (Box: SIZE & POSITION + TRIM; Time: START)

**Files:**
- Modify: `static/index.html` (`#video-box-detail`, lines ~401–432)
- Modify: `static/panel-video-box.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `window.UI.tabBar` (Task 1).

- [ ] **Step 1: Restructure `static/index.html`'s `#video-box-detail`**

Find:

```html
        <div id="video-box-detail" hidden>
          <div id="video-box-name" class="context-panel-name"></div>

          <div class="style-group-label">TRIM</div>
          <div class="style-group">
            <div class="style-row">
              <label id="video-box-in-field"></label>
              <label id="video-box-out-field"></label>
            </div>
          </div>

          <div class="style-group-label">TIME</div>
          <div class="style-group">
            <label id="video-box-start-field"></label>
          </div>

          <div class="style-group-label">SIZE &amp; POSITION</div>
          <div class="style-group">
            <div class="style-row">
              <label id="video-box-x-field"></label>
              <label id="video-box-y-field"></label>
            </div>
            <div class="style-row">
              <label id="video-box-width-field"></label>
              <label id="video-box-height-field"></label>
            </div>
          </div>

          <div class="style-group">
            <button id="video-box-delete" type="button" class="col-8">Delete video box</button>
          </div>
        </div>
```

Replace with:

```html
        <div id="video-box-detail" hidden>
          <div id="video-box-name" class="context-panel-name"></div>

          <div id="video-box-tab-bar"></div>

          <div id="video-box-box-body">
            <div class="style-group-label">SIZE &amp; POSITION</div>
            <div class="style-group">
              <div class="style-row">
                <label id="video-box-x-field"></label>
                <label id="video-box-y-field"></label>
              </div>
              <div class="style-row">
                <label id="video-box-width-field"></label>
                <label id="video-box-height-field"></label>
              </div>
            </div>

            <div class="style-group-label">TRIM</div>
            <div class="style-group">
              <div class="style-row">
                <label id="video-box-in-field"></label>
                <label id="video-box-out-field"></label>
              </div>
            </div>
          </div>

          <div id="video-box-time-body">
            <div class="style-group-label">TIME</div>
            <div class="style-group">
              <label id="video-box-start-field"></label>
            </div>
          </div>

          <div class="style-group">
            <button id="video-box-delete" type="button" class="col-8">Delete video box</button>
          </div>
        </div>
```

(Box tab is listed first — VIDEO BOX has no Style/Design tab and Box is the canonical first-available tab.)

- [ ] **Step 2: Add the tab-bar wiring to `static/panel-video-box.js`**

Find the top of the existing IIFE:

```javascript
(() => {
  function findMedia(box) {
```

Replace with:

```javascript
(() => {
  const VIDEO_BOX_TAB_ICON_BOX = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/><path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="2" y="2" width="5" height="5" rx="1"/></svg>';
  const VIDEO_BOX_TAB_ICON_TIME = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>';

  const VIDEO_BOX_TABS = [
    { value: "box", icon: VIDEO_BOX_TAB_ICON_BOX, label: "Box" },
    { value: "time", icon: VIDEO_BOX_TAB_ICON_TIME, label: "Time" },
  ];
  const videoBoxTabPanes = {
    box: document.getElementById("video-box-box-body"),
    time: document.getElementById("video-box-time-body"),
  };
  let activeVideoBoxTab = "box";
  function showVideoBoxTab(value) {
    activeVideoBoxTab = value;
    Object.entries(videoBoxTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
  }
  UI.tabBar(document.getElementById("video-box-tab-bar"), VIDEO_BOX_TABS, activeVideoBoxTab, showVideoBoxTab);
  showVideoBoxTab(activeVideoBoxTab);

  function findMedia(box) {
```

- [ ] **Step 3: Manual verification (throwaway project)**

Start the server, open a throwaway project, add a video box (VIDEO BOX panel's "+ ADD VIDEO BOX"):
- Confirm two tabs: Box (default) and Time.
- Box tab: X/Y/WIDTH/HEIGHT and TRIM in/out all show together and still work (drag-resize on stage still calls the same handlers).
- Time tab: START field shows and still works.
- Delete video box button remains visible and working under either tab.
- `pytest -q` stays green.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`'s `panel-video-box.js` entry, add: `A tab bar (UI.tabBar, added 2026-07-21) splits the detail view into Box (SIZE & POSITION + TRIM) and Time (START) panes, Box shown by default; Delete remains always-visible below the panes.`

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-video-box.js CLAUDE.md
git commit -m "feat: add Box/Time tab bar to VIDEO BOX panel"
```

---

## Batch 5 — Cleanup and final review

### Task 6: Verify no dead accordion consumers, full regression pass

**Files:**
- Modify: `CLAUDE.md` (only if the sweep below finds stale wording)

No code changes expected — this task verifies Batches 2–4 left nothing behind, per the spec's "remove dead accordion markup/CSS" task (which is already satisfied incrementally; this is the check, not new removal work).

- [ ] **Step 1: Grep for orphaned accordion call sites**

```bash
grep -rn "accordionSection" static/
```

Expected: zero matches in `panel-text.js`/`panel-captions.js`/`panel-video.js`/`panel-video-box.js` (only the component definition in `static/ui-accordion-section.js` itself, kept per spec since SETTINGS/EXPORT/LAYERS may use plain accordions later).

- [ ] **Step 2: Grep for orphaned accordion ids in index.html**

```bash
grep -n "accordion" static/index.html
```

Expected: zero matches (all `#*-accordion` wrapper divs were removed in Batches 2–4; `accordion.css`'s link tag may still be present — that's fine, the component stays available per spec, just currently unused).

- [ ] **Step 3: Full manual click-through (throwaway project)**

Start the server on a throwaway project with: at least 2 clips, 1 text block, captions transcribed, 1 video box. Click through every panel (FILES, VIDEO, TEXT, CAPTIONS, VIDEO BOX, LAYERS, SETTINGS, EXPORT, PROJECTS) and confirm:
- TEXT/CAPTIONS/VIDEO/VIDEO BOX show their tab bars, correct tab counts, correct default tab.
- FILES/PROJECTS/SETTINGS/EXPORT/LAYERS show no tab bar (unchanged, single content group).
- No console errors across the whole click-through.

- [ ] **Step 4: Full test suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass (no backend changes across this entire plan).

- [ ] **Step 5: Final map sweep**

Read `CLAUDE.md` in full and confirm every sentence touched by Batches 1–4 reads consistently (no leftover "accordion" wording describing TEXT/CAPTIONS/VIDEO/VIDEO BOX's current sectioning — "accordion" should only remain where accurately describing `UI.accordionSection`/`UI.accordion`'s own definitions and SETTINGS/EXPORT's still-flat plain groups). Fix any stragglers found.

- [ ] **Step 6: Commit (only if Step 5 found fixes; otherwise this batch is a no-op verification pass and needs no commit)**

```bash
git add CLAUDE.md
git commit -m "docs: final codebase-map sweep for right-panel-tabs"
```

---

## Testing Summary

No automated tests are added or expected to change — this is UI wiring layer only (existing convention for this codebase's frontend). Each task's manual verification step is the test substitute, always run against a throwaway project (never real project data, per the app's autosave-on-unload behavior). `pytest -q` is the regression gate for the untouched backend and must stay green after every batch.
