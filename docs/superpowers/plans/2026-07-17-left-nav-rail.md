# Left Nav Rail (Media/Text/Captions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the left MEDIA-only panel with a fixed Media/Text/Captions icon nav rail that switches content in the right panel, which now opens by default (Media) and collapses to a rail instead of closing.

**Architecture:** A new `UI.iconRail` JS component (in `static/ui-components.js`, mirroring `UI.buttonGroup`'s shape) drives the left `#panel-nav` rail. The right `#style-panel`'s existing `showPanel(type)`/`selected` single-visible-section mechanism gains a fourth rail-triggered type, `'media'`, which holds the clip library moved out of the old left panel. `#panel-video` (trim/order) is untouched and stays reachable only via timeline clip selection. A `.collapsed` modifier on `#style-panel` shrinks it to a 72px rail; when Media is the active section that rail shows clip thumbnails (reusing the old collapsed-MEDIA-panel look), otherwise it shows nothing but the re-expand toggle.

**Tech Stack:** Vanilla JS/CSS/HTML, no build step, FastAPI static-file serving. No backend changes.

**Spec:** `docs/superpowers/specs/2026-07-17-left-nav-rail-design.md` — this plan's Task 1 = spec Task 1; Task 2 = spec Tasks 2+3 merged (splitting the panel relocation across two commits would leave the app broken in between); Task 3 = spec Task 4; Task 4 = spec Task 5; Task 5 = spec Task 6.

## Global Constraints

- No JS build step/bundler — write plain browser JS, no imports/exports, no transpilation.
- Icon SVGs are hand-inlined directly in markup, copied from lucide.dev (or GitHub raw source), keeping the existing wrapper style: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- Icons for this feature: MEDIA = Lucide `folder`, TEXT = Lucide `type`, CAPTIONS = Lucide `closed-caption`.
- Reused interactive UI is built as a `window.UI.*` component in `static/ui-components.js` (matching `buttonGroup`/`numberField`/`colorSwatch`/`accordion`/`button`), not just shared CSS.
- Tests: `.venv/Scripts/python -m pytest -q`. This feature has no backend/pure-logic changes, so no new automated tests — verify manually in the browser per project convention for UI wiring (see `2026-07-15-media-library-design.md`'s Testing section for precedent).
- Server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`.

---

### Task 1: `UI.iconRail` component + CSS

**Files:**
- Modify: `static/ui-components.js`
- Create: `static/css/components/icon-rail.css`
- Modify: `static/index.html:12` (add stylesheet link)

**Interfaces:**
- Produces: `UI.iconRail(container, items, activeValue, onSelect)` where `items` is `[{value, icon, label?}]` (`icon` is an inline SVG markup string; omit `label` for an icon-only button). Returns `setActive(value)` — a function, same return shape as `UI.buttonGroup`. Renders buttons with `.icon-rail-btn` and toggles `aria-pressed`.

- [ ] **Step 1: Add the `iconRail` function to `static/ui-components.js`**

Insert immediately after the existing `accordion` function (after its closing `}` on line 104, before the `// Wires an existing <button>` comment for `button`):

```js
  // Renders a narrow vertical rail of icon+label toggle buttons into `container`. items:
  // [{value, icon (inline SVG markup string), label}] — omit `label` for an icon-only button.
  // onSelect(value) fires on click. Returns a setActive(value) updater (mirrors buttonGroup).
  function iconRail(container, items, activeValue, onSelect) {
    container.innerHTML = "";
    container.classList.add("icon-rail");
    const buttons = items.map(({ value, icon, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-rail-btn";
      if (!label) btn.classList.add("icon-rail-btn-icon-only");
      btn.dataset.value = value;
      btn.setAttribute("aria-pressed", String(value === activeValue));

      const iconEl = document.createElement("span");
      iconEl.className = "icon-rail-icon";
      iconEl.innerHTML = icon;
      btn.appendChild(iconEl);

      if (label) {
        const labelEl = document.createElement("span");
        labelEl.className = "icon-rail-label";
        labelEl.textContent = label;
        btn.appendChild(labelEl);
      }

      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
        onSelect(value);
      });
      container.appendChild(btn);
      return btn;
    });
    return (value) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
  }
```

Then update the module's return statement (last line before the closing `})();`) from:

```js
  return { buttonGroup, numberField, colorSwatch, accordion, button };
```

to:

```js
  return { buttonGroup, numberField, colorSwatch, accordion, button, iconRail };
```

- [ ] **Step 2: Create `static/css/components/icon-rail.css`**

```css
/* Vertical rail of icon+label toggle buttons. Used for the left nav (MEDIA/TEXT/CAPTIONS) and any */
/* other narrow icon-rail context. Exposes .icon-rail/.icon-rail-btn/.icon-rail-icon/.icon-rail-label. */
/* Depends on tokens.css. Built by static/ui-components.js (UI.iconRail). */
.icon-rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 10px;
}

.icon-rail-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-2) 0;
  border: none;
  border-radius: 4px;
  color: var(--text-dim);
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.04em;
}

.icon-rail-btn:hover { color: var(--text-secondary); background: var(--bg-2); }

.icon-rail-btn[aria-pressed="true"] {
  color: var(--text);
  background: rgba(108, 135, 163, 0.12);
}

.icon-rail-icon { display: flex; }
.icon-rail-icon svg { width: 20px; height: 20px; }

.icon-rail-label { text-transform: uppercase; }
```

- [ ] **Step 3: Link the new stylesheet in `static/index.html`**

In the `<head>`, add this line right after the `style-panel.css` link (currently line 12):

```html
<link rel="stylesheet" href="/static/css/components/icon-rail.css">
```

- [ ] **Step 4: Verify in the browser**

Start the server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000`. The page must load with no console errors (nothing calls `UI.iconRail` yet, so there's no visual change). Confirm the component exists by evaluating in the page:

```js
typeof UI.iconRail === "function"
```

Expected: `true`.

- [ ] **Step 5: Commit**

```bash
git add static/ui-components.js static/css/components/icon-rail.css static/index.html
git commit -m "feat: add UI.iconRail component"
```

---

### Task 2: Relocate MEDIA content into the right panel; left panel becomes the nav rail

**Files:**
- Modify: `static/index.html:35-49` (left `#panel`), `static/index.html:123-156` (right `#style-panel`, insert `#panel-media` before `#panel-video`)
- Modify: `static/css/components/panel.css` (full rewrite)
- Modify: `static/css/components/style-panel.css` (append moved MEDIA rules)
- Modify: `static/editor.js` (remove old collapse wiring, extend `showPanel`, add rail wiring)

**Interfaces:**
- Consumes: `UI.iconRail` from Task 1.
- Produces: `showPanel(type)` now accepts `'media' | 'video' | 'text' | 'captions'` (was `'video' | 'text' | 'captions'`). New functions `openMediaPanel()`, `openTextPanel()`, `openCaptionsPanel()` — each sets `selected = {type}`, calls `showPanel(type)`, and `renderTimeline()`; `openTextPanel()` additionally focuses `#text-heading`. Later tasks (3, 4) call `openMediaPanel()` and read `selected.type`.

- [ ] **Step 1: Replace the left `#panel` markup in `static/index.html`**

Replace (currently lines 35-49):

```html
    <aside id="panel">
      <div class="panel-header">
        <span class="panel-title">MEDIA</span>
        <button id="panel-collapse-toggle" class="icon-btn" title="Collapse panel">
          <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="13" height="11" rx="1.5" stroke="currentColor"/>
            <line x1="5" y1="0.5" x2="5" y2="11.5" stroke="currentColor"/>
          </svg>
        </button>
      </div>
      <div id="panel-add">
        <button id="add-clip"><span class="icon">+</span><span class="label">IMPORT VIDEO</span></button>
      </div>
      <ol id="clip-list"></ol>
    </aside>
```

with:

```html
    <aside id="panel">
      <div id="panel-nav"></div>
    </aside>
```

- [ ] **Step 2: Add `#panel-media` to the right panel in `static/index.html`**

Immediately before `<div id="panel-video" class="context-panel" hidden>` (currently line 126), insert:

```html
      <div id="panel-media" class="context-panel" hidden>
        <div class="style-panel-header">MEDIA</div>
        <div id="panel-media-add">
          <button id="add-clip"><span class="icon">+</span><span class="label">IMPORT VIDEO</span></button>
        </div>
        <ol id="clip-list"></ol>
      </div>
```

- [ ] **Step 3: Rewrite `static/css/components/panel.css`**

Replace the entire file with:

```css
/* Left nav rail: fixed 72px icon+label switcher for the right panel's MEDIA/TEXT/CAPTIONS sections. */
/* Exposes #panel only (#panel-nav's button styling lives in icon-rail.css, built by ui-components.js). Depends on tokens.css. */
#panel {
  width: 72px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  padding: var(--space-3) 0;
  overflow: hidden;
}
```

- [ ] **Step 4: Add the moved MEDIA rules to `static/css/components/style-panel.css`**

Append at the end of the file:

```css

#panel-media-add { margin-bottom: var(--space-2); }

#add-clip {
  width: 100%;
  border: 1px dashed var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 9px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
}
#add-clip:hover { border-color: var(--border-hover-color); border-width: var(--border-hover-width); color: var(--text); }

#clip-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

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

.clip-thumb {
  width: 34px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 3px;
  background: repeating-linear-gradient(135deg, var(--stripe-a) 0px, var(--stripe-a) 6px, var(--stripe-b) 6px, var(--stripe-b) 12px);
  border: 1px solid var(--border-soft);
}

.clip-info { min-width: 0; flex: 1; }
.clip-info .clip-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clip-info .clip-duration { font-family: var(--font-ui); font-size: 9.5px; color: var(--text-dim); margin-top: 2px; }
```

- [ ] **Step 5: Remove the old left-panel collapse wiring from `static/editor.js`**

Delete these lines (currently lines 352-359):

```js
function setPanelCollapsed(collapsed) {
  document.getElementById("panel").classList.toggle("collapsed", collapsed);
  localStorage.setItem("panelCollapsed", collapsed ? "1" : "");
}

document.getElementById("panel-collapse-toggle").addEventListener("click", () => {
  setPanelCollapsed(!document.getElementById("panel").classList.contains("collapsed"));
});
```

And delete this line from the init IIFE (currently line 398):

```js
  setPanelCollapsed(localStorage.getItem("panelCollapsed") === "1");
```

- [ ] **Step 6: Extend `showPanel` to support `'media'`**

In `static/editor.js`, replace:

```js
function showPanel(type) {
  document.getElementById("style-panel").hidden = false;
  ["video", "text", "captions"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}
```

with:

```js
function showPanel(type) {
  document.getElementById("style-panel").hidden = false;
  ["media", "video", "text", "captions"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}
```

(`closePanel()` and its `#style-panel-close` listener stay untouched for now — Task 4 replaces them with the collapse toggle.)

- [ ] **Step 7: Add the nav rail items, handlers, and `UI.iconRail` wiring**

In `static/editor.js`, insert this block right after the `renderMediaList` function's closing `}` (currently after line 309, before `async function moveClip`):

```js
const PANEL_NAV_ITEMS = [
  {
    value: "media",
    label: "MEDIA",
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
];

function openMediaPanel() {
  selected = { type: "media" };
  showPanel("media");
  renderTimeline();
}

function openTextPanel() {
  selected = { type: "text" };
  showPanel("text");
  document.getElementById("text-heading").focus();
  renderTimeline();
}

function openCaptionsPanel() {
  selected = { type: "captions" };
  showPanel("captions");
  renderTimeline();
}

const PANEL_NAV_HANDLERS = { media: openMediaPanel, text: openTextPanel, captions: openCaptionsPanel };

UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "media", (value) => PANEL_NAV_HANDLERS[value]());
```

- [ ] **Step 8: Verify in the browser**

Reload the app. Confirm:
- The left panel is a narrow rail showing three icon+label buttons: MEDIA (folder icon), TEXT, CAPTIONS.
- Clicking MEDIA opens the right panel showing the clip list and IMPORT VIDEO button (same as the old left panel); importing a clip still works and the clip appears in this list and on the timeline.
- Clicking TEXT opens the TEXT section with the heading textarea focused.
- Clicking CAPTIONS opens the CAPTIONS placeholder section.
- Clicking a clip on the timeline still opens the VIDEO section (trim in/out) — unaffected by the rail.
- No console errors.

Use `read_page` to confirm `#panel-nav` renders three `.icon-rail-btn` elements, and `computer` clicks to exercise each one; `read_console_messages` to confirm no errors.

- [ ] **Step 9: Commit**

```bash
git add static/index.html static/css/components/panel.css static/css/components/style-panel.css static/editor.js
git commit -m "feat: move MEDIA panel into right panel, add left nav rail"
```

---

### Task 3: Default-open Media on page load

**Files:**
- Modify: `static/editor.js` (init IIFE)

**Interfaces:**
- Consumes: `openMediaPanel()` from Task 2.

- [ ] **Step 1: Call `openMediaPanel()` during init**

In `static/editor.js`, in the init IIFE, change:

```js
  renderMediaList();
  Preview.load(project);
  renderTextPanel();
  renderTimeline();
  setTimeout(() => renderTextPreview(), 100);
```

to:

```js
  renderMediaList();
  Preview.load(project);
  renderTextPanel();
  renderTimeline();
  openMediaPanel();
  setTimeout(() => renderTextPreview(), 100);
```

- [ ] **Step 2: Verify in the browser**

Reload the page fresh (hard refresh). Confirm the right panel is visible immediately with the MEDIA section shown (clip list + import button), and the MEDIA button in the left rail shows `aria-pressed="true"`. No click required.

- [ ] **Step 3: Commit**

```bash
git add static/editor.js
git commit -m "feat: open Media panel by default on load"
```

---

### Task 4: Right panel collapses to a rail instead of closing

**Note on the spec's generic collapsed rail:** the design spec describes the
Text/Captions collapsed state as "a `UI.iconRail` instance with a single
re-expand item." This plan simplifies that: `#style-panel-collapse-toggle`
(the same button used to collapse) already sits at the top of the panel and
stays visible when collapsed, so it already *is* the re-expand affordance —
rendering a second, redundant `UI.iconRail` button that does the same thing
would duplicate a control for no behavioral difference. The CSS below hides
all non-Media section content when collapsed, leaving only that one toggle
button visible, which matches the spec's visual/behavioral intent (an
otherwise-empty rail with a way back) without the extra indirection.

