# Batch 2 — UI.icon

> Part of the [UI Component Consistency master plan](2026-07-29-ui-component-consistency-master.md).
> REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.
> Depends on Batches 1 and 1b being complete and committed first.

**Goal:** Build `UI.icon(name, { size })`, seed it with the icons already in use, then migrate
all 95 hand-inlined `<svg>` sites (27 in `index.html`, 68 across 21 JS files) to call it.

## Global Constraints

See the [master plan](2026-07-29-ui-component-consistency-master.md#global-constraints).
Additionally for this batch: only icons actually in use today get extracted — no bulk Lucide
import (per the spec's non-goals). An unknown icon name is a programming error, not a runtime
condition — `UI.icon` throws.

## The Mechanical Migration Rule

Every migration task in this batch (Tasks 10–13) follows the same rule, applied file by file:

1. Find each `<svg ...>...</svg>` block (in `index.html`) or `'<svg ...>...</svg>'` string
   literal (in a `.js` file).
2. If its exact path data is **not yet** in `ui-icon.js`'s registry, give it a
   `kebab-case` name matching the closest Lucide icon name (e.g. the trash icon → `"trash"`,
   the pencil icon → `"pencil"`) and add it as a new entry, copying the `<path>`/`<line>`/
   `<circle>`/`<polygon>` children verbatim (only the children — the wrapper attributes are
   supplied by `UI.icon` itself).
3. Replace the original site:
   - In `index.html`: `<svg class="icon-volume" viewBox="0 0 24 24" width="18" height="18" ...>...</svg>`
     becomes `<span class="icon-volume" data-icon="volume-2" data-icon-size="18"></span>`
     (hydrated at load — see Task 10).
   - In a `.js` file building `innerHTML`: `el.innerHTML = '<svg ...>...</svg>'` becomes
     `el.innerHTML = UI.icon("trash", { size: 14 })`.
   - In a `.js` file building a template string embedding an `<svg>`: replace the embedded
     `<svg>...</svg>` substring with `${UI.icon("trash", { size: 14 })}`.
4. If the exact same path data already has a registry entry (e.g. the mute icon reused across
   `index.html`'s AUDIO/VIDEO panels and `panel-media.js`), reuse the existing name — do not
   create a duplicate entry.
5. Preserve the original `width`/`height` as the `size` argument (default 24 if the source had
   no explicit size). Preserve any class the original `<svg>` carried (e.g. `icon-play`,
   `icon-hidden`) on the new wrapper.

## Task 9: Build `UI.icon` + seed registry + tests

**Files:**
- Create: `static/ui-icon.js`
- Create: `tests/js/ui-icon.test.js`
- Modify: `static/index.html` (add `<script>` tag, loaded before any panel script that will use it)

**Interfaces:**
- Produces: `window.UI.icon(name, { size = 24 } = {}) -> string` (an inline `<svg>...</svg>`
  markup string, using `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round"` — the wrapper already standard across this
  codebase). Throws `Error` on an unrecognized name.
- Consumes: nothing (self-contained; the registry lives inside this file per the design spec's
  "the icon service's own payload" exception to the no-catch-all-file rule).

- [ ] **Step 1: Write the failing test**

```js
// tests/js/ui-icon.test.js
const test = require("node:test");
const assert = require("node:assert");

delete require.cache[require.resolve("../../static/ui-icon.js")];
require("../../static/ui-icon.js");

test("UI.icon returns an SVG string with the standard wrapper attributes", () => {
  const markup = global.UI.icon("trash");
  assert.match(markup, /^<svg /);
  assert.match(markup, /viewBox="0 0 24 24"/);
  assert.match(markup, /fill="none"/);
  assert.match(markup, /stroke="currentColor"/);
  assert.match(markup, /<\/svg>$/);
});

test("UI.icon defaults to size 24 and honors an explicit size", () => {
  assert.match(global.UI.icon("trash"), /width="24" height="24"/);
  assert.match(global.UI.icon("trash", { size: 14 }), /width="14" height="14"/);
});

test("UI.icon embeds the icon-specific path data", () => {
  // trash's real path data, extracted from static/panel-media.js's pre-migration markup
  assert.match(global.UI.icon("trash"), /M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6/);
});

test("UI.icon throws on an unrecognized name", () => {
  assert.throws(() => global.UI.icon("not-a-real-icon"), /unknown icon/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/ui-icon.test.js`
Expected: FAIL — `static/ui-icon.js` does not exist yet.

- [ ] **Step 3: Write `static/ui-icon.js`**

Seed the registry with the icons already verified from the current markup (this is the initial
set; Tasks 10–13 add every remaining icon discovered during migration, per the Mechanical
Migration Rule above):

```js
// Reusable icon service, framework-free. Attaches to window.UI.
// Depends on nothing. Path data for every icon currently in use lives here — this file's own
// payload, not a shared catch-all (see the UI-consistency design spec's non-goals).
window.UI = window.UI || {};

// Lucide-sourced path/shape data, viewBox 0 0 24 24. Key = kebab-case Lucide icon name.
const ICON_PATHS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  "volume-2": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  "volume-x": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  play: '<polygon points="6,4 20,12 6,20" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  "step-back": '<polygon points="19,4 19,20 8,12" fill="currentColor"/><rect x="4" y="4" width="2" height="16" fill="currentColor"/>',
  "step-forward": '<polygon points="5,4 16,12 5,20" fill="currentColor"/><rect x="18" y="4" width="2" height="16" fill="currentColor"/>',
  restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
  "panel-left-open": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/>',
  "grip-vertical": '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><path d="M14.8 14.8 20 20"/>',
  "chevrons-up-down": '<path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/>',
  italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
};

// Wrapper attributes shared by every icon already inlined across this codebase's markup
// (play/pause/restart/step/bold/italic/underline etc.) — see CLAUDE.md's icon convention.
window.UI.icon = function icon(name, { size = 24 } = {}) {
  const inner = ICON_PATHS[name];
  if (!inner) {
    throw new Error(`UI.icon: unknown icon "${name}"`);
  }
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
};
```

Note: `play`/`pause`/`step-back`/`step-forward` use `fill="currentColor"` shapes rather than
stroked paths in the current markup — their per-shape `fill="currentColor"` attribute is kept
on the individual `<polygon>`/`<rect>` elements (as shown above) since the wrapper's own
`fill="none"` would otherwise hide them; this matches their existing behavior exactly.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/ui-icon.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire up `index.html`**

Add `<script src="/static/ui-icon.js"></script>` before any script that will call `UI.icon`
(group it with `ui-text.js`/`ui-button.js` near the top of the `ui-*.js` script block).

- [ ] **Step 6: Manual verification**

In the browser console: `UI.icon("trash", { size: 20 })` should print a well-formed `<svg>`
string. Paste it via `document.body.insertAdjacentHTML("beforeend", UI.icon("trash", {size:
40}))` and confirm a trash icon renders, then remove it.

- [ ] **Step 7: Commit**

```bash
git add static/ui-icon.js tests/js/ui-icon.test.js static/index.html
git commit -m "feat: add UI.icon service with the currently-used icon registry seeded"
```

## Task 10: Migrate `index.html`'s 27 static SVGs

**Files:**
- Modify: `static/index.html`
- Modify: `static/ui-icon.js` (add any icon discovered here not already in the Task 9 seed set)
- Create: a small inline hydration script (add to the bottom of `index.html`, before
  `editor.js`'s script tag) that walks `[data-icon]` placeholders once at load

**Interfaces:**
- Consumes: `UI.icon` from Task 9.

- [ ] **Step 1: Add the hydration bootstrap**

Static markup can't call `UI.icon()` inline, so each site becomes a placeholder hydrated once
at load. Add this script tag right after `ui-icon.js`'s `<script>` tag in `index.html`:

```html
<script>
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const size = el.dataset.iconSize ? Number(el.dataset.iconSize) : undefined;
    el.outerHTML = UI.icon(el.dataset.icon, size ? { size } : undefined).replace(
      "<svg ",
      `<svg class="${el.className}" `
    );
  });
</script>
```

- [ ] **Step 2: Migrate every `<svg>` in `index.html`**

Following the Mechanical Migration Rule above, convert each of the 27 sites. Two concrete
examples (apply the same transform to the rest):

```html
<!-- before (restart button, line 62) -->
<button id="restart-btn" ...>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
</button>

<!-- after -->
<button id="restart-btn" ...>
  <span data-icon="restart" data-icon-size="14"></span>
</button>
```

```html
<!-- before (volume icons, lines 166-167) -->
<svg class="icon-volume" viewBox="0 0 24 24" width="18" height="18" ...>...</svg>
<svg class="icon-volume-muted icon-hidden" viewBox="0 0 24 24" width="18" height="18" ...>...</svg>

<!-- after -->
<span class="icon-volume" data-icon="volume-2" data-icon-size="18"></span>
<span class="icon-volume-muted icon-hidden" data-icon="volume-x" data-icon-size="18"></span>
```

Work through the remaining 25 sites the same way, checking each `<path>`/shape combination
against `ui-icon.js`'s registry (Task 9's seed set already covers restart, play, pause, step
icons, volume-2/volume-x, panel-left-close/open, grip-vertical, scissors, chevrons-up-down,
italic). Any site whose path data isn't yet registered — e.g. the theme toggle's sun icon, the
close/X icon, the underline icon, the export/download icon, the case-style bold icon, safe-zones
alert icon, mask/flip icons — gets added to `ICON_PATHS` in `static/ui-icon.js` with a matching
Lucide name, following the same pattern as Task 9's entries.

- [ ] **Step 3: Verify**

```bash
grep -c "<svg" static/index.html
```

Expected: `0` (or only the count still legitimately needed if any site is deliberately excluded
— there should be none; all 27 migrate).

Open the full app in the browser: every button/label icon (transport controls, panel-collapse
toggle, volume icons, size-step chevrons, italic/underline, safe-zones toggle, theme toggle,
etc.) must render identically to before.

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/ui-icon.js
git commit -m "refactor: migrate index.html's 27 inline SVGs to UI.icon"
```

## Task 11: Migrate the `ui-*.js` shared components' SVGs

**Files:** `static/ui-accordion-section.js`, `static/ui-project-list-row.js`,
`static/ui-settings-row.js`, `static/ui-sub-panel-header.js`, `static/ui-style-preset-card.js`,
`static/ui-toolbar.js` (10 SVGs across these 6 files, per the audit)

**Interfaces:**
- Consumes: `UI.icon` from Task 9.

- [ ] **Step 1: Migrate each site**

Representative example, `static/ui-project-list-row.js` (trash icon in a `createElement`-built
button):

```js
// before
btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// after
btn.innerHTML = UI.icon("trash", { size: 14 });
```

Apply the same transform to every `<svg>` literal in the six files listed above (10 sites
total), adding any not-yet-registered icon to `static/ui-icon.js` as encountered — e.g.
`ui-toolbar.js`'s Select-tool cursor-arrow icon and Text-tool "A" icon, `ui-sub-panel-header.js`'s
back-chevron.

- [ ] **Step 2: Verify**

```bash
grep -c "<svg" static/ui-accordion-section.js static/ui-project-list-row.js static/ui-settings-row.js static/ui-sub-panel-header.js static/ui-style-preset-card.js static/ui-toolbar.js
```

Expected: `0` for each file.

Open the app: PROJECTS panel rows (duplicate/delete icons), the top toolbar (Select/Text icons),
any accordion header, any settings-row chevron, and a saved-style preset card's trash icon —
all render identically.

- [ ] **Step 3: Commit**

```bash
git add static/ui-accordion-section.js static/ui-project-list-row.js static/ui-settings-row.js static/ui-sub-panel-header.js static/ui-style-preset-card.js static/ui-toolbar.js static/ui-icon.js
git commit -m "refactor: migrate ui-*.js shared components' SVGs to UI.icon"
```

## Task 12: Migrate the `panel-*.js` SVGs

**Files:** `static/panel-media.js`, `static/panel-nav.js`, `static/panel-captions.js`,
`static/panel-text.js`, `static/panel-video.js`, `static/panel-video-box.js`,
`static/panel-image-box.js`, `static/panel-audio-track.js`, `static/timeline.js` (39 SVGs across
these 9 files, per the audit — the largest single migration task in this batch)

**Interfaces:**
- Consumes: `UI.icon` from Task 9.

- [ ] **Step 1: Migrate each site**

Representative examples already fully verified from `static/panel-media.js`:

```js
// before (line 139, add-to-timeline plus icon)
addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
// after
addBtn.innerHTML = UI.icon("plus", { size: 14 });

// before (line 177, rename pencil icon)
renameBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
// after
renameBtn.innerHTML = UI.icon("pencil", { size: 14 });

// before (line 195, trash icon)
trashBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
// after
trashBtn.innerHTML = UI.icon("trash", { size: 14 });

// before (line 24, muted-clip badge)
const MUTED_ICON_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
// after
const MUTED_ICON_SVG = UI.icon("volume-x", { size: 11 });
```

Apply the same rule across the remaining 35 sites in the 9 listed files. Notable icon families
to watch for (per the design spec's duplication table — reuse one registry entry across all of
them rather than re-adding):

- Box-corner icons (`panel-video-box.js`, `panel-image-box.js`, `panel-nav.js`'s VIDEO BOX nav
  icon) — same path data, one `"square-dashed"`-style registry entry.
- Position-anchor icons (`text-panel-position.js` is Task 13, but `panel-nav.js`'s equivalents
  land here) — reuse.
- The wand/sparkles auto-caption icon (`panel-captions.js`, `panel-audio-track.js`).
- `panel-nav.js`'s 10 left-icon-rail glyphs (PROJECTS/FILES/VIDEO/TEXT/CAPTIONS/VIDEO
  BOX/IMAGE BOX/AUDIO/AUTO/SETTINGS/EXPORT) — each is distinct, register each under its own name.
- `timeline.js`'s 2 SVGs (the row-add "+" button, the slice/scissors action — `scissors` is
  already registered from Task 9).

- [ ] **Step 2: Verify**

```bash
grep -c "<svg" static/panel-media.js static/panel-nav.js static/panel-captions.js static/panel-text.js static/panel-video.js static/panel-video-box.js static/panel-image-box.js static/panel-audio-track.js static/timeline.js
```

Expected: `0` for each file.

Open every context panel this touches (FILES, PROJECTS nav rail, CAPTIONS, TEXT, VIDEO, VIDEO
BOX, IMAGE BOX, AUDIO/AUTO) and the timeline's add/slice buttons — every icon renders
identically.

- [ ] **Step 3: Commit**

```bash
git add static/panel-media.js static/panel-nav.js static/panel-captions.js static/panel-text.js static/panel-video.js static/panel-video-box.js static/panel-image-box.js static/panel-audio-track.js static/timeline.js static/ui-icon.js
git commit -m "refactor: migrate panel-*.js and timeline.js SVGs to UI.icon"
```

## Task 13: Migrate `text-panel-*.js`/`caption-panel-*.js` SVGs + add the no-raw-svg guard test

**Files:** `static/text-panel-align.js`, `static/text-panel-position.js`,
`static/caption-panel-box.js`, `static/style-section-emphasis.js`, `static/style-section-size.js`,
`static/caption-panel-filler-words.js` (file list updated 2026-07-29 after an upstream merge:
the original `text-panel-case.js`/`caption-panel-case.js` and
`text-panel-font-style.js`/`caption-panel-font-style.js` were deleted and their icons — italic,
underline, and the bold/case-style icons — consolidated into the new shared
`style-section-emphasis.js`/`style-section-size.js`, which now serve both the TEXT and CAPTIONS
panels from one file each. This is a net simplification: the cross-panel duplicate this task
originally called out is already deduplicated upstream, so there is only one site per icon to
migrate, not two.)
- Create: `tests/js/no-raw-svg.test.js`

**Interfaces:**
- Consumes: `UI.icon` from Task 9.

- [ ] **Step 1: Migrate each site**

Same rule as Tasks 11–12. Note the cross-panel duplicate still relevant here — confirm both
sides resolve to the same registry name:

- `text-panel-position.js`'s anchor-grid icons ↔ `caption-panel-box.js`'s POSITION anchor icons
  (same path data, same name).

(The former TEXT/CAPTIONS bold/case-icon duplicate no longer applies — `style-section-emphasis.js`
now serves both panels from one file, so its italic/underline/bold icons each need migrating
exactly once, not once per panel.)

- [ ] **Step 2: Verify no `<svg` literal remains anywhere in `static/*.js`**

```bash
grep -rln "<svg" static/*.js
```

Expected: no output (empty) — `ui-icon.js` itself contains `<svg` only inside its template
literal return value, which the grep will still match; confirm by inspecting that the only hit,
if any, is `ui-icon.js`'s own `` `<svg viewBox=...` `` template string, which is correct and
expected (it's the source of truth, not a leftover site).

- [ ] **Step 3: Write the guard test**

```js
// tests/js/no-raw-svg.test.js
// Guard: no hand-inlined <svg> markup should exist outside ui-icon.js — every icon must come
// from UI.icon() so the codebase never regrows a second, undocumented icon source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const staticDir = path.join(__dirname, "../../static");
const jsFiles = fs.readdirSync(staticDir).filter((f) => f.endsWith(".js") && f !== "ui-icon.js");

for (const file of jsFiles) {
  test(`${file} contains no raw <svg markup`, () => {
    const content = fs.readFileSync(path.join(staticDir, file), "utf8");
    assert.ok(
      !content.includes("<svg"),
      `${file} still has an inline <svg> — migrate it to UI.icon() (see Batch 2 plan)`
    );
  });
}
```

- [ ] **Step 4: Run all icon-related tests**

Run: `node --test tests/js/ui-icon.test.js tests/js/no-raw-svg.test.js`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Open TEXT panel's Box tab (position anchors, align buttons, case-style group) and CAPTIONS
panel's Design/Box tabs (same controls) plus the Filler words tab's warning icon — all render
identically to before.

- [ ] **Step 6: Commit**

```bash
git add static/text-panel-align.js static/text-panel-position.js static/caption-panel-box.js static/style-section-emphasis.js static/style-section-size.js static/caption-panel-filler-words.js static/ui-icon.js tests/js/no-raw-svg.test.js
git commit -m "refactor: migrate remaining text/caption panel SVGs to UI.icon; add no-raw-svg guard test"
```

## Batch 2 Definition of Done

- [ ] `grep -rln "<svg" static/*.js` returns nothing but `ui-icon.js` itself (its own template
  literal is the source of truth, not a leftover).
- [ ] `grep -c "<svg" static/index.html` returns `0`.
- [ ] `node --test "tests/js/**/*.test.js"` passes, including `ui-icon.test.js` and
  `no-raw-svg.test.js`.
- [ ] Every icon in the running app visually spot-checked against a before/after screenshot.
- [ ] Master plan's batch table updated: Batch 2 → "done".
