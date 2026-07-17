# TEXT panel Misc accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the TEXT panel's heading textarea pinned at the top and move everything else (TIME, STYLE, color/outline/box, TEXT ALIGN, POSITION) into a single collapsible "MISC" accordion section, collapsed by default.

**Architecture:** Add a small reusable `UI.accordion(header, body, {expanded})` wiring function to `static/ui-components.js` (wires an existing header `<button>` + body `<div>` pair already in the DOM — same pattern as `buttonGroup`/`numberField`/`colorSwatch`). Restructure `#panel-text` markup in `static/index.html` to wrap the non-heading controls in the accordion body, with a Lucide `chevron-right` icon in the header. Wire it once in `static/editor.js`. Add `static/css/components/accordion.css` for header/chevron styling.

**Tech Stack:** Vanilla JS/HTML/CSS, no build step, no JS test framework (this repo only has pytest for the Python layer) — verified manually in the browser per this repo's existing convention for thin DOM-wiring code.

## Global Constraints

- No JS build step/bundler — icons are hand-inlined Lucide SVG paths, `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` (per `CLAUDE.md` Conventions section).
- Single accordion section only ("MISC") — no other sections, no persistence of expanded/collapsed state across panel opens.
- No changes to `app/*.py`, the text-block/TextPreset data model, or the CAPTIONS/VIDEO panel sections.
- Existing element IDs referenced by `editor.js` (`text-heading`, `text-font`, `text-size-field`, etc.) must not change — only their DOM position moves (into the new accordion body).

---

### Task 1: `UI.accordion` component + CSS

**Files:**
- Modify: `static/ui-components.js` (add `accordion` function, add to the returned object at the bottom)
- Create: `static/css/components/accordion.css`
- Modify: `static/index.html` (add `<link rel="stylesheet" href="/static/css/components/accordion.css">` in `<head>`)

**Interfaces:**
- Produces: `window.UI.accordion(header, body, options)` where `header` is an existing `<button>` DOM element, `body` is an existing container DOM element, `options.expanded` is a boolean (default `false`). Sets `body.hidden` and `header.setAttribute('aria-expanded', ...)` to match the initial state, adds a `click` listener on `header` that toggles both. Returns `{ setExpanded(bool) }`.
- Consumes: nothing from other tasks (self-contained utility, mirrors `buttonGroup`/`numberField`/`colorSwatch` already in this file).

- [ ] **Step 1: Add the `accordion` function to `static/ui-components.js`**

Insert before the final `return { buttonGroup, numberField, colorSwatch };` line:

```js
  // Wires an existing header <button> + body <div> pair (already in the DOM) into a collapsible
  // section: toggles body.hidden and header's aria-expanded on click. Returns a setExpanded(bool) updater.
  function accordion(header, body, { expanded = false } = {}) {
    const apply = (isExpanded) => {
      body.hidden = !isExpanded;
      header.setAttribute("aria-expanded", String(isExpanded));
    };
    apply(expanded);
    header.addEventListener("click", () => {
      apply(header.getAttribute("aria-expanded") !== "true");
    });
    return (isExpanded) => apply(isExpanded);
  }
```

Change the final line to:

```js
  return { buttonGroup, numberField, colorSwatch, accordion };
```

- [ ] **Step 2: Create `static/css/components/accordion.css`**

```css
/* Generic collapsible header/body pair. Exposes .accordion-header/.accordion-body/.accordion-chevron. Depends on tokens.css. */
.accordion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  cursor: pointer;
  margin-bottom: var(--space-2);
}
.accordion-header:hover { color: var(--text); }

.accordion-chevron {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.accordion-header[aria-expanded="true"] .accordion-chevron {
  transform: rotate(90deg);
}

.accordion-body[hidden] { display: none; }
```

- [ ] **Step 3: Link the new stylesheet in `static/index.html`**

In the `<head>`, after the existing `<link rel="stylesheet" href="/static/css/components/color-swatch.css">` line, add:

```html
<link rel="stylesheet" href="/static/css/components/accordion.css">
```