**Files:**
- Modify: `static/index.html:124` (close button → collapse-toggle button)
- Modify: `static/css/components/style-panel.css` (replace `#style-panel-close` rule, add collapsed-state rules)
- Modify: `static/editor.js` (replace `closePanel`/listener with collapse toggle)

**Interfaces:**
- Consumes: `selected` (from Task 2) to determine whether Media is the active section.
- Produces: `setStylePanelCollapsed(collapsed)` — toggles the `.collapsed` class on `#style-panel` and updates module-level `stylePanelCollapsed`.

- [ ] **Step 1: Replace the close button with a collapse-toggle button in `static/index.html`**

Replace (currently line 124):

```html
      <button id="style-panel-close" class="icon-btn" title="Close">&times;</button>
```

with:

```html
      <button id="style-panel-collapse-toggle" class="icon-btn" title="Collapse panel">
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="0.5" y="0.5" width="13" height="11" rx="1.5" stroke="currentColor"/>
          <line x1="5" y1="0.5" x2="5" y2="11.5" stroke="currentColor"/>
        </svg>
      </button>
```

- [ ] **Step 2: Update `static/css/components/style-panel.css`**

Replace:

```css
#style-panel-close {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-dim);
}
#style-panel-close:hover { color: var(--text); }
```

with:

