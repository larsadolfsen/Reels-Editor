# Batch 1b — UI.text

> Part of the [UI Component Consistency master plan](2026-07-29-ui-component-consistency-master.md).
> REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.
> Depends on Batch 1 (tokens) being complete and committed first.

**Goal:** Build `UI.text(container, { variant, content })`, then migrate the six duplicate
"eyebrow label" recipes, the `.style-field` label pattern, and the hint-text pattern onto it.

## Global Constraints

See the [master plan](2026-07-29-ui-component-consistency-master.md#global-constraints).

## Task 5: Build `UI.text` + `text.css` + tests

**Files:**
- Create: `static/ui-text.js`
- Create: `static/css/components/text.css`
- Create: `tests/js/ui-text.test.js`
- Modify: `static/index.html` (add `<script>` and `<link>` tags)

**Interfaces:**
- Produces: `window.UI.text(container, { variant, content }) -> HTMLElement`. `variant` is one
  of `"eyebrow" | "label" | "hint" | "body"`. Throws `Error` on an unrecognized variant. Returns
  the created element (a `<span>`) appended to `container`.
- Consumes: `--fs-2xs`/`--fs-xs`/`--ls-wider`/`--text-dim`/`--text-muted` etc. from Batch 1.

- [ ] **Step 1: Write the failing test**

```js
// tests/js/ui-text.test.js
const test = require("node:test");
const assert = require("node:assert");

// UI.text is DOM-dependent (creates real elements), but the class-selection logic and the
// thrown-on-unknown-variant behavior are pure enough to test with a minimal fake DOM shim.
function makeFakeDocument() {
  const created = [];
  return {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        classList: {
          list: [],
          add(...names) { this.list.push(...names); },
        },
        textContent: "",
      };
      created.push(el);
      return el;
    },
    created,
  };
}

test("UI.text creates an eyebrow-variant span with the right class and text", () => {
  global.document = makeFakeDocument();
  delete require.cache[require.resolve("../../static/ui-text.js")];
  require("../../static/ui-text.js");
  const container = { appendChild(el) { this.child = el; } };
  const el = global.UI.text(container, { variant: "eyebrow", content: "STYLE" });
  assert.ok(el.classList.list.includes("text-eyebrow"));
  assert.strictEqual(el.textContent, "STYLE");
  assert.strictEqual(container.child, el);
});

test("UI.text supports label/hint/body variants", () => {
  global.document = makeFakeDocument();
  const container = { appendChild(el) { this.child = el; } };
  assert.ok(global.UI.text(container, { variant: "label", content: "X" }).classList.list.includes("text-label"));
  assert.ok(global.UI.text(container, { variant: "hint", content: "X" }).classList.list.includes("text-hint"));
  assert.ok(global.UI.text(container, { variant: "body", content: "X" }).classList.list.includes("text-body"));
});

test("UI.text throws on an unrecognized variant", () => {
  global.document = makeFakeDocument();
  const container = { appendChild() {} };
  assert.throws(() => global.UI.text(container, { variant: "nope", content: "X" }), /variant/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/ui-text.test.js`
Expected: FAIL — `static/ui-text.js` does not exist yet (`Cannot find module`).

- [ ] **Step 3: Write `static/ui-text.js`**

```js
// Reusable presentational text component, framework-free. Attaches to window.UI.
// Depends on the .text-* CSS classes (text.css). No app state — callers own content.
window.UI = window.UI || {};

const TEXT_VARIANT_CLASS = {
  eyebrow: "text-eyebrow",
  label: "text-label",
  hint: "text-hint",
  body: "text-body",
};

// Builds a <span> with the shared typography recipe for the given variant and appends it to
// container. variant: "eyebrow" (mono-caps section label) | "label" (form-field label) |
// "hint" (secondary/help text) | "body" (default content text).
window.UI.text = function text(container, { variant, content = "" } = {}) {
  const className = TEXT_VARIANT_CLASS[variant];
  if (!className) {
    throw new Error(`UI.text: unknown variant "${variant}"`);
  }
  const el = document.createElement("span");
  el.classList.add(className);
  el.textContent = content;
  container.appendChild(el);
  return el;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/ui-text.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `text.css`**

```css
/* Shared typography component: eyebrow section labels, form-field labels, hints, body text. */
/* Exposes .text-eyebrow/.text-label/.text-hint/.text-body. Built by static/ui-text.js. Depends on tokens.css. */
.text-eyebrow {
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  letter-spacing: var(--ls-wider);
  color: var(--text-muted);
}

.text-label {
  font-family: var(--font-ui);
  font-size: var(--fs-2xs);
  letter-spacing: var(--ls-wide);
  color: var(--text-dim);
}

.text-hint {
  font-family: var(--font-content);
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.text-body {
  font-family: var(--font-content);
  font-size: var(--fs-md);
  color: var(--text);
}
```

- [ ] **Step 6: Wire up `index.html`**

Add `<script src="/static/ui-text.js"></script>` grouped with the other `ui-*.js` script tags
(before `editor.js`, since editor.js's panels will start consuming it), and
`<link rel="stylesheet" href="/static/css/components/text.css">` grouped with the other
component stylesheets.

- [ ] **Step 7: Manual verification**

Open the app in the browser console and run `UI.text(document.body, {variant: "eyebrow",
content: "TEST"})` — confirm a small mono-caps span appears and inspect its computed
`font-size`/`letter-spacing` match `--fs-xs`/`--ls-wider`. Remove it afterward
(`document.body.lastChild.remove()`).

- [ ] **Step 8: Commit**

```bash
git add static/ui-text.js static/css/components/text.css tests/js/ui-text.test.js static/index.html
git commit -m "feat: add UI.text component (eyebrow/label/hint/body variants)"
```

## Task 6: Migrate the six eyebrow-label sites

**Files:**
- Modify: `static/css/components/style-panel.css` (remove `.style-group-label`,
  `.style-panel-header`, `.clip-section-label` rule bodies — keep the selectors only if other
  rules key off them for layout, e.g. `:first-child` padding; otherwise delete entirely)
- Modify: `static/css/components/sub-panel.css` (remove `.sub-panel-title`'s font styling)
- Modify: `static/css/components/settings-row.css` (remove `.settings-row-label`'s font styling)
- Modify: `static/css/components/accordion.css` (remove `.accordion-header`'s font styling,
  keep its layout/hover rules)
- Modify: every JS/HTML site that currently applies these six classes

**Interfaces:**
- Consumes: `UI.text` from Task 5.

- [ ] **Step 1: Find every site**

```bash
grep -rln "style-group-label\|style-panel-header\|clip-section-label\|sub-panel-title\|settings-row-label" static/*.js static/index.html
```

- [ ] **Step 2: Replace each hand-written label element**

For a static `index.html` label, e.g. (representative — apply the same transform to every match):

```html
<!-- before -->
<div class="style-panel-header">STYLE</div>
```

Since `index.html`'s labels are static markup (not rebuilt at runtime), keep them as elements
but repoint the class to `text-eyebrow` and drop the old class name:

```html
<!-- after -->
<div class="text-eyebrow">STYLE</div>
```

For a JS-built label (e.g. in `panel-media.js`'s section-label rows, or `ui-accordion-section.js`,
or `ui-settings-row.js`, or `ui-sub-panel-header.js`), replace the `createElement` + manual
class + textContent sequence with a call to `UI.text`. Example from `panel-media.js`'s
`appendGroup` helper (representative — apply the same transform wherever `.clip-section-label`
is built):

```js
// before
const label = document.createElement("li");
label.className = "clip-section-label";
label.textContent = "VIDEOS";
list.appendChild(label);

// after
const label = document.createElement("li");
UI.text(label, { variant: "eyebrow", content: "VIDEOS" });
list.appendChild(label);
```

(`UI.text` appends a child `<span>` to whatever container you pass — here the `<li>` itself
carries layout classes like `.clip-section-label`'s non-font properties if any remain, and the
inner span carries the typography. If a site has no wrapping element to spare, pass the element
being built directly as `container` and it becomes both the eyebrow AND the layout element —
either approach is fine; pick whichever needs the fewest DOM nodes for that call site.)

Apply this pattern file-by-file to every site found in Step 1: `static/panel-media.js`,
`static/ui-accordion-section.js`, `static/ui-settings-row.js`, `static/ui-sub-panel-header.js`,
and any `static/index.html` label the grep surfaces.

- [ ] **Step 3: Clean up the CSS**

In each of `style-panel.css`, `sub-panel.css`, `settings-row.css`, `accordion.css`, delete the
`font-family`/`font-size`/`letter-spacing`/`color` declarations from the six rule bodies
(keep any non-typography declarations — margins, padding, layout — since those are specific to
each component's placement, not part of the shared text recipe).

- [ ] **Step 4: Verify**

```bash
grep -rn "style-group-label\|style-panel-header\|clip-section-label\|sub-panel-title\|settings-row-label" static/*.js static/index.html static/css/
```

Expected: no output.

Open every right-hand panel (TEXT, CAPTIONS, VIDEO, VIDEO BOX, IMAGE BOX, AUDIO, PROJECTS,
SETTINGS, EXPORT) plus the FILES media list and the accordion/drill-down headers; every section
label should render identically to before (same size/spacing/color).

- [ ] **Step 5: Commit**

```bash
git add static/panel-media.js static/ui-accordion-section.js static/ui-settings-row.js static/ui-sub-panel-header.js static/index.html static/css/components/style-panel.css static/css/components/sub-panel.css static/css/components/settings-row.css static/css/components/accordion.css
git commit -m "refactor: migrate 6 duplicate eyebrow-label recipes onto UI.text"
```

## Task 7: Migrate `.style-field` labels and hint text

**Files:**
- Modify: `static/css/components/style-panel.css` (`.style-field` label styling)
- Modify: `static/css/components/auto-slice-panel.css` (`.auto-slice-hint`)
- Modify: every JS site building a `.style-field` label or `.auto-slice-hint` element

**Interfaces:**
- Consumes: `UI.text` from Task 5.

- [ ] **Step 1: Find every site**

```bash
grep -rln "style-field\b" static/*.js static/index.html
grep -rln "auto-slice-hint" static/*.js static/index.html
```

- [ ] **Step 2: Migrate**

`.style-field`'s font styling is currently applied to the `<label>` element directly inside a
`<div class="style-field">` wrapper (see `ui-number-field.js`/`ui-color-swatch.js` for the
pattern). Change each such label creation to use `UI.text(wrapper, { variant: "label", content:
labelText })` instead of manually setting `label.textContent`/classes. `.auto-slice-hint` sites
in `panel-auto-slice.js` follow the same transform with `variant: "hint"`.

- [ ] **Step 3: Clean up CSS**

Remove the font declarations from `.style-field` (keep `display: flex; flex-direction: column;
gap: 4px;` — that's layout, not typography) and from `.auto-slice-hint`.

- [ ] **Step 4: Verify**

```bash
grep -rn "font-size: var(--fs-2xs)" static/css/components/style-panel.css
```

Expected: no match inside `.style-field`'s rule body specifically (spot check by reading the
file). Open every numeric field (TRIM, SIZE, X/Y/WIDTH/HEIGHT, etc.) and the AUTO SLICE hint
text in the browser; labels/hints should look unchanged.

- [ ] **Step 5: Commit**

```bash
git add static/ui-number-field.js static/ui-color-swatch.js static/panel-auto-slice.js static/css/components/style-panel.css static/css/components/auto-slice-panel.css
git commit -m "refactor: migrate .style-field labels and .auto-slice-hint onto UI.text"
```

## Task 8: Migrate remaining unstyled body text + add the guard test

**Files:**
- Modify: `static/css/components/style-panel.css` (`.caption-preview-box`, `.context-panel-name`
  — decide per-site whether `body` variant applies cleanly or the site's specific styling stays
  custom; only migrate sites that are genuinely generic body text, not specialized displays)
- Create: `tests/js/no-legacy-label-classes.test.js`

**Interfaces:**
- Produces: a guard test pinning that the six retired class names never reappear.

- [ ] **Step 1: Identify remaining candidates**

Read `.caption-preview-box` and `.context-panel-name` in `style-panel.css`. `.caption-preview-box`
has custom background/border/padding beyond typography — leave its box styling as a distinct
component-specific class, but if its `font-family`/`font-size`/`color` trio matches `.text-body`
exactly, repoint just those three properties to reference the tokens (not a full `UI.text`
migration, since it's not a bare text node — it wraps rendered caption content). Use judgment;
this task is about closing out any *remaining pure-text* site, not forcing every text-bearing
element through `UI.text`.

- [ ] **Step 2: Write the guard test**

```js
// tests/js/no-legacy-label-classes.test.js
// Guard: the six eyebrow-label recipes retired in Batch 1b must never reappear as hand-rolled
// classes — new labels must go through UI.text instead of reinventing the recipe a seventh time.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RETIRED = [
  "style-group-label",
  "style-panel-header",
  "clip-section-label",
  "sub-panel-title",
  "settings-row-label",
];

function allSourceFiles(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allSourceFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const staticDir = path.join(__dirname, "../../static");
const files = allSourceFiles(staticDir, [".js", ".html"]);

for (const className of RETIRED) {
  test(`"${className}" does not appear anywhere in static/`, () => {
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes(className),
        `${file} still references the retired class "${className}" — use UI.text instead`
      );
    }
  });
}
```

- [ ] **Step 3: Run it**

Run: `node --test tests/js/no-legacy-label-classes.test.js`
Expected: PASS (5 tests) — if it fails, a site from Task 6/7 was missed; fix it before continuing.

- [ ] **Step 4: Commit**

```bash
git add static/css/components/style-panel.css tests/js/no-legacy-label-classes.test.js
git commit -m "test: guard against the 6 retired eyebrow-label classes reappearing"
```

## Batch 1b Definition of Done

- [ ] `node --test "tests/js/**/*.test.js"` passes, including the new `ui-text.test.js` and
  `no-legacy-label-classes.test.js`.
- [ ] Every panel in the app visually spot-checked (no font/spacing regressions).
- [ ] Master plan's batch table updated: Batch 1b → "done".
