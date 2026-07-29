# Batch 3 — UI.button

> Part of the [UI Component Consistency master plan](2026-07-29-ui-component-consistency-master.md).
> REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.
> Depends on Batches 1, 1b, and 2 being complete and committed first (this batch's `icon` option
> takes a `UI.icon` name).

**Goal:** Replace `.button`/`ui-button.js` (2 sites), `.panel-button*` (~20 sites), `.icon-btn`
(~20+ sites), and the one-offs `.row-add-btn`/`.zoom-btn`/`.number-field-step` with one
`UI.button` component that **builds** the button, in 2 sizes × 4 intents.

## Global Constraints

See the [master plan](2026-07-29-ui-component-consistency-master.md#global-constraints).
Additionally: this is a deliberate reduction, not a faithful port — the 42px `.button` size is
retired entirely; some buttons will visibly change size. That is intended, not a regression.

## Task 14: Build `UI.button` + `buttonClasses()` + `button.css` + tests

**Files:**
- Modify: `static/ui-button.js` (replace its entire body — old signature retired)
- Create: `tests/js/ui-button.test.js`
- Modify: `static/css/components/button.css` (replace its entire content)

**Interfaces:**
- Produces: `window.buttonClasses({ size, intent, pressed, disabled }) -> string[]` (pure,
  exported for testing) and `window.UI.button(container, { label, icon, size = "md", intent =
  "neutral", pressed = false, disabled = false, onClick } = {}) -> HTMLButtonElement`. `size`:
  `"sm"` (28px square, icon-only) | `"md"` (33px, full-width, label + optional leading icon).
  `intent`: `"neutral" | "accent" | "danger" | "dashed"`.
- Consumes: `UI.icon` from Batch 2 (only when `icon` is passed); `--radius-md`, `--accent-tint`,
  `--danger`, `--fs-sm` etc. from Batch 1.

- [ ] **Step 1: Write the failing test**

```js
// tests/js/ui-button.test.js
const test = require("node:test");
const assert = require("node:assert");

function makeFakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        type: "",
        disabled: false,
        innerHTML: "",
        textContent: "",
        classList: {
          list: [],
          add(...names) { this.list.push(...names); },
        },
        addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
        setAttribute(name, value) { this[`attr_${name}`] = value; },
      };
    },
  };
}

delete require.cache[require.resolve("../../static/ui-button.js")];

test("buttonClasses builds the expected class list", () => {
  global.document = makeFakeDocument();
  require("../../static/ui-button.js");
  assert.deepStrictEqual(
    global.buttonClasses({ size: "md", intent: "accent" }),
    ["button", "button-md", "button-accent"]
  );
  assert.deepStrictEqual(
    global.buttonClasses({ size: "sm", intent: "neutral", pressed: true }),
    ["button", "button-sm", "button-neutral", "button-pressed"]
  );
});

test("UI.button creates a button with label text and the right classes", () => {
  global.document = makeFakeDocument();
  const container = { appendChild(el) { this.child = el; } };
  const btn = global.UI.button(container, { label: "Export", size: "md", intent: "accent" });
  assert.strictEqual(btn.tagName, "BUTTON");
  assert.strictEqual(btn.type, "button");
  assert.ok(btn.classList.list.includes("button-accent"));
  assert.strictEqual(container.child, btn);
});

test("UI.button wires onClick", () => {
  global.document = makeFakeDocument();
  const container = { appendChild() {} };
  let called = false;
  const btn = global.UI.button(container, { label: "X", onClick: () => { called = true; } });
  btn._listeners.click();
  assert.strictEqual(called, true);
});

test("UI.button sets aria-pressed when pressed is provided", () => {
  global.document = makeFakeDocument();
  const container = { appendChild() {} };
  const btn = global.UI.button(container, { label: "X", pressed: true });
  assert.strictEqual(btn["attr_aria-pressed"], "true");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/ui-button.test.js`
Expected: FAIL — `buttonClasses`/`UI.button` don't exist with this signature yet (old
`UI.button(btn, {variant})` is still in place).

- [ ] **Step 3: Write `static/ui-button.js`**

