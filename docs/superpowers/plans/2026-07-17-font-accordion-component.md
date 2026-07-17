# Font Accordion Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the TEXT panel's FONT accordion into a reusable `UI.fontAccordion` component built on a new shared `UI.accordionSection` shell, and migrate the existing MISC accordion onto that same shell.

**Architecture:** Two new flat `static/ui-*.js` files, following the codebase's one-component-per-file convention: `ui-accordion-section.js` (a generic shell that builds an accordion header from a title and wires it to an existing/fresh body via the existing `UI.accordion`) and `ui-font-accordion.js` (builds the FONT select markup and hands it to the shell). `static/index.html` and `static/editor.js` are updated to use them, first for MISC (Task 1, proves the shell works against existing static markup) then for FONT (Task 2, proves it works for JS-created markup).

**Tech Stack:** Vanilla JS (no build step/bundler/framework), served as static files by FastAPI's `StaticFiles` mount.

## Global Constraints

- No JS build step/bundler — icon SVGs are hand-inlined directly in markup, using Lucide icon paths with the wrapper style `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` (CLAUDE.md Conventions).
- Reusable JS logic — `window.UI.*` components — each live in their own file, one component per file; never grouped into a shared catch-all file (CLAUDE.md Conventions).
- Every `static/*.js` file opens with a one- or two-line comment stating that file's purpose/role (CLAUDE.md Conventions).
- No changes to the CAPTIONS panel, any text-block/preset data model, ASS rendering, or export logic (spec: Out of scope).
- No persistence of either accordion's expanded/collapsed state — both always start collapsed (spec: Out of scope).
- No new pytest coverage needed — this is JS-only UI wiring; `app/` Python layer is untouched (spec: Testing).

---

### Task 1: `UI.accordionSection` shell + migrate MISC onto it