- [ ] **Step 4: Manual verification (no JS test framework in this repo)**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000` in a browser, open devtools console, and run:

```js
const h = document.createElement("button"); h.textContent = "TEST";
const b = document.createElement("div"); b.textContent = "body content";
document.body.append(h, b);
UI.accordion(h, b, { expanded: false });
```

Expected: `b.hidden` is `true` and `h.getAttribute('aria-expanded')` is `"false"` immediately after. Click `h` in the page — `b` becomes visible and `aria-expanded` becomes `"true"`. Click again — collapses back. Remove the two test elements from the page afterward (refresh the page).

- [ ] **Step 5: Commit**

```bash
git add static/ui-components.js static/css/components/accordion.css static/index.html
git commit -m "feat: add reusable UI.accordion component"
```

---

### Task 2: Restructure `#panel-text` markup and wire the Misc accordion

**Files:**
- Modify: `static/index.html:159-242` (the `#panel-text` block)
- Modify: `static/editor.js` (add one wiring call near the existing `wireTextStyleToggle(...)` calls)

**Interfaces:**
- Consumes: `UI.accordion(header, body, options)` from Task 1.
- Produces: nothing consumed by later tasks (this is the final task in the plan).

- [ ] **Step 1: Restructure `#panel-text` in `static/index.html`**

Replace the current `#panel-text` block (lines 159-242) with:

```html
      <div id="panel-text" class="context-panel" hidden>
        <div class="style-panel-header">TEXT OVERLAY &middot; STYLE</div>

        <div class="style-group">
          <textarea id="text-heading" placeholder="Heading" rows="3"></textarea>
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
              <label class="style-field" id="text-font-field">
                FONT
                <select id="text-font">
                  <option value="Public Sans">Public Sans</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                </select>
              </label>
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
```

Note: every inner element ID (`text-start-field`, `text-font`, `text-size-field`, `text-bold`, `text-italic`, `text-underline`, `text-color-field`, `text-outline-color-field`, `text-outline-px-field`, `text-box`, `text-box-color-field`, `text-align-group`, `position-row-group`, `position-col-group`, `text-offset-x-field`, `text-offset-y-field`) is unchanged from the current markup — only their wrapping structure changed. `editor.js`'s existing `document.getElementById(...)` calls need no changes.

- [ ] **Step 2: Wire the accordion in `static/editor.js`**

In `static/editor.js`, immediately after the existing three `wireTextStyleToggle(...)` calls (currently lines 152-154):

```js
wireTextStyleToggle("text-bold", "bold");
wireTextStyleToggle("text-italic", "italic");
wireTextStyleToggle("text-underline", "underline");

UI.accordion(document.getElementById("text-misc-header"), document.getElementById("text-misc-body"), { expanded: false });
```

- [ ] **Step 3: Manual verification**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`.

1. Click a clip's TEXT selection (or however the TEXT panel is opened — click the TEXT row block in the timeline, or the equivalent selection action) so `#panel-text` is visible.
2. Confirm the heading textarea is visible immediately, and the MISC header is visible below it with the body collapsed (TIME/STYLE/etc. not visible).
3. Click the MISC header — confirm TIME, STYLE, color/outline/box, TEXT ALIGN, and POSITION controls all appear, and the chevron rotates 90°.
4. Type in the heading textarea — confirm the stage preview text updates (proves `updateTextBlock` wiring untouched).
5. Toggle Bold — confirm the stage preview reflects it (proves controls inside the accordion body still function after the markup move).
6. Click the MISC header again — confirm it collapses.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`, in the `static/index.html` inventory line, note the new accordion structure. Find the line describing `static/index.html` (starts with `` `static/index.html` — editor page: ``) and append a clause:

```
; the TEXT context-panel section (`#panel-text`) has a `#text-misc-header`/`#text-misc-body` accordion (wired via `UI.accordion`, added 2026-07-15) collapsing everything below the heading textarea into a MISC section, collapsed by default
```

Also add `UI.accordion(header, body, options)` to the `static/ui-components.js` inventory bullet in `CLAUDE.md`, following the same one-line style as the existing `buttonGroup`/`numberField`/`colorSwatch` descriptions.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/editor.js CLAUDE.md
git commit -m "feat: collapse TEXT panel misc controls into a MISC accordion"
```

- [ ] **Step 6: Run `superpowers:finishing-a-development-branch`** to decide merge/PR/cleanup for the branch.