```css
#style-panel-collapse-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
}

#style-panel.collapsed {
  width: 72px;
  padding: var(--space-3) 0;
}

#style-panel.collapsed .context-panel:not(#panel-media) { display: none; }

#style-panel.collapsed #panel-media:not([hidden]) .style-panel-header { display: none; }
#style-panel.collapsed #panel-media-add { padding: 0 10px; }
#style-panel.collapsed #panel-media-add .label { display: none; }
#style-panel.collapsed #clip-list { padding: var(--space-2) 0; }
#style-panel.collapsed #clip-list li { justify-content: center; padding: var(--space-2) 0; }
#style-panel.collapsed .clip-info { display: none; }
```

- [ ] **Step 3: Replace `closePanel` with the collapse toggle in `static/editor.js`**

Replace:

```js
function closePanel() {
  document.getElementById("style-panel").hidden = true;
  selected = null;
  renderTimeline();
}

document.getElementById("style-panel-close").addEventListener("click", closePanel);
```

with:

```js
let stylePanelCollapsed = false;

function setStylePanelCollapsed(collapsed) {
  stylePanelCollapsed = collapsed;
  document.getElementById("style-panel").classList.toggle("collapsed", collapsed);
}

document.getElementById("style-panel-collapse-toggle").addEventListener("click", () => {
  setStylePanelCollapsed(!stylePanelCollapsed);
});
```

