# Text Styling Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace six hand-rolled, drifted copies of the same "small caps mono label" text style with one canonical component (`UI.text` + `.text-micro-label`), and delete dead accordion code found during the audit.

**Architecture:** A new minimal presentational helper `static/ui-text.js` (mirrors the existing `static/ui-divider.js` pattern) creates one DOM element stamped with a role-based CSS class from a new `static/css/components/text.css`. Every existing hand-rolled label call site is migrated to call it instead of setting its own `font-family`/`font-size`/`letter-spacing`/`color`. Each migrated CSS class keeps only its own layout properties (margin/padding/list-style) — never typography.

**Tech Stack:** Vanilla JS (`window.UI.*` classic-script pattern, no build step), plain CSS with custom properties (`tokens.css`). No frontend test framework exists in this repo (see Global Constraints).

## Global Constraints

- No JS build step/bundler — every new file is a plain classic `<script>`/`<link>` added to `static/index.html`. (See project CLAUDE.md, "Conventions".)
- One function/component per file for `window.UI.*` helpers — never a shared catch-all file. (Project CLAUDE.md.)
- No inline `style="..."` attributes anywhere. (Project CLAUDE.md.)
- Every `static/*.js` and `static/css/**/*.css` file must open with a 1–2 line header comment stating its purpose; update it if a file's role changes.
- **This repo has no frontend test framework** (`pytest` only covers `app/*.py`; there is no JS test runner). Per the project's "Tests are my quality guarantee" rule, this is a stated, unavoidable gap for this plan: every task is UI-only and is verified manually against the running dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`, http://127.0.0.1:8000) instead of an automated test. Each task's steps say exactly what to look at and what result confirms success.
- Canonical style already approved (do not re-derive): `font-family: var(--font-ui); font-size: 10.5px; letter-spacing: 0.06em; color: var(--text-muted);` — one size, no per-role variants.
- `.color-swatch-label` is explicitly out of scope (different role — see spec).
- Work happens in a fresh git worktree (per `superpowers:using-git-worktrees`), branched from current `main` (`c5a02c5` at time of writing, which already contains the design spec at `docs/superpowers/specs/2026-07-22-text-styling-component-design.md`).

---

## File Structure

**Create:**
- `static/ui-text.js` — the `UI.text()` component.
- `static/css/components/text.css` — the canonical `.text-micro-label` rule.

**Modify:**
- `static/index.html` — add the two new `<link>`/`<script>` tags; rename 10 `style-panel-header` + 19 `style-group-label` static divs to also carry `text-micro-label`; remove the two dead accordion tags.
- `static/ui-number-field.js` — field label uses `UI.text`.
- `static/panel-media.js` — VIDEOS/IMAGES group label uses `UI.text`.
- `static/ui-settings-row.js` — row label uses `UI.text`.
- `static/ui-sub-panel-header.js` — drill-down title uses `UI.text`.
- `static/css/components/style-panel.css` — strip typography from `.style-panel-header`, `.style-group-label`, `.style-field`, `.clip-section-label`; fix the `#clip-list li` selector so it no longer styles the section-label row as a card.
- `static/css/components/settings-row.css` — delete `.settings-row-label` (now fully redundant).
- `static/css/components/sub-panel.css` — delete `.sub-panel-title` (now fully redundant).

**Delete (dead code found during audit — confirmed zero real call sites beyond each other):**
- `static/ui-accordion.js`
- `static/ui-accordion-section.js`
- `static/css/components/accordion.css`

---

### Task 1: Create the `UI.text` component

**Files:**
- Create: `static/ui-text.js`
- Create: `static/css/components/text.css`
- Modify: `static/index.html:6` (insert CSS link), `static/index.html:652` (insert script tag, immediately before the existing `<script src="/static/ui-button-group.js"></script>` line)

**Interfaces:**
- Produces: `window.UI.text(container, value, { role = "micro-label", as = "span" } = {}) -> HTMLElement`. Creates one element of tag `as`, sets `className = "text-${role}"` and `textContent = value`, appends it to `container`, returns the element. Every later task in this plan calls this exact signature with `{ role: "micro-label" }`.

- [ ] **Step 1: Create `static/ui-text.js`**

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on static/css/components/text.css. No app state — callers own data.