```js
// Reusable button component, framework-free. Attaches to window.UI (and window.buttonClasses
// for testing). Depends on the .button CSS component (button.css) and UI.icon for icon buttons.
// Builds the whole <button> — callers no longer hand-write markup and stamp a variant onto it.
window.UI = window.UI || {};

// Pure: computes the class list for a button's current size/intent/pressed/disabled state.
// Exported on window so tests can call it without going through full DOM button creation.
window.buttonClasses = function buttonClasses({ size = "md", intent = "neutral", pressed = false, disabled = false } = {}) {
  const classes = ["button", `button-${size}`, `button-${intent}`];
  if (pressed) classes.push("button-pressed");
  if (disabled) classes.push("button-disabled");
  return classes;
};

// size: "sm" (28px square, icon-only) | "md" (33px, full-width, label + optional leading icon).
// intent: "neutral" | "accent" (the app's one primary action, e.g. Export) | "danger" | "dashed".
window.UI.button = function button(container, {
  label = "",
  icon,
  size = "md",
  intent = "neutral",
  pressed = false,
  disabled = false,
  onClick,
} = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add(...window.buttonClasses({ size, intent, pressed, disabled }));
  btn.disabled = disabled;
  if (pressed) btn.setAttribute("aria-pressed", "true");
  if (icon) {
    btn.innerHTML = window.UI.icon(icon, { size: size === "sm" ? 14 : 16 });
  }
  if (label) {
    const span = document.createElement("span");
    span.textContent = label;
    btn.appendChild(span);
  }
  if (onClick) btn.addEventListener("click", onClick);
  container.appendChild(btn);
  return btn;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/ui-button.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `button.css`**

Read the current `static/css/components/button.css`, `button-group.css`, and `panel-button.css`
first to confirm every property this must replace (hover colors, disabled opacity, dashed
border). Then replace `button.css`'s entire content:

```css
/* Shared button component: 2 sizes x 4 intents, built by static/ui-button.js. */
/* Exposes .button, .button-sm/-md, .button-neutral/-accent/-danger/-dashed, .button-pressed, .button-disabled. Depends on tokens.css. */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  letter-spacing: var(--ls-tight);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  white-space: nowrap;
}

.button-sm { width: 28px; height: 28px; padding: 0; }
.button-md { width: 100%; height: 33px; padding: 0 16px; }

.button-neutral { border-color: var(--border); color: var(--text-muted); }
.button-neutral:hover { color: var(--text); border-color: var(--border-hover-color); }