- [ ] **Step 4: Verify in the browser**

Reload the app (Media open by default). Click the collapse-toggle button:
- Confirm `#style-panel` shrinks to ~72px and shows clip thumbnails only (no MEDIA header, no filename/duration labels, no IMPORT VIDEO label — icon only).
- Confirm clicking a thumbnail still toggles its `.selected` highlight (`renderMediaList`'s existing click handler is unaffected).
- Click the toggle again: confirm the panel expands back to full width with the MEDIA section fully restored (header, import button with label, filenames/durations visible).
- Click TEXT in the left rail, type something in the heading, then collapse the right panel: confirm it shrinks to a bare 72px rail with nothing visible but the collapse-toggle button (no TEXT content bleeding through).
- Expand again: confirm the TEXT section reappears with the typed heading still present (state preserved, not reset).
- Confirm the left nav rail (`#panel`) is unaffected by any of this — it never collapses.

Use `read_page` on `#style-panel` before/after each toggle to confirm the `.collapsed` class and visible children, and `computer` screenshots for a final visual check.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/css/components/style-panel.css static/editor.js
git commit -m "feat: collapse right panel to a rail instead of closing it"
```

---

### Task 5: Full walkthrough against the spec's testing checklist

**Files:** none (verification only)

- [ ] **Step 1: Run the backend test suite to confirm nothing broke**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all tests pass (this feature touches no `app/*.py` files, so this is a regression check, not new coverage).

- [ ] **Step 2: Walk the full scenario in the browser**

With the server running, in order:
1. Fresh load → Media section open by default, MEDIA button pressed in the left rail.
2. Import a clip → appears in the Media list and on the timeline; player loads it.
3. Click TEXT in the rail → TEXT section opens, heading textarea focused; MEDIA/CAPTIONS closed.
4. Click CAPTIONS in the rail → CAPTIONS placeholder opens; TEXT closes.
5. Click MEDIA in the rail → Media list reopens.
6. Click a clip on the timeline → VIDEO section opens (trim in/out) — independent of the rail's last-clicked tab; the rail's `aria-pressed` state on MEDIA/TEXT/CAPTIONS doesn't need to change for this (it's a 4th, separate state).
7. Collapse the right panel while Media is active → thumbnail-only rail; click a thumbnail → selection toggles; expand → Media restored.
8. Switch to Text, collapse → bare rail (toggle button only); expand → Text restored with prior input intact.
9. Confirm the left `#panel` rail stayed a fixed 72px throughout — it has no collapse behavior of its own.

- [ ] **Step 3: Take a final screenshot for the record**

Use `computer {action: "screenshot"}` with the Media section open and expanded as the end-state proof.

No commit for this task — it's verification only. If any step fails, fix it as part of the task where the regression was introduced (re-open that task's checkbox) rather than patching ad hoc here.
