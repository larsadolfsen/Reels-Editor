# Panel Button Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scattered, inconsistently-styled full-width panel action buttons (plain/danger/add-a-new-thing) with one shared `.panel-button` CSS component in three variants, at the 33px reference height measured from the existing `.new-project-btn`.

**Architecture:** A single new stylesheet, `static/css/components/panel-button.css`, defines `.panel-button` (base), `.panel-button-danger`, and `.panel-button-dashed`. No JS wrapper — these are static `<button>` elements in `index.html` (plus one JS-built button in `ui-project-picker.js`), so the component is applied purely via CSS classes, matching how `.new-project-btn`/`.icon-btn` already work today. Rollout happens in three self-contained passes (dashed "add" buttons, plain actions, danger deletes), each independently visible and testable in the browser, followed by deleting the CSS this component makes dead.

**Tech Stack:** Plain CSS + HTML, no build step (per project convention — no bundler, hand-authored CSS/JS).

## Global Constraints

- No JS build step/bundler exists in this project — do not introduce one.
- Every `static/css/components/*.css` file opens with a one/two-line header comment stating its purpose, exposed classes, and dependencies.
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — all styling lives in CSS classes.
- Reference height for `.panel-button` is **33px** (measured from `.new-project-btn`'s current rendered height — see spec). This is distinct from the existing `.button` component (42px, `Export`/theme-toggle, untouched by this work).
- Spec: `docs/superpowers/specs/2026-07-22-panel-button-component-design.md`.

## Setup (once, before Task 1)

This worktree has no `.venv`. Before doing any browser verification, set one up from the repo root:

```bash
python -m venv .venv && .venv/Scripts/pip install -e .[dev]
```

Then the dev server for manual verification is:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`. Every verification step below assumes this server is running and the page (or a hard reload, since static JS/CSS is cached — see project memory) has picked up the latest files.

---

### Task 1: Create `.panel-button` component + roll out the dashed "add" variant

**Files:**
- Create: `static/css/components/panel-button.css`
- Modify: `static/index.html:6` (add stylesheet link), `static/index.html:132` (`#add-clip`), `static/index.html:403` (`#project-create`), `static/index.html:411` (`#video-box-add`), `static/index.html:459` (`#audio-add-music`), `static/index.html:495` (`#text-add-block-btn`)
- Modify: `static/ui-project-picker.js:21` (`createBtn.className`)

**Interfaces:**
- Produces: CSS classes `.panel-button`, `.panel-button-danger`, `.panel-button-dashed` — consumed by Tasks 2 and 3.

- [ ] **Step 1: Create the component stylesheet**

Write `static/css/components/panel-button.css`:

```css
/* Full-width panel action buttons (right-hand context panels): plain action,
   destructive (danger), and "add a new thing" (dashed) variants, all 33px
   tall — the height measured from the pre-existing New Project button.
   Exposes .panel-button, .panel-button-danger, .panel-button-dashed.
   Depends on tokens.css. base.css's global button:hover rule provides the
   plain variant's hover state; danger/dashed override it below. */
.panel-button {
  width: 100%;
  height: 33px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.03em;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.panel-button-danger {
  color: var(--danger);
  border-color: var(--danger);
}

.panel-button-dashed {
  border-style: dashed;
  color: var(--text-secondary);
}
.panel-button-dashed:hover {
  color: var(--text);
  border-color: var(--border-hover-color);
  border-width: var(--border-hover-width);
}
```

- [ ] **Step 2: Link the stylesheet**

In `static/index.html`, line 6 currently reads:

```html
<link rel="stylesheet" href="/static/css/components/button.css">
```

Add the new link directly after it:

```html
<link rel="stylesheet" href="/static/css/components/button.css">
<link rel="stylesheet" href="/static/css/components/panel-button.css">
```

- [ ] **Step 3: Apply the dashed variant to the four static "add" buttons in `index.html`**

Line 132, `#add-clip` — from:

```html
          <button id="add-clip"><span class="icon">+</span><span class="label">IMPORT MEDIA</span></button>
```

to:

```html
          <button id="add-clip" class="panel-button panel-button-dashed"><span class="icon">+</span><span class="label">IMPORT MEDIA</span></button>
```

Line 403, `#project-create` — from:

```html
          <button id="project-create" class="new-project-btn col-8"><span class="icon">+</span><span class="label">NEW PROJECT</span></button>
```

to:

```html
          <button id="project-create" class="panel-button panel-button-dashed col-8"><span class="icon">+</span><span class="label">NEW PROJECT</span></button>
```

Line 411, `#video-box-add` — from:

```html
          <button id="video-box-add" type="button" class="col-8"><span class="icon">+</span><span class="label">ADD VIDEO BOX</span></button>
```

to:

```html
          <button id="video-box-add" type="button" class="panel-button panel-button-dashed col-8"><span class="icon">+</span><span class="label">ADD VIDEO BOX</span></button>
```

Line 459, `#audio-add-music` — from:

```html
          <button id="audio-add-music" type="button" class="col-8"><span class="icon">+</span><span class="label">ADD MUSIC</span></button>
```

to:

```html
          <button id="audio-add-music" type="button" class="panel-button panel-button-dashed col-8"><span class="icon">+</span><span class="label">ADD MUSIC</span></button>
```

Line 495, `#text-add-block-btn` — from:

```html
          <button id="text-add-block-btn" class="col-8" type="button">+ Add text</button>
```

to:

```html
          <button id="text-add-block-btn" class="panel-button panel-button-dashed col-8" type="button">+ Add text</button>
```

- [ ] **Step 4: Apply the dashed variant to the JS-built picker button**

In `static/ui-project-picker.js`, line 21 currently reads:

```javascript
  createBtn.className = "new-project-btn";
```

Change to:

```javascript
  createBtn.className = "panel-button panel-button-dashed";
```

- [ ] **Step 5: Verify in the browser**

With the dev server running, open `http://127.0.0.1:8000` (hard-reload to bypass static JS/CSS cache). Since this is a fresh browser localStorage, it should show the full-screen project picker — confirm the "+ NEW PROJECT" button renders with a dashed border at the same visual height as before (33px). Then:
1. Create a project to enter the editor.
2. Open the FILES panel (left rail) — confirm "+ IMPORT MEDIA" is dashed.
3. Open PROJECTS (right rail) — confirm "+ NEW PROJECT" is dashed.
4. Open VIDEO BOX — confirm "+ ADD VIDEO BOX" is dashed.
5. Open AUDIO — confirm "+ ADD MUSIC" is dashed.
6. Open TEXT with no text blocks yet — confirm "+ Add text" is dashed.

All five should look visually identical to each other (dashed border, muted secondary text, icon+label centered) and all should still work when clicked (no click-handler changes were made).

- [ ] **Step 6: Commit**

```bash
git add static/css/components/panel-button.css static/index.html static/ui-project-picker.js
git commit -m "feat: add panel-button component, roll out dashed add-action variant"
```

---

### Task 2: Roll out the plain variant to action buttons

**Files:**
- Modify: `static/index.html:196` (`#video-duplicate`), `static/index.html:209` (`#caption-auto-btn`), `static/index.html:217` (`#caption-style-save`), `static/index.html:476` (`#audio-replace`), `static/index.html:479` (`#audio-remove`), `static/index.html:502` (`#text-style-save`), `static/index.html:622` (`#text-duplicate`)

**Interfaces:**
- Consumes: `.panel-button` from Task 1.

- [ ] **Step 1: Apply `panel-button` to each plain-action button**

Line 196 — from:

```html
          <button id="video-duplicate" class="col-8" type="button">Duplicate clip</button>
```

to:

```html
          <button id="video-duplicate" class="panel-button col-8" type="button">Duplicate clip</button>
```

Line 209 — from:

```html
            <button id="caption-auto-btn" class="col-8" type="button">Auto-caption</button>
```

to:

```html
            <button id="caption-auto-btn" class="panel-button col-8" type="button">Auto-caption</button>
```

Line 217 — from:

```html
              <button id="caption-style-save" class="col-8" type="button">+ Save current style</button>
```

to:

```html
              <button id="caption-style-save" class="panel-button col-8" type="button">+ Save current style</button>
```

Line 476 — from:

```html
            <button id="audio-replace" class="col-8" type="button">Replace music</button>
```

to:

```html
            <button id="audio-replace" class="panel-button col-8" type="button">Replace music</button>
```

Line 479 — from:

```html
            <button id="audio-remove" class="col-8" type="button">Remove music</button>
```

to:

```html
            <button id="audio-remove" class="panel-button col-8" type="button">Remove music</button>
```

Line 502 — from:

```html
            <button id="text-style-save" class="col-8" type="button">+ Save current style</button>
```

to:

```html
            <button id="text-style-save" class="panel-button col-8" type="button">+ Save current style</button>
```

Line 622 — from:

```html
          <button id="text-duplicate" class="col-8" type="button">Duplicate text</button>
```

to:

```html
          <button id="text-duplicate" class="panel-button col-8" type="button">Duplicate text</button>
```

- [ ] **Step 2: Verify in the browser**

Hard-reload the editor (a project should already exist from Task 1). Confirm each of these renders at 33px with a solid (not dashed) border and muted text, and that clicking each still works:
1. VIDEO panel, a clip selected — "Duplicate clip".
2. CAPTIONS panel — "Auto-caption", and (after transcribing or not) "+ Save current style" in its Style tab.
3. AUDIO panel with music added — "Replace music" / "Remove music".
4. TEXT panel with a text block selected — "+ Save current style" (Style tab), "Duplicate text".

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: roll out panel-button plain variant to action buttons"
```

---

### Task 3: Roll out the danger variant to delete buttons, delete dead CSS

**Files:**
- Modify: `static/index.html:200` (`#video-delete`), `static/index.html:451` (`#video-box-delete`), `static/index.html:626` (`#text-delete`)
- Modify: `static/css/components/style-panel.css` (remove the `#video-delete, #text-delete` danger block)
- Modify: `static/css/components/video-box-panel.css` (remove the `#video-box-delete` danger block)
- Modify: `static/css/components/project-picker.css` (remove `.new-project-btn`/`.new-project-btn:hover`, fix header comment)

**Interfaces:**
- Consumes: `.panel-button`, `.panel-button-danger` from Task 1.

- [ ] **Step 1: Apply `panel-button panel-button-danger` to each delete button**

Line 200 — from:

```html
          <button id="video-delete" class="col-8" type="button">Delete clip</button>
```

to:

```html
          <button id="video-delete" class="panel-button panel-button-danger col-8" type="button">Delete clip</button>
```

Line 451 — from:

```html
            <button id="video-box-delete" type="button" class="col-8">Delete video box</button>
```

to:

```html
            <button id="video-box-delete" type="button" class="panel-button panel-button-danger col-8">Delete video box</button>
```

Line 626 — from:

```html
          <button id="text-delete" class="col-8" type="button">Delete text</button>
```

to:

```html
          <button id="text-delete" class="panel-button panel-button-danger col-8" type="button">Delete text</button>
```

- [ ] **Step 2: Delete the now-dead danger CSS in `style-panel.css`**

Remove this block (currently around line 247):

```css
#video-delete, #text-delete {
  width: 100%;
  margin-top: var(--space-3);
  color: var(--danger, #e5484d);
  border-color: var(--danger, #e5484d);
}
```

- [ ] **Step 3: Delete the now-dead danger CSS in `video-box-panel.css`**

The file currently reads:

```css
/* VIDEO BOX context panel: add-picker list + trim/time/position/size detail view. */
/* Exposes #panel-video-box's internal layout only. Depends on tokens.css, style-panel.css. */
#video-box-picker-list { max-height: 320px; overflow-y: auto; }

#video-box-delete {
  width: 100%;
  margin-top: var(--space-3);
  color: var(--danger, #e5484d);
  border-color: var(--danger, #e5484d);
}
```

Replace it with:

```css
/* VIDEO BOX context panel: add-picker list + trim/time/position/size detail view. */
/* Exposes #panel-video-box's internal layout only. Depends on tokens.css, style-panel.css. */
#video-box-picker-list { max-height: 320px; overflow-y: auto; }
```

- [ ] **Step 4: Delete the now-dead `.new-project-btn` CSS in `project-picker.css`**

The file's header comment currently reads:

```css
/* Full-screen project picker shown at cold start when no valid localStorage project is found. */
/* Exposes #project-picker/.project-picker-inner/.project-picker-heading/.project-picker-empty/ */
/* .project-picker-list, plus .new-project-btn (shared with panel-projects.js's create button). */
/* Depends on tokens.css, project-list-row.css. */
```

Change to:

```css
/* Full-screen project picker shown at cold start when no valid localStorage project is found. */
/* Exposes #project-picker/.project-picker-inner/.project-picker-heading/.project-picker-empty/ */
/* .project-picker-list. Depends on tokens.css, project-list-row.css. */
```

Then remove these two rules entirely (currently near the end of the file):

```css
.new-project-btn {
  width: 100%;
  border: 1px dashed var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 9px 0;
  margin-bottom: var(--space-3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
}
.new-project-btn:hover { border-color: var(--border-hover-color); border-width: var(--border-hover-width); color: var(--text); }
```

(Leave the rest of `project-picker.css` — `#project-picker`, `.project-picker-inner`, `.project-picker-heading`, `.project-picker-empty` — untouched.)

- [ ] **Step 5: Confirm no remaining references to the deleted class**

```bash
grep -rn "new-project-btn" static/
```

Expected: no output (the class name should no longer appear anywhere).

- [ ] **Step 6: Verify in the browser**

Hard-reload the editor. Confirm each delete button renders red (border + text), at 33px, matching the other `.panel-button` variants in width/height, and still deletes on click:
1. VIDEO panel, a clip selected — "Delete clip".
2. VIDEO BOX panel, a box added and selected — "Delete video box".
3. TEXT panel, a text block selected — "Delete text".

Also reload the full-screen picker view (clear `localStorage.projectId` via devtools, or open in a private window) to confirm "+ NEW PROJECT" still renders correctly with no console errors about a missing `.new-project-btn` rule.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/css/components/style-panel.css static/css/components/video-box-panel.css static/css/components/project-picker.css
git commit -m "feat: roll out panel-button danger variant, remove dead ad hoc button CSS"
```

---

## Codebase Map Update

After Task 3, update `CLAUDE.md`'s codebase map (per the project's own convention: any commit adding/removing files, or new reusable inventory items, updates the map in the same commit — fold this into Task 3's commit):

- Add `static/css/components/panel-button.css` to the File Structure tree, alongside the other `components/` entries, e.g.:
  `panel-button.css` — full-width panel action buttons: `.panel-button` (plain, 33px) / `.panel-button-danger` / `.panel-button-dashed` (icon+label add-actions); replaces the old one-off `.new-project-btn` and per-ID danger overrides (added 2026-07-22, panel-button component).
- In the "Shared UI components" inventory section, add a one-line entry noting `.panel-button` as a plain-CSS-class component (no JS wrapper), listing its three variants and where it's used (VIDEO/TEXT/CAPTIONS/VIDEO BOX/AUDIO/PROJECTS panels + the full-screen picker).