.button-accent { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.button-accent:hover { background: var(--accent-hover); }

.button-danger { border-color: var(--danger); color: var(--danger); }
.button-danger:hover { border-color: var(--danger); color: var(--danger); }

.button-dashed { border-style: dashed; border-color: var(--border); color: var(--text-secondary); }
.button-dashed:hover { color: var(--text); border-color: var(--border-hover-color); border-width: var(--border-hover-width); }

.button-pressed { border-color: var(--accent); color: var(--text); background: var(--accent-tint); }

.button-disabled,
.button:disabled {
  cursor: default;
  opacity: 0.35;
}
.button-disabled:hover,
.button:disabled:hover { color: inherit; border-color: var(--border); }
```

- [ ] **Step 6: Manual verification**

In the browser console: `UI.button(document.body, {label: "Test", size: "md", intent:
"accent"})` and `UI.button(document.body, {icon: "trash", size: "sm", intent: "danger"})` —
confirm both render correctly, then remove them.

- [ ] **Step 7: Commit**

Do NOT delete `panel-button.css`/old `.icon-btn` rules yet — later tasks in this batch still
depend on them until migration completes.

```bash
git add static/ui-button.js static/css/components/button.css tests/js/ui-button.test.js
git commit -m "feat: rebuild UI.button as an element-building component (2 sizes x 4 intents)"
```

## Task 15: Migrate the ~20 `.panel-button*` sites

**Files:** `static/index.html` (21 static sites), `static/ui-project-picker.js`,
`static/ui-style-save-form.js` (JS-created), `static/css/components/panel-button.css`
(no edits yet — deleted in Task 17 once every consumer is gone)

**Interfaces:**
- Consumes: `UI.button` from Task 14.

- [ ] **Step 1: Migrate each static `index.html` site**

Static markup can't call `UI.button()` directly, so each site becomes a placeholder hydrated
the same way Batch 2's icons were. Add this to the same hydration `<script>` block introduced
in Batch 2 Task 10 (extend it, don't duplicate it):

```html
<script>
  document.querySelectorAll("[data-icon]").forEach((el) => { /* ... existing icon hydration ... */ });

  document.querySelectorAll("[data-button]").forEach((el) => {
    const intent = el.dataset.buttonIntent || "neutral";
    const size = el.dataset.buttonSize || "md";
    const label = el.textContent.trim();
    const parent = el.parentNode;
    const btn = UI.button(parent, { label, size, intent });
    btn.id = el.id;
    if (el.className) btn.classList.add(...el.className.split(" ").filter((c) => c !== "panel-button" && !c.startsWith("panel-button-")));
    parent.replaceChild(btn, el);
  });
</script>
```

Then convert each `.panel-button*` element from a real `<button>` with the class already on it,
to a placeholder with `data-button`/`data-button-intent`/`data-button-size`, preserving its
`id` (event listeners in `editor.js`/`panel-*.js` are attached by `id`, e.g.
`document.getElementById("video-delete")`, so ids must survive unchanged):

```html
<!-- before -->
<button id="video-delete" class="panel-button panel-button-danger" type="button">Delete Clip</button>

<!-- after -->
<button id="video-delete" data-button data-button-intent="danger" hidden>Delete Clip</button>
```

(The placeholder stays a real `<button>` tag with `hidden` so no layout flash occurs before
hydration; the hydration script replaces it with the fully-built `UI.button` element, which
keeps the id, so every existing `getElementById("video-delete").addEventListener(...)` call in
`panel-video.js` etc. keeps working unmodified.)

Apply this to all 21 static sites: `add-clip` (135→ actually already JS-managed, verify before
converting — grep first), `video-duplicate`, `video-delete` (`intent="danger"`),
`caption-style-save`, `project-create` (`intent="dashed"`), `video-box-add` (`intent="dashed"`),
`video-box-mask-flip`, `video-box-delete` (`intent="danger"`), `image-box-add`
(`intent="dashed"`), `image-box-mask-flip`, `image-box-delete` (`intent="danger"`),
`audio-add-music` (`intent="dashed"`), `audio-replace`, `audio-remove` (`intent="danger"`),
`auto-slice-continue`, `auto-slice-redetect`, `auto-slice-confirm-apply`, `auto-slice-back`,
`text-add-block-btn` (`intent="dashed"`), `text-style-save`, `text-duplicate`, `text-delete`
(`intent="danger"`). Default `intent="neutral"` for any not called out above.

- [ ] **Step 2: Migrate the 2 JS-created sites**

```bash
grep -n "panel-button" static/ui-project-picker.js static/ui-style-save-form.js
```

Replace each `document.createElement("button")` + `.className = "panel-button..."` sequence
with a direct `UI.button(container, { label, intent, onClick })` call — these are JS-built, so
no placeholder/hydration step is needed, just a straight replacement.

- [ ] **Step 3: Verify**

```bash
grep -c "panel-button" static/index.html static/ui-project-picker.js static/ui-style-save-form.js
```

Expected: `0` for `ui-project-picker.js`/`ui-style-save-form.js`. `index.html` may still show
matches inside `data-button-intent` attribute *values* like `panel-button` only if you
accidentally reused the old name as an intent string — confirm none do (intents are
`neutral`/`accent`/`danger`/`dashed` only).

Open every panel this touches (VIDEO, TEXT, CAPTIONS, VIDEO BOX, IMAGE BOX, AUDIO, PROJECTS,
AUTO SLICE) and confirm each button still triggers its existing behavior (delete, duplicate,
add, save, etc.) — the ids are unchanged so no JS wiring should have broken.

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/ui-project-picker.js static/ui-style-save-form.js
git commit -m "refactor: migrate ~20 .panel-button sites to UI.button"
```

## Task 16: Migrate the ~20 `.icon-btn` sites

**Files:** `static/index.html` (transport controls, zoom, safe-zones-toggle,
style-panel-collapse-toggle, caption size-step/italic/underline), `static/panel-media.js` (3
sites: add/rename/trash), `static/ui-project-list-row.js` (2 sites: dup/delete),
`static/ui-style-preset-card.js` (1 site: trash), `static/caption-panel-filler-words.js` (1
site)

**Interfaces:**
- Consumes: `UI.button` from Task 14.

- [ ] **Step 1: Migrate JS-created sites first (no hydration needed)**

Representative example from `static/panel-media.js` (the add/rename/trash trio at lines
134-195):

```js
// before
const addBtn = document.createElement("button");
addBtn.type = "button";
addBtn.className = "icon-btn clip-action";
addBtn.title = m.kind === "image" ? "Add as image box" : m.kind === "audio" ? "Add audio" : "Add to timeline";
addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" ...>...</svg>';
addBtn.addEventListener("click", async (e) => { /* ... */ });

// after
const addBtn = UI.button(rowContainer, {
  icon: "plus",
  size: "sm",
  onClick: async (e) => { /* ... same handler body ... */ },
});
addBtn.title = m.kind === "image" ? "Add as image box" : m.kind === "audio" ? "Add audio" : "Add to timeline";
addBtn.classList.add("clip-action");
```

(`UI.button` appends to `container` immediately, so if the original code deferred appending
until after configuring `title`/listeners, either pass `container` up front as shown, or pass a
detached container and re-append — check each site's surrounding code for append order and
preserve it. `clip-action` is a layout/hover-visibility class unrelated to button styling —
keep it as an additional class on top of what `UI.button` sets.)

Apply the same transform to `panel-media.js`'s rename/trash buttons, both
`ui-project-list-row.js` sites, `ui-style-preset-card.js`'s trash button, and
`caption-panel-filler-words.js`'s site.

- [ ] **Step 2: Migrate the static `index.html` sites**

Use the same `data-button` hydration mechanism from Task 15, with `size="sm"` and an
`data-icon`/`data-icon-size` pair instead of a text label where the button is icon-only:

```html
<!-- before -->
<button id="restart-btn" class="icon-btn" type="button" title="Restart">
  <svg viewBox="0 0 24 24" width="14" height="14" ...>...</svg>
</button>

<!-- after -->
<button id="restart-btn" data-button data-button-size="sm" data-icon="restart" data-icon-size="14" title="Restart" hidden></button>
```

Extend the hydration script (from Task 15) to read `data-icon` on a `data-button` element and
pass it through as the `icon` option:

```html
<script>
  document.querySelectorAll("[data-button]").forEach((el) => {
    const intent = el.dataset.buttonIntent || "neutral";
    const size = el.dataset.buttonSize || "md";
    const icon = el.dataset.icon;
    const label = icon ? "" : el.textContent.trim();
    const parent = el.parentNode;
    const btn = UI.button(parent, { label, icon, size, intent });
    btn.id = el.id;
    if (el.title) btn.title = el.title;
    parent.replaceChild(btn, el);
  });
</script>
```

Apply this to every `.icon-btn` site in `index.html`: transport controls (restart/step-back/
play-pause/step-forward), zoom `-`/`+`, safe-zones-toggle, style-panel-collapse-toggle, caption
size-step-down/up, caption-italic, caption-underline.

- [ ] **Step 3: Handle `aria-pressed` toggle buttons**

Sites like `safe-zones-toggle` and the play/pause button read/write `aria-pressed` at runtime
via `editor.js`'s `setSafeZonesVisible` (`static/editor.js:156-164`) and `preview.js`'s
play-state icon swap. `UI.button`'s `pressed` option only sets the *initial* state — runtime
toggles still call `btn.setAttribute("aria-pressed", ...)` directly exactly as they do today
against the old `.icon-btn` element; no change needed there since the element itself is still a
real `<button>` after hydration, just built differently. Confirm by re-reading
`static/editor.js:156-164` after migration and leaving that function's body untouched.

- [ ] **Step 4: Verify**

```bash
grep -c "icon-btn" static/index.html static/panel-media.js static/ui-project-list-row.js static/ui-style-preset-card.js static/caption-panel-filler-words.js
```

Expected: `0` for each.

Open the app: transport controls play/pause/step/restart, timeline zoom, safe-zones toggle,
panel-collapse toggle, CAPTIONS size stepper/italic/underline, FILES row add/rename/trash icons,
PROJECTS row duplicate/delete icons, a saved-style card's trash icon, and the filler-words
delete icon — every one must still be clickable and visually correct.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/panel-media.js static/ui-project-list-row.js static/ui-style-preset-card.js static/caption-panel-filler-words.js
git commit -m "refactor: migrate ~20 .icon-btn sites to UI.button"
```

## Task 17: Migrate the one-offs, retire old CSS/classes, add the guard test

**Files:**
- Modify: `static/editor.js:151-152` (the 2 old `UI.button(btn, {variant})` calls)
- Modify: `static/timeline.js` (`.row-add-btn`)
- Modify: `static/index.html` (`.zoom-btn` if not already covered by Task 16 — verify; the
  `.number-field-step` buttons in `ui-number-field.js`)
- Delete: `static/css/components/panel-button.css`
- Modify: `static/index.html` (remove the `panel-button.css` `<link>`)
- Modify: `static/css/components/button-group.css` (remove `.icon-btn` rule block — `.btn-group`
  itself stays, its buttons now render through `UI.button`)
- Create: `tests/js/no-legacy-button-classes.test.js`
- Modify: `CLAUDE.md` (codebase map: remove `panel-button.css` entry, note `button.css`/
  `ui-button.js` signature change, note `.icon-btn` retirement)

**Interfaces:**
- Consumes: `UI.button` from Task 14.
- Produces: a guard test pinning that the retired classes never reappear.

- [ ] **Step 1: Migrate `editor.js`'s 2 sites**

```js
// before (static/editor.js:151-152)
UI.button(document.getElementById("theme-toggle"), { variant: "icon" });
UI.button(document.getElementById("export"), { variant: "accent" });

// after
// Both elements convert to data-button placeholders in index.html (same hydration mechanism),
// so these two explicit calls are simply deleted — hydration handles them now.
```

In `index.html`, convert `#theme-toggle` to `data-button data-button-size="sm"
data-icon="sun-moon"` (verify/add the theme icon's real path in `ui-icon.js` if not already
seeded) and `#export` to `data-button data-button-size="md" data-button-intent="accent"`,
keeping its existing text content as the label.

- [ ] **Step 2: Migrate `.row-add-btn` and `.number-field-step`**

`static/timeline.js`'s row-add button and `static/ui-number-field.js`'s stepper buttons are
JS-created — apply the same `UI.button(container, {icon: "plus"/"chevron-up"/"chevron-down",
size: "sm", onClick})` transform as Task 16's pattern. Verify `.zoom-btn` in `index.html` was
already converted in Task 16 (it uses the same `.icon-btn` class) — if a leftover `.zoom-btn`-
specific rule remains in `timeline.css` for anything beyond what `.button-sm` now covers
(e.g. custom positioning), keep that layout-only rule but remove any duplicated
font-size/border-radius/color declarations it still carries.

- [ ] **Step 3: Delete `panel-button.css` and the old `.icon-btn` block**

```bash
rm static/css/components/panel-button.css
```

Remove its `<link>` tag from `index.html`. Remove `.icon-btn`, `.icon-btn:disabled`,
`.icon-btn:disabled:hover`, `.icon-btn[aria-pressed="true"]` from `button-group.css` — keep
`.btn-group`, `.btn-group button`, `.btn-group button[aria-pressed]`, `.btn-group-inline`, and
`.icon-hidden` (still used independently for the play/pause icon-swap pattern).

- [ ] **Step 4: Write the guard test**

```js
// tests/js/no-legacy-button-classes.test.js
// Guard: the retired button idioms (.panel-button family, .icon-btn, .row-add-btn, .zoom-btn,
// .number-field-step, and the old UI.button(btn, {variant}) call shape) must never reappear —
// every new button goes through UI.button(container, {...}) instead.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RETIRED_CLASSES = ["panel-button", "icon-btn", "row-add-btn", "number-field-step"];

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
const files = allSourceFiles(staticDir, [".js", ".html", ".css"]);

for (const className of RETIRED_CLASSES) {
  test(`"${className}" does not appear anywhere in static/`, () => {
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes(className),
        `${file} still references the retired class "${className}" — use UI.button instead`
      );
    }
  });
}

test("no UI.button(el, {variant: ...}) call shape remains (old signature)", () => {
  for (const file of files.filter((f) => f.endsWith(".js"))) {
    const content = fs.readFileSync(file, "utf8");
    assert.ok(
      !/UI\.button\([^,]+,\s*\{\s*variant:/.test(content),
      `${file} still calls UI.button with the retired {variant} shape`
    );
  }
});
```

- [ ] **Step 5: Run all button-related tests**

Run: `node --test tests/js/ui-button.test.js tests/js/no-legacy-button-classes.test.js`
Expected: PASS.

- [ ] **Step 6: Update `CLAUDE.md`**

In the codebase map's File structure and Inventory sections: remove the `panel-button.css` line,
update `ui-button.js`'s description to the new `UI.button(container, {...})` signature and its
2-size/4-intent variant set, note `.icon-btn` is retired in favor of `UI.button`.

- [ ] **Step 7: Full manual pass**

Open every panel/control in the app one more time — this is the batch's final sweep. Confirm no
button anywhere is unstyled, mis-sized, or non-functional.

- [ ] **Step 8: Commit**

```bash
git add static/editor.js static/index.html static/timeline.js static/ui-number-field.js static/css/components/button-group.css tests/js/no-legacy-button-classes.test.js CLAUDE.md
git rm static/css/components/panel-button.css
git commit -m "refactor: retire panel-button.css/.icon-btn/.row-add-btn/.number-field-step; add guard test"
```

## Batch 3 Definition of Done

- [ ] `grep -rln "panel-button\|icon-btn\|row-add-btn\|number-field-step" static/` returns
  nothing.
- [ ] `node --test "tests/js/**/*.test.js"` passes, including `ui-button.test.js` and
  `no-legacy-button-classes.test.js`.
- [ ] Full manual pass across every panel confirms no broken/unstyled button.
- [ ] `CLAUDE.md` updated in the same commit as the file deletions.
- [ ] Master plan's batch table updated: Batch 3 → "done".