// Renders one text element into `container`, stamped with the shared style for `role`
// (currently only "micro-label" exists: the small caps mono label used for field labels,
// section headers, and settings-row/sub-panel titles — see
// docs/superpowers/specs/2026-07-22-text-styling-component-design.md). `as` (default "span")
// sets the created tag, so callers needing a specific element type (e.g. an <li> for a list
// row) can still get the shared style. Returns the created element.
window.UI = window.UI || {};

window.UI.text = function text(container, value, { role = "micro-label", as = "span" } = {}) {
  const el = document.createElement(as);
  el.className = `text-${role}`;
  el.textContent = value;
  container.appendChild(el);
  return el;
};
```

- [ ] **Step 2: Create `static/css/components/text.css`**

```css
/* Canonical text-role styles — the single source of truth for small-label typography that
   was previously hand-rolled per component (six near-duplicate rules; see
   docs/superpowers/specs/2026-07-22-text-styling-component-design.md). */
/* Exposes .text-micro-label. Depends on tokens.css. Built by static/ui-text.js. */
.text-micro-label {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Wire it into `static/index.html`**

At line 6 (right after the `button.css` link), insert:

```html
<link rel="stylesheet" href="/static/css/components/text.css">
```

At line 652 (right before `<script src="/static/ui-button-group.js"></script>`), insert:

```html
<script src="/static/ui-text.js"></script>
```

- [ ] **Step 4: Verify by loading the app**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open http://127.0.0.1:8000, open the browser console, and run:

```js
typeof UI.text === "function"
```

Expected: `true`, with no console errors on page load (confirms `ui-text.js` loaded before every consumer added in later tasks — none exist yet, so this just confirms the file itself loads cleanly).

- [ ] **Step 5: Commit**

```bash
git add static/ui-text.js static/css/components/text.css static/index.html
git commit -m "feat: add UI.text canonical label component"
```

---

### Task 2: Migrate field labels (`WIDTH (PX)`, `START (SEC)`, etc.)

**Files:**
- Modify: `static/ui-number-field.js`
- Modify: `static/css/components/style-panel.css:90-98`

**Interfaces:**
- Consumes: `UI.text(container, value, { role: "micro-label" })` from Task 1.

- [ ] **Step 1: Replace the raw text assignment in `static/ui-number-field.js`**

Find:

```js
window.UI.numberField = function numberField(container, { label, unit, value, step = 1, min, max, decimals, disabled = false, span = 8, onChange }) {
  container.innerHTML = "";
  container.classList.add("style-field", `col-${span}`);
  container.textContent = unit ? `${label} (${unit})` : label;
```

Replace with:

```js
window.UI.numberField = function numberField(container, { label, unit, value, step = 1, min, max, decimals, disabled = false, span = 8, onChange }) {
  container.innerHTML = "";
  container.classList.add("style-field", `col-${span}`);
  UI.text(container, unit ? `${label} (${unit})` : label, { role: "micro-label" });
```

(Nothing else in the function changes — the rest of the function still builds `wrap`/`input`/`stepper` and appends `wrap` after the label.)

- [ ] **Step 2: Strip typography from `.style-field` in `static/css/components/style-panel.css:90-98`**

Find:

```css
.style-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}
```

Replace with:

```css
.style-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

- [ ] **Step 3: Verify in the running app**

With the dev server running (reload picks up the change), open the VIDEO BOX panel (any project with a video box, or add one), and in the browser console run:

```js
document.querySelector('#video-box-width-field .text-micro-label').textContent
```

Expected: `"WIDTH (PX)"`. Also visually confirm the label now renders at the same size/weight as the "VIDEOS"/"SIZE"/"TRIM" section labels elsewhere in the panel (slightly bigger and lighter than before — this is the approved, intentional change).

- [ ] **Step 4: Commit**

```bash
git add static/ui-number-field.js static/css/components/style-panel.css
git commit -m "refactor: field labels use the canonical UI.text component"
```

---

### Task 3: Migrate the FILES panel's VIDEOS/IMAGES group label, and fix its background/hover bug

**Files:**
- Modify: `static/panel-media.js`
- Modify: `static/css/components/style-panel.css:157-204`

**Interfaces:**
- Consumes: `UI.text(container, value, { role: "micro-label" })` from Task 1.

**Context — the bug:** `.clip-section-label` is a plain `<li>` inside `#clip-list`. `#clip-list li { background: var(--bg-2); border: 1px solid var(--border-soft); padding: var(--space-2); cursor: pointer; }` matches it too, because a tag+ID selector (specificity `(1,0,1)`) beats a lone class selector (specificity `(0,1,0)`) — so the card styling (and even the card's own uniform `padding: var(--space-2)`) wins over `.clip-section-label`'s intended `padding: var(--space-2) 0 4px`. That's why "VIDEOS" visibly renders with a background, border, hover effect, and boxy padding it should never have.

- [ ] **Step 1: Update `appendGroup` in `static/panel-media.js`**

Find:

```js
  function appendGroup(list, label, items) {
    if (!items.length) return;
    const labelLi = document.createElement("li");
    labelLi.className = "clip-section-label";
    labelLi.textContent = label;
    list.appendChild(labelLi);
    items.forEach((m) => list.appendChild(buildRow(m)));
  }
```

Replace with:

```js
  function appendGroup(list, label, items) {
    if (!items.length) return;
    const labelLi = document.createElement("li");
    labelLi.className = "clip-section-label";
    UI.text(labelLi, label, { role: "micro-label" });
    list.appendChild(labelLi);
    items.forEach((m) => list.appendChild(buildRow(m)));
  }
```

- [ ] **Step 2: Strip typography from `.clip-section-label` and exclude it from the card rule, in `static/css/components/style-panel.css`**

Find (around line 157):

```css
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
```

Replace with:

```css
#clip-list li:not(.clip-section-label) {
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
```

Find (around line 196):

```css
.clip-section-label {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: var(--space-2) 0 4px;
  list-style: none;
}
.clip-section-label:first-child { padding-top: 0; }
```

Replace with:

```css
.clip-section-label {
  padding: var(--space-2) 0 4px;
  list-style: none;
}
.clip-section-label:first-child { padding-top: 0; }
```

- [ ] **Step 3: Verify in the running app**

Open the FILES panel on a project with at least one video and one image imported (or import one via IMPORT MEDIA). In the browser console:

```js
JSON.stringify([...document.querySelectorAll('.clip-section-label')].map(li => ({
  text: li.textContent,
  bg: getComputedStyle(li).backgroundColor,
  borderWidth: getComputedStyle(li).borderTopWidth,
  cursor: getComputedStyle(li).cursor,
})))
```

Expected: `bg` is `rgba(0, 0, 0, 0)` (transparent — no card background), `borderWidth` is `"0px"`, `cursor` is `"auto"` (not `"pointer"`), for both the `VIDEOS` and `IMAGES` rows. Visually confirm they now render as plain flush-left text with no card box or hover highlight, matching the mockup.

- [ ] **Step 4: Commit**

```bash
git add static/panel-media.js static/css/components/style-panel.css
git commit -m "fix: VIDEOS/IMAGES section labels no longer render as clickable cards"
```

---

### Task 4: Migrate settings-row labels

**Files:**
- Modify: `static/ui-settings-row.js`
- Modify: `static/css/components/settings-row.css:19-24`

**Interfaces:**
- Consumes: `UI.text(container, value, { role: "micro-label" })` from Task 1.

- [ ] **Step 1: Update `static/ui-settings-row.js`**

Find:

```js
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

Replace with:

```js
window.UI.settingsRow = function settingsRow(container, { label, value, valueFontFamily, onClick }) {
  container.innerHTML = "";
  container.classList.add("settings-row");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-row-btn";

  UI.text(btn, label, { role: "micro-label" });

  const valueEl = document.createElement("span");
  valueEl.className = "settings-row-value";
  valueEl.textContent = value;
  if (valueFontFamily) valueEl.style.fontFamily = valueFontFamily;

  const valueGroup = document.createElement("span");
  valueGroup.className = "settings-row-value-group";
  valueGroup.innerHTML = '<svg class="settings-row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  valueGroup.prepend(valueEl);

  btn.append(valueGroup);
  btn.addEventListener("click", () => onClick());
  container.appendChild(btn);

  return (v, fontFamily) => {
    valueEl.textContent = v;
    valueEl.style.fontFamily = fontFamily || "";
  };
};
```

- [ ] **Step 2: Delete the now-redundant `.settings-row-label` rule from `static/css/components/settings-row.css`**

Find:

```css
.settings-row-label {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

```

Delete this whole block (including the trailing blank line).

- [ ] **Step 3: Verify in the running app**

Open the SETTINGS panel (uses a settings row for Theme) or the TEXT panel's FONT drill-down entry (Font Family / Weight rows also use `UI.settingsRow`). In the browser console:

```js
document.querySelector('.settings-row-btn .text-micro-label') !== null
```

Expected: `true`. Visually confirm the row's label (e.g. "Theme", "Font Family") looks unchanged (it was already 10.5px/0.06em/`--text-muted` — this migration is a pure refactor, not a visual change).

- [ ] **Step 4: Commit**

```bash
git add static/ui-settings-row.js static/css/components/settings-row.css
git commit -m "refactor: settings-row label uses the canonical UI.text component"
```

---

### Task 5: Migrate sub-panel drill-down titles

**Files:**
- Modify: `static/ui-sub-panel-header.js`
- Modify: `static/css/components/sub-panel.css:26-31`

**Interfaces:**
- Consumes: `UI.text(container, value, { role: "micro-label" })` from Task 1.

- [ ] **Step 1: Update `static/ui-sub-panel-header.js`**

Find:

```js
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

Replace with:

```js
window.UI.subPanelHeader = function subPanelHeader(container, { title, onBack }) {
  container.innerHTML = "";
  container.classList.add("sub-panel-header");

  const back = document.createElement("button");
  back.type = "button";
  back.className = "sub-panel-back";
  back.setAttribute("aria-label", "Back");
  back.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  back.addEventListener("click", () => onBack());

  container.append(back);
  UI.text(container, title, { role: "micro-label" });
};
```

- [ ] **Step 2: Delete the now-redundant `.sub-panel-title` rule from `static/css/components/sub-panel.css`**

Find:

```css
.sub-panel-title {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

```

Delete this whole block (including the trailing blank line). Note this migration also fixes a second drift instance: this rule used `--text-dim`, not the canonical `--text-muted` — one more accidental variant the audit caught.

- [ ] **Step 3: Verify in the running app**

Open the TEXT panel's Font Family drill-down (click into the font family settings row). In the browser console:

```js
document.querySelector('.sub-panel-header .text-micro-label')?.textContent
```

Expected: `"Font Family"`. Visually confirm the drill-down title is now slightly lighter (`--text-muted` instead of the old `--text-dim`) — a small, intentional consistency fix.

- [ ] **Step 4: Commit**

```bash
git add static/ui-sub-panel-header.js static/css/components/sub-panel.css
git commit -m "refactor: sub-panel drill-down title uses the canonical UI.text component"
```

---

### Task 6: Migrate static panel/section headers in `index.html`

**Files:**
- Modify: `static/index.html` (29 lines: 10 `style-panel-header` divs, 19 `style-group-label` divs)
- Modify: `static/css/components/style-panel.css:43-49` and `:60-66`

**Interfaces:** None (pure static markup + CSS; no JS component call here since these are static divs, not JS-generated).

- [ ] **Step 1: Add `text-micro-label` to every `style-panel-header` div in `static/index.html`**

These are the 10 lines (confirmed via `grep -n 'style-panel-header' static/index.html` against current `main`): 130, 138, 206, 364, 379, 401, 409, 457, 485, 491. Each currently reads:

```html
<div class="style-panel-header">TEXT_HERE</div>
```

(where `TEXT_HERE` is one of: FILES, VIDEO, CAPTIONS, SETTINGS, EXPORT, PROJECTS, VIDEO BOX, AUDIO, LAYERS, TEXT — one per line, matching the line numbers above in order). For every one of these 10 lines, change the class attribute from:

```html
class="style-panel-header"
```

to:

```html
class="style-panel-header text-micro-label"
```

leaving the element's text content and every other attribute untouched.

- [ ] **Step 2: Add `text-micro-label` to every `style-group-label` div in `static/index.html`**

These are the 19 lines (confirmed via `grep -n 'style-group-label' static/index.html` against current `main`): 147, 152, 159, 175, 263, 285, 296, 301, 317, 355, 370, 375, 411, 423, 433, 520, 542, 553, 558. Each currently reads:

```html
<div class="style-group-label">TEXT_HERE</div>
```

For every one of these 19 lines, change the class attribute from:

```html
class="style-group-label"
```

to:

```html
class="style-group-label text-micro-label"
```

leaving the element's text content and every other attribute untouched.

- [ ] **Step 3: Strip typography from `.style-panel-header` in `static/css/components/style-panel.css:43-49`**

Find:

```css
.style-panel-header {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin-bottom: var(--space-4);
}
```

Replace with:

```css
.style-panel-header {
  margin-bottom: var(--space-4);
}
```

(This is a third drift instance the audit caught: `--text-dim` instead of the canonical `--text-muted` — fixed by removing the property entirely in favor of `.text-micro-label`.)

- [ ] **Step 4: Strip typography from `.style-group-label` in `static/css/components/style-panel.css:60-66`**

Find:

```css
.style-group-label {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}
```

Replace with:

```css
.style-group-label {
  margin-bottom: var(--space-2);
}
```

- [ ] **Step 5: Verify in the running app**

Reload the app and click through every panel in `#panel-nav` (FILES, TEXT, CAPTIONS, VIDEO BOX, AUDIO, LAYERS, SETTINGS, EXPORT, PROJECTS) plus VIDEO (select a clip). In the browser console after visiting all of them:

```js
[...document.querySelectorAll('.style-panel-header, .style-group-label')].every(el => el.classList.contains('text-micro-label'))
```

Expected: `true`. Visually confirm every panel header (e.g. "FILES", "TEXT") and every group label (e.g. "SIZE", "TRIM", "BORDER", "POSITION") still lines up with correct spacing — only `.style-panel-header`'s color should visibly shift (slightly lighter, `--text-dim` → `--text-muted`); `.style-group-label` was already canonical so it should look pixel-identical.

- [ ] **Step 6: Commit**

```bash
git add static/index.html static/css/components/style-panel.css
git commit -m "refactor: static panel/section headers use the canonical UI.text style"
```

---

### Task 7: Remove dead accordion code

**Files:**
- Delete: `static/ui-accordion.js`
- Delete: `static/ui-accordion-section.js`
- Delete: `static/css/components/accordion.css`
- Modify: `static/index.html` (remove 3 tags: 1 `<link>`, 2 `<script>`)

**Context:** Confirmed via `grep -rn "UI\.accordion(" static/*.js` that the only caller of `UI.accordion`/`UI.accordionSection` is `ui-accordion-section.js` itself — every panel migrated from accordions to `UI.tabBar` already (per the codebase map). The remaining "accordion" hits in `font-fit.js`, `panel-text.js`, `preview-text.js`, and the `#text-accordions` div id in `index.html` are stale comments/an id name only, not real usage — leave those untouched (out of scope, unrelated cleanup).

- [ ] **Step 1: Delete the two dead JS files**

```bash
git rm static/ui-accordion.js static/ui-accordion-section.js
```

- [ ] **Step 2: Delete the dead CSS file**

```bash
git rm static/css/components/accordion.css
```

- [ ] **Step 3: Remove the corresponding tags from `static/index.html`**

Remove this line (currently line 16, alongside the other `<link rel="stylesheet" href="/static/css/components/*.css">` tags):

```html
<link rel="stylesheet" href="/static/css/components/accordion.css">
```

Remove these two lines (currently lines 655 and 657, alongside the other `ui-*.js` script tags):

```html
<script src="/static/ui-accordion.js"></script>
```

```html
<script src="/static/ui-accordion-section.js"></script>
```

- [ ] **Step 4: Verify in the running app**

Reload the app fully (hard refresh) and check the browser console for 404s or reference errors. In the console:

```js
document.querySelectorAll('script[src*="accordion"], link[href*="accordion"]').length
```

Expected: `0`, and no console errors. Click through every panel (TEXT, CAPTIONS in particular, since they used to use accordions before the tab-bar migration) to confirm nothing regresses.

- [ ] **Step 5: Commit**

```bash
git add static/index.html
git commit -m "chore: remove dead accordion component (superseded by UI.tabBar)"
```

---

## Post-plan note (not a task — flag only)

`.style-checkbox` in `static/css/components/style-panel.css:112-120` also has zero remaining call sites (`grep -rln "style-checkbox" static/*.js static/index.html` returns nothing), but it is unrelated to the text-styling drift this plan fixes — it's leftover dead code from a prior checkbox-based control that was replaced. Worth a follow-up cleanup task, not bundled here.