**Files:**
- Create: `static/ui-accordion-section.js`
- Modify: `static/index.html:177-199` (MISC's header/body markup), `static/index.html:279` (script tags)
- Modify: `static/editor.js:163` (MISC's `UI.accordion(...)` call)

**Interfaces:**
- Consumes: `window.UI.accordion(header, body, { expanded })` — existing function in `static/ui-accordion.js`, returns an `(isExpanded) => void` updater (not used here).
- Produces: `window.UI.accordionSection(container, body, { title, expanded = false })` → `{ header, body }`. `container` is the parent to append into; `body` is either an existing DOM element (already possibly a child of `container`) or a freshly created, unattached element — `accordionSection` appends both header and body into `container` (a no-op reposition if `body` is already `container`'s last child) and adds the `accordion-body` class to `body`. Task 2 depends on this exact signature.

- [ ] **Step 1: Create the shell component**

Create `static/ui-accordion-section.js`:

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Builds an accordion header (title + chevron) for a body element (existing or freshly created)
// and wires the pair via UI.accordion. Callers own the body's content.
window.UI = window.UI || {};

window.UI.accordionSection = function accordionSection(container, body, { title, expanded = false } = {}) {
  const header = document.createElement("button");
  header.type = "button";
  header.className = "accordion-header";
  header.innerHTML = `${title} <svg class="accordion-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

  body.classList.add("accordion-body");
  container.appendChild(header);
  container.appendChild(body);

  window.UI.accordion(header, body, { expanded });

  return { header, body };
};
```

- [ ] **Step 2: Wire the new script tag**

In `static/index.html`, find line 279 (`<script src="/static/ui-accordion.js"></script>`) and add the new tag directly after it:

```html
<script src="/static/ui-accordion.js"></script>
<script src="/static/ui-accordion-section.js"></script>
```

- [ ] **Step 3: Update MISC's markup to use the shell**

In `static/index.html`, replace this block (currently lines 195-199):

```html
        <button id="text-misc-header" class="accordion-header" type="button" aria-expanded="false">
          MISC
          <svg class="accordion-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <div id="text-misc-body" class="accordion-body" hidden>
```

with:

```html
        <div id="text-misc-accordion">
        <div id="text-misc-body">
```

Leave everything between the opening `<div id="text-misc-body">` tag and its matching closing `</div>` completely unchanged (the TIME/STYLE/color/box/align/position content — currently lines 200-270). Find the two closing `</div>` lines right before `</aside>` (currently lines 271-272: line 271 closes `#text-misc-body`, line 272 closes `#panel-text`). Insert one new `</div>` between them, to close the new `#text-misc-accordion` wrapper:

```html
          </div>
        </div>
      </div>
    </aside>
```

(the first `</div>` here is the existing one closing `#text-misc-body`; the second is the new one closing `#text-misc-accordion`; the third, `</div>`, is the existing one closing `#panel-text`.)

- [ ] **Step 4: Update editor.js's MISC wiring call**

In `static/editor.js`, replace line 163:

```js
UI.accordion(document.getElementById("text-misc-header"), document.getElementById("text-misc-body"), { expanded: false });
```

with:

```js
UI.accordionSection(document.getElementById("text-misc-accordion"), document.getElementById("text-misc-body"), { title: "MISC", expanded: false });
```

- [ ] **Step 5: Verify manually in the browser**

Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`.

- Select the text block (click the TEXT row in the timeline, or the TEXT nav icon) so `#panel-text` opens.
- Confirm MISC renders collapsed by default (body hidden).
- Click the MISC header: confirm the body reveals, the chevron rotates, and all fields inside (TIME/SIZE/B-I-U/colors/box/TEXT ALIGN/POSITION/offsets) are visible and still change the preview when edited (e.g. change SIZE, confirm the heading text on the 9:16 stage resizes).
- Click the MISC header again: confirm it collapses.
- Open the browser console (or `read_console_messages` if using the Claude Browser tools): confirm no errors.

- [ ] **Step 6: Commit**

```bash
git add static/ui-accordion-section.js static/index.html static/editor.js
git commit -m "$(cat <<'EOF'
feat: add UI.accordionSection shell, migrate MISC accordion onto it

Factors the accordion header+chevron markup and UI.accordion wiring
into a reusable shell so MISC (and, next, FONT) stop duplicating it.
EOF
)"
```

**Handoff:** Task 1 complete and committed. **Continue in the current session** rather than starting a new one — Task 2 directly reuses the shell just built and the orchestrating session already holds the full spec/plan rationale, so a fresh session would just re-load the same context. Dispatch Task 2 as a subagent (subagent-driven-development), model `claude-sonnet-5` (aka Sonnet 5), medium reasoning effort (straightforward DOM-building work following an established pattern from Task 1, no architectural ambiguity left).

---

### Task 2: `UI.fontAccordion` component + migrate FONT onto it

**Files:**
- Create: `static/ui-font-accordion.js`
- Modify: `static/index.html:177-193` (FONT's header/body/select markup), `static/index.html` script tags (after Task 1's insertion)
- Modify: `static/editor.js:81` (initial value set), `static/editor.js:141-146` (change listener), `static/editor.js:162` (old `UI.accordion` call), `static/editor.js:77-136` (`renderTextPanel`, to add the new call)

**Interfaces:**
- Consumes: `window.UI.accordionSection(container, body, { title, expanded })` → `{ header, body }`, from Task 1's `static/ui-accordion-section.js`.
- Produces: `window.UI.fontAccordion(container, { value, onChange })` → `{ setValue(font) }`. `value` is the initial font string; `onChange(font)` fires on the select's `change` event.

- [ ] **Step 1: Create the Font accordion component**

Create `static/ui-font-accordion.js`:

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Builds a FONT-select accordion section (via UI.accordionSection) with a hardcoded
// font list matching the two vendored font families.
window.UI = window.UI || {};

window.UI.fontAccordion = function fontAccordion(container, { value, onChange }) {
  const body = document.createElement("div");

  const group = document.createElement("div");
  group.className = "style-group";
  const row = document.createElement("div");
  row.className = "style-row";
  const label = document.createElement("label");
  label.className = "style-field";
  label.textContent = "FONT";

  const select = document.createElement("select");
  ["Public Sans", "JetBrains Mono"].forEach((font) => {
    const option = document.createElement("option");
    option.value = font;
    option.textContent = font;
    select.appendChild(option);
  });
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));

  label.appendChild(select);
  row.appendChild(label);
  group.appendChild(row);
  body.appendChild(group);

  window.UI.accordionSection(container, body, { title: "FONT", expanded: false });

  return { setValue: (font) => { select.value = font; } };
};
```

- [ ] **Step 2: Wire the new script tag**

In `static/index.html`, add the new tag directly after `ui-accordion-section.js` (added in Task 1):

```html
<script src="/static/ui-accordion-section.js"></script>
<script src="/static/ui-font-accordion.js"></script>
```

- [ ] **Step 3: Replace FONT's static markup with a placeholder**

In `static/index.html`, replace this block (currently lines 177-193):

```html
        <button id="text-font-header" class="accordion-header" type="button" aria-expanded="false">
          FONT
          <svg class="accordion-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <div id="text-font-body" class="accordion-body" hidden>
          <div class="style-group">
            <div class="style-row">
              <label class="style-field" id="text-font-field">
                FONT
                <select id="text-font">
                  <option value="Public Sans">Public Sans</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                </select>
              </label>
            </div>
          </div>
        </div>
```

with:

```html
        <div id="text-font-accordion"></div>
```

- [ ] **Step 4: Remove FONT's old wiring from editor.js**

In `static/editor.js`:

1. Remove line 81: `document.getElementById("text-font").value = preset.font;`
2. Remove lines 141-146:
   ```js
   document.getElementById("text-font").addEventListener("change", async () => {
     const preset = ensureTextPreset(ensureTextBlock().preset_id);
     preset.font = document.getElementById("text-font").value;
     await saveProject();
     renderTextPreview();
   });
   ```
3. Remove line 162 (Task 1 left it unchanged, only touched line 163): `UI.accordion(document.getElementById("text-font-header"), document.getElementById("text-font-body"), { expanded: false });`

- [ ] **Step 5: Add the new FONT wiring inside `renderTextPanel()`**

In `static/editor.js`, inside `renderTextPanel()` (the function starting at line 77), add this call anywhere after `const preset = ensureTextPreset(block.preset_id);` (e.g. right after the line that previously set `text-font`'s value, which Step 4.1 removed):

```js
UI.fontAccordion(document.getElementById("text-font-accordion"), {
  value: preset.font,
  onChange: async (font) => {
    preset.font = font;
    await saveProject();
    renderTextPreview();
  },
});
```

- [ ] **Step 6: Verify manually in the browser**

Restart/reload the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000`.

- Select the text block so `#panel-text` opens.
- Confirm FONT renders above MISC, collapsed by default, with the select showing the current preset's font (`Public Sans` on a fresh project).
- Click the FONT header: confirm the body reveals and the chevron rotates, independently of MISC's expand/collapse state (expand FONT, confirm MISC stays collapsed and vice versa).
- Change the font select to `JetBrains Mono`: confirm the heading text on the 9:16 stage preview changes font immediately.
- Reload the page: confirm FONT still shows `JetBrains Mono` (persisted via `saveProject`).
- Open the browser console: confirm no errors.

- [ ] **Step 7: Commit**

```bash
git add static/ui-font-accordion.js static/index.html static/editor.js
git commit -m "$(cat <<'EOF'
feat: extract FONT accordion into UI.fontAccordion component

Builds on the UI.accordionSection shell from the MISC migration so
FONT no longer needs hand-written header/select markup in index.html,
and is reusable later by the CAPTIONS panel.
EOF
)"
```

**Handoff:** Task 2 complete and committed. **Continue in the current session** — Task 3 is a one-step process action (invoking a skill), not worth spinning up a fresh session for. Recommended: subagent-driven, model `claude-sonnet-5` (aka Sonnet 5), low reasoning effort (mechanical checklist, no design decisions).

---

### Task 3: Finish the development branch

**Files:** None (process step only).

- [ ] **Step 1: Run the finishing-a-development-branch skill**

Invoke `superpowers:finishing-a-development-branch` to decide how to integrate this work (merge, PR, or further cleanup) now that Tasks 1-2 are complete, committed, and manually verified.

**Handoff:** Plan complete once this step is done.
