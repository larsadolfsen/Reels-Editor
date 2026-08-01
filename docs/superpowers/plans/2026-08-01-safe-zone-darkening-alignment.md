# Safe-zone darkening + position-anchor alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TikTok-Reels editor's 4-band safe-zone guide with a single darkened overlay
around one context-aware safe rectangle, and make the TEXT panel's POSITION anchor shortcuts snap
to that same rectangle.

**Architecture:** Two new pixel rects (`TEXT_IMAGE_SAFE_RECT`, `CAPTION_SAFE_RECT`) are derived in
`static/safe-zone-geometry.js` from the existing `SAFE_ZONES` percentages. A new pure module
(`static/anchor-position.js`) computes edge-flush anchor positions against whichever rect matches
the current style target's `kind`. `static/ui-safe-zones.js`'s `UI.safeZones(container, kind)` is
rewritten to darken everything outside the matching rect instead of rendering 4 separate bands, and
`editor.js` re-renders it with the right `kind` on every selection change (reusing the existing
`renderTimeline()` re-render path — no new event wiring).

**Tech Stack:** Vanilla JS (no framework/bundler), plain CSS, `node --test` for frontend unit tests.

## Global Constraints

- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — all styling via
  CSS classes in `static/css/**` component files, even for one-off values (this project's
  no-inline-style convention).
- One function/component per file for reusable JS logic — pure modules expose
  `window.X`/`module.exports` via the guarded dual-export pattern already used by
  `static/font-size-scale.js`/`static/format-run-write.js`.
- Every `static/*.js` and `static/css/**/*.css` file opens with a one/two-line header comment
  stating its purpose — keep these current when a file's role changes.
- `tests/js/**/*.test.js` run via `node --test "tests/js/**/*.test.js"` — pure JS modules only, no
  DOM/browser dependency (fake-`document` shims are used where a test must touch `document`).
- Any commit that adds/moves/renames/deletes files, or changes a reusable component's behavior,
  must update `CLAUDE.md`'s codebase map / inventory in the same commit.
- `docs/superpowers/specs/2026-08-01-safe-zone-darkening-alignment-design.md` is the approved spec
  for this plan — every task below implements one part of it.

---

### Task 1: Derive TEXT_IMAGE_SAFE_RECT / CAPTION_SAFE_RECT in safe-zone-geometry.js

**Files:**
- Modify: `static/safe-zone-geometry.js` (full rewrite of the IIFE body)
- Test: `tests/js/ui-safe-zones.test.js` (extend existing file — it already covers
  `SafeZoneGeometry`'s derived pixel constants)

**Interfaces:**
- Consumes: `SAFE_ZONES` (global, `static/ui-safe-zones.js`) — unchanged.
- Produces: `SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT` and `SafeZoneGeometry.CAPTION_SAFE_RECT`, each
  shaped `{ left, right, top, bottom }` in canvas px. Consumed by Task 2 (`anchor-position.js`) and
  Task 3 (`ui-safe-zones.js`'s darkening renderer).

- [ ] **Step 1: Write the failing test**

Add to the bottom of `tests/js/ui-safe-zones.test.js` (after the existing
`"SafeZoneGeometry derives the same pixel values it hardcodes today"` test):

```js
test("SafeZoneGeometry derives TEXT_IMAGE_SAFE_RECT: mirrored margin, top-zone-to-caption-zone", () => {
  const g = global.SafeZoneGeometry;
  assert.deepStrictEqual(g.TEXT_IMAGE_SAFE_RECT, {
    left: 162,
    right: 918,
    top: 115.2,
    bottom: 1401.6,
  });
});

test("SafeZoneGeometry derives CAPTION_SAFE_RECT: today's existing caption band bounds", () => {
  const g = global.SafeZoneGeometry;
  assert.deepStrictEqual(g.CAPTION_SAFE_RECT, {
    left: 0,
    right: 918,
    top: 1401.6,
    bottom: 1785.6,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/ui-safe-zones.test.js`
Expected: FAIL — `TEXT_IMAGE_SAFE_RECT`/`CAPTION_SAFE_RECT` are `undefined`, so
`assert.deepStrictEqual` fails.

- [ ] **Step 3: Rewrite safe-zone-geometry.js**

Replace the entire file with:

```js
// Pixel-space mirror of static/ui-safe-zones.js's SAFE_ZONES percentages, on the 1080x1920
// export canvas. Single source of truth for default text/caption insert positions
// (panel-text.js, panel-captions.js), the position anchor grid's horizontal margin
// (static/anchor-position.js), and the two safe-zone-darkening-alignment feature safe rects
// (TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT, consumed by anchor-position.js and ui-safe-zones.js).
// Derived from SAFE_ZONES, not hand-mirrored, since 2026-07-29.
const safeZoneGeometryGlobal = typeof window !== "undefined" ? window : global;

safeZoneGeometryGlobal.SafeZoneGeometry = (function deriveSafeZoneGeometry() {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const zoneByKey = Object.fromEntries(safeZoneGeometryGlobal.SAFE_ZONES.map((z) => [z.key, z]));
  // Percent-of-canvas math (e.g. 0.06 * 1920) lands on values like 115.19999999999999 due to
  // binary floating point — round to squash that drift back to the clean decimal.
  const round = (n) => Math.round(n * 1e6) / 1e6;

  // Bottom edge of the top-nav safe zone.
  const TOP_ZONE_BOTTOM = round((zoneByKey.top.inset.height / 100) * CANVAS_H);
  // Top edge of the caption-area safe zone.
  const CAPTION_ZONE_TOP = round((1 - zoneByKey.caption.inset.bottom / 100 - zoneByKey.caption.inset.height / 100) * CANVAS_H);
  // Bottom edge of the caption-area safe zone.
  const CAPTION_ZONE_BOTTOM = round((1 - zoneByKey.caption.inset.bottom / 100) * CANVAS_H);
  // Width of the right icon-rail safe zone, mirrored on the left.
  const HORIZONTAL_MARGIN = round((zoneByKey.right.inset.width / 100) * CANVAS_W);

  // The centered text/image safe rectangle (safe-zone-darkening-alignment feature): the right
  // icon-rail's margin mirrored onto the left, spanning from below the top-nav zone to above the
  // caption zone. This is the rect static/ui-safe-zones.js darkens around for kind="text" (the
  // default) and static/anchor-position.js snaps TOP/BTM/LEFT/RIGHT/MID to for kind="text".
  const TEXT_IMAGE_SAFE_RECT = {
    left: HORIZONTAL_MARGIN,
    right: CANVAS_W - HORIZONTAL_MARGIN,
    top: TOP_ZONE_BOTTOM,
    bottom: CAPTION_ZONE_TOP,
  };

  // The caption-only safe rectangle: exactly today's existing caption band bounds (left 0, right
  // margin, caption zone top/bottom) — unchanged from the pre-existing caption geometry. Active
  // for kind="caption" in both ui-safe-zones.js and anchor-position.js.
  const CAPTION_SAFE_RECT = {
    left: 0,
    right: CANVAS_W - HORIZONTAL_MARGIN,
    top: CAPTION_ZONE_TOP,
    bottom: CAPTION_ZONE_BOTTOM,
  };

  return {
    CANVAS_W,
    CANVAS_H,
    TOP_ZONE_BOTTOM,
    CAPTION_ZONE_TOP,
    CAPTION_ZONE_BOTTOM,
    HORIZONTAL_MARGIN,
    TEXT_IMAGE_SAFE_RECT,
    CAPTION_SAFE_RECT,
  };
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/ui-safe-zones.test.js`
Expected: PASS (all 4 tests in the file, including the 2 pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add static/safe-zone-geometry.js tests/js/ui-safe-zones.test.js
git commit -m "Derive TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT in safe-zone-geometry.js"
```

---

### Task 2: Extract anchor-position math into a pure module, snap to the new rects

**Files:**
- Create: `static/anchor-position.js`
- Modify: `static/panel-text.js:1-36` (remove `anchorPositionX`/`anchorPositionY`, update header
  comment)
- Modify: `static/style-section-position.js` (call the new module, pass `target.kind`)
- Modify: `static/index.html` (add script tag)
- Test: `tests/js/anchor-position.test.js` (new)

**Interfaces:**
- Consumes: `SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT`/`CAPTION_SAFE_RECT` (Task 1).
- Produces: `window.AnchorPosition.positionX(value, boxWidth, align, kind = "text")` and
  `window.AnchorPosition.positionY(value, boxHeight, kind = "text")`, both also exported via
  `module.exports` for `node --test`. `value` is `"top"`/`"btm"`/`"mid"` for `positionY`,
  `"left"`/`"right"`/`"mid"` for `positionX`. `kind` is `"text"` or `"caption"`.

- [ ] **Step 1: Write the failing test**

Create `tests/js/anchor-position.test.js`:

```js
// Pins AnchorPosition.positionX/positionY against SafeZoneGeometry's derived safe rects for both
// kinds. Requires ui-safe-zones.js + safe-zone-geometry.js first (same pattern as
// ui-safe-zones.test.js) so SafeZoneGeometry is populated on `global` before anchor-position.js
// reads it.
const test = require("node:test");
const assert = require("node:assert");

delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
delete require.cache[require.resolve("../../static/safe-zone-geometry.js")];
delete require.cache[require.resolve("../../static/anchor-position.js")];
require("../../static/ui-safe-zones.js");
require("../../static/safe-zone-geometry.js");
const { positionX, positionY } = require("../../static/anchor-position.js");

// Every caller (static/style-section-position.js) does Math.round(...) on the result before
// writing it to TextPreset.x/y, so these assertions round too — that also sidesteps binary
// floating-point drift from summing decimals like 115.2 + 1401.6 (e.g. 1516.7999999999997
// instead of 1516.8), which a plain strictEqual on the raw float would flake on.
function r(n) { return Math.round(n); }

test("positionX: text kind snaps LEFT/RIGHT to the mirrored margin", () => {
  assert.strictEqual(r(positionX("left", 100, "left", "text")), 162);
  assert.strictEqual(r(positionX("right", 100, "left", "text")), 818);
});

test("positionX: text kind centers MID on the canvas (symmetric margins)", () => {
  assert.strictEqual(r(positionX("mid", 500, "center", "text")), 540);
});

test("positionX: caption kind snaps LEFT to 0, RIGHT to the same margin as text", () => {
  assert.strictEqual(r(positionX("left", 100, "left", "caption")), 0);
  assert.strictEqual(r(positionX("right", 100, "left", "caption")), 818);
});

test("positionX: caption kind centers MID within its own (asymmetric) rect", () => {
  assert.strictEqual(r(positionX("mid", 500, "center", "caption")), 459);
});

test("positionX: defaults to text kind when omitted", () => {
  assert.strictEqual(r(positionX("left", 100, "left")), 162);
});

test("positionY: text kind snaps TOP/BTM to the top-nav/caption-zone bounds", () => {
  assert.strictEqual(r(positionY("top", 300, "text")), 115);
  assert.strictEqual(r(positionY("btm", 300, "text")), 1102);
});

test("positionY: text kind centers MID within [TOP_ZONE_BOTTOM, CAPTION_ZONE_TOP]", () => {
  assert.strictEqual(r(positionY("mid", 300, "text")), 608);
});

test("positionY: caption kind snaps TOP/BTM to the caption-zone bounds", () => {
  assert.strictEqual(r(positionY("top", 100, "caption")), 1402);
  assert.strictEqual(r(positionY("btm", 100, "caption")), 1686);
});

test("positionY: caption kind centers MID within [CAPTION_ZONE_TOP, CAPTION_ZONE_BOTTOM]", () => {
  assert.strictEqual(r(positionY("mid", 100, "caption")), 1544);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/anchor-position.test.js`
Expected: FAIL — `Cannot find module '../../static/anchor-position.js'`

- [ ] **Step 3: Create static/anchor-position.js**

```js
// Pure edge-flush anchor math for the TEXT/CAPTIONS POSITION shortcut buttons (TOP/BTM/LEFT/
// RIGHT/MID). Extracted from panel-text.js (safe-zone-darkening-alignment feature) so it can run
// under node --test without a DOM. Snaps to SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT (kind="text",
// default) or CAPTION_SAFE_RECT (kind="caption") instead of the raw canvas edges — using the
// box's own actual rendered width/height (from Preview.getTextBoxSize/getCaptionBoxSize) so
// TOP/BTM/LEFT/RIGHT place the box's edge (not its top-left corner) flush with the safe rect's
// edge, and MID centers it within the safe rect. Exposes window.AnchorPosition.{positionX,
// positionY} in the browser and the same object via module.exports for node --test.
(() => {
  function rectFor(kind) {
    return kind === "caption"
      ? SafeZoneGeometry.CAPTION_SAFE_RECT
      : SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT;
  }

  // The box's rendered left edge is offset from `x` by a CSS transform keyed on text align
  // (stage.css's .text-block--align-*: 0 for left, -50% for center, -100% for right), so the
  // same edge-flush x must be shifted by that same fraction of the box width to compensate.
  function positionX(value, boxWidth, align, kind = "text") {
    const w = boxWidth || 0;
    const offsetFactor = align === "center" ? 0.5 : align === "right" ? 1 : 0;
    const rect = rectFor(kind);
    let visualLeft;
    if (value === "left") visualLeft = rect.left;
    else if (value === "right") visualLeft = Math.max(rect.left, rect.right - w);
    else visualLeft = Math.max(rect.left, (rect.left + rect.right - w) / 2);
    return visualLeft + offsetFactor * w;
  }

  function positionY(value, boxHeight, kind = "text") {
    const h = boxHeight || 0;
    const rect = rectFor(kind);
    if (value === "top") return rect.top;
    if (value === "btm") return Math.max(rect.top, rect.bottom - h);
    return Math.max(rect.top, (rect.top + rect.bottom - h) / 2);
  }

  const api = { positionX, positionY };
  if (typeof window !== "undefined") window.AnchorPosition = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/anchor-position.test.js`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Wire AnchorPosition into style-section-position.js**

In `static/style-section-position.js`, update the header comment (lines 1-10) — replace:

```js
// Shared Box-tab section: the absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) plus
// the stateless single-row six-icon anchor shortcut, one file serving both the TEXT and CAPTIONS
// panels. Uses target.getBoxSize() for the box's live rendered size and panel-text.js's
// anchorPositionX/anchorPositionY for the edge-flush maths. Every write is setPresetField.
```

with:

```js
// Shared Box-tab section: the absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) plus
// the stateless single-row six-icon anchor shortcut, one file serving both the TEXT and CAPTIONS
// panels. Uses target.getBoxSize() for the box's live rendered size and static/anchor-position.js's
// AnchorPosition.positionX/positionY (kind-aware: target.kind picks the text/image vs caption safe
// rect) for the edge-flush maths. Every write is setPresetField.
```

Then replace the `setActive` block (currently):

```js
    const setActive = UI.buttonGroup(gridEl, OPTIONS, null, (value) => {
      const size = target.getBoxSize();
      if (value === "top" || value === "mid-v" || value === "btm") {
        const y = anchorPositionY(value === "mid-v" ? "mid" : value, size && size.height);
        target.setPresetField("y", Math.round(y));
      } else {
        // anchorPositionX's third argument is the align mode: stage.css shifts the box by a
        // fraction of its own width depending on align, and the edge-flush x has to compensate.
        const x = anchorPositionX(value === "mid-h" ? "mid" : value, size && size.width, target.getPreset().align);
        target.setPresetField("x", Math.round(x));
      }
      target.rerenderPanel();
    });
```

with:

```js
    const setActive = UI.buttonGroup(gridEl, OPTIONS, null, (value) => {
      const size = target.getBoxSize();
      if (value === "top" || value === "mid-v" || value === "btm") {
        const y = AnchorPosition.positionY(value === "mid-v" ? "mid" : value, size && size.height, target.kind);
        target.setPresetField("y", Math.round(y));
      } else {
        // AnchorPosition.positionX's third argument is the align mode: stage.css shifts the box
        // by a fraction of its own width depending on align, and the edge-flush x has to
        // compensate; the fourth argument picks which safe rect (text/image vs caption) to snap
        // to.
        const x = AnchorPosition.positionX(value === "mid-h" ? "mid" : value, size && size.width, target.getPreset().align, target.kind);
        target.setPresetField("x", Math.round(x));
      }
      target.rerenderPanel();
    });
```

- [ ] **Step 6: Remove anchorPositionX/anchorPositionY from panel-text.js**

In `static/panel-text.js`, replace lines 1-36 (the file header comment through the end of
`anchorPositionY`) — currently:

```js
// TEXT context-panel section: renders the FONT/STYLES/BOX/TIME tab bar (UI.tabBar) for the selected
// text block (empty-state aware when zero blocks exist), plus the stage resize/move handlers.
// Plain globals (renderTextPanel, currentTextBlock, selectTextBlock, addTextBlock, ...) shared
// with text-panel-*.js; reaches into editor.js's `project`/`saveProject`/`selected`/`showPanel` globals.
// addTextBlockAndEdit(position?) (wired to the empty-state "+ Add text" button, the left icon
// rail's TEXT entry, and stage-click-router.js's Text-tool insert-at-click) creates the block,
// opens the panel, and immediately enters on-stage contentEditable edit mode via
// Preview.enterTextEditMode() so the user can type right away; an optional {x, y} canvas-px
// position overrides the new block's default centered placement.

// Position grid anchors: edge-flush against the 1080x1920 canvas, using the box's own actual
// rendered width/height (from Preview.getTextBoxSize/getCaptionBoxSize) so TOP/BTM/LEFT/RIGHT
// place the box's edge (not its top-left corner) flush with the canvas edge, and MID centers it.
// Used only as a stateless one-shot shortcut in the POSITION single row of icon buttons — clicking
// one writes the computed value straight into TextPreset.x/y with no persisted anchor selection.
function anchorPositionX(value, boxWidth, align) {
  // The box's rendered left edge is offset from `x` by a CSS transform keyed on text align
  // (stage.css's .text-block--align-*: 0 for left, -50% for center, -100% for right), so the
  // same edge-flush x must be shifted by that same fraction of the box width to compensate.
  const w = boxWidth || 0;
  const offsetFactor = align === "center" ? 0.5 : align === "right" ? 1 : 0;
  const canvasW = SafeZoneGeometry.CANVAS_W;
  const margin = SafeZoneGeometry.HORIZONTAL_MARGIN;
  let visualLeft;
  if (value === "left") visualLeft = margin;
  else if (value === "right") visualLeft = Math.max(margin, canvasW - margin - w);
  else visualLeft = Math.max(0, (canvasW - w) / 2);
  return visualLeft + offsetFactor * w;
}

function anchorPositionY(value, boxHeight) {
  const h = boxHeight || 0;
  if (value === "top") return 0;
  if (value === "btm") return Math.max(0, 1920 - h);
  return Math.max(0, (1920 - h) / 2);
}
```

with:

```js
// TEXT context-panel section: renders the FONT/STYLES/BOX/TIME tab bar (UI.tabBar) for the selected
// text block (empty-state aware when zero blocks exist), plus the stage resize/move handlers.
// Plain globals (renderTextPanel, currentTextBlock, selectTextBlock, addTextBlock, ...) shared
// with text-panel-*.js; reaches into editor.js's `project`/`saveProject`/`selected`/`showPanel` globals.
// addTextBlockAndEdit(position?) (wired to the empty-state "+ Add text" button, the left icon
// rail's TEXT entry, and stage-click-router.js's Text-tool insert-at-click) creates the block,
// opens the panel, and immediately enters on-stage contentEditable edit mode via
// Preview.enterTextEditMode() so the user can type right away; an optional {x, y} canvas-px
// position overrides the new block's default centered placement.
//
// POSITION anchor math (the TOP/BTM/LEFT/RIGHT/MID edge-flush shortcut buttons) moved to
// static/anchor-position.js (safe-zone-darkening-alignment feature, extracted so it can run under
// node --test without a DOM) — see AnchorPosition.positionX/positionY there.
```

(The rest of the file, starting at `function defaultTextPreset(id) {`, is unchanged — it still uses
`SafeZoneGeometry.TOP_ZONE_BOTTOM` directly for the default `y`, which is unaffected since
`TEXT_IMAGE_SAFE_RECT.top === TOP_ZONE_BOTTOM`.)

- [ ] **Step 7: Add the script tag to index.html**

In `static/index.html`, find:

```html
<script src="/static/ui-safe-zones.js"></script>
<script src="/static/safe-zone-geometry.js"></script>
<script src="/static/panel-text.js"></script>
```

Replace with:

```html
<script src="/static/ui-safe-zones.js"></script>
<script src="/static/safe-zone-geometry.js"></script>
<script src="/static/anchor-position.js"></script>
<script src="/static/panel-text.js"></script>
```

- [ ] **Step 8: Run the full JS test suite to check for regressions**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (all tests, including the new `anchor-position.test.js` and the extended
`ui-safe-zones.test.js`)

- [ ] **Step 9: Commit**

```bash
git add static/anchor-position.js static/panel-text.js static/style-section-position.js static/index.html tests/js/anchor-position.test.js
git commit -m "Snap TEXT panel POSITION anchors to the safe-zone rects"
```

---

### Task 3: Replace the 4-band guide with a context-aware darkening overlay

**Files:**
- Modify: `static/ui-safe-zones.js` (full rewrite)
- Modify: `static/css/components/safe-zones.css` (full rewrite)
- Modify: `static/css/tokens.css` (add `--safe-zone-scrim`)
- Modify: `static/css/components/chip.css` (remove now-dead `.chip--outlined`/`.chip--safe-zone`)
- Test: `tests/js/ui-safe-zones.test.js` (extend — add pure `guideCss`/`rectToPercent` coverage)

**Interfaces:**
- Consumes: `SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT`/`CAPTION_SAFE_RECT` (Task 1).
- Produces: `UI.safeZones(container, kind = "text")` — same call shape as today plus the new
  `kind` param. Consumed by Task 4 (`editor.js`).

- [ ] **Step 1: Write the failing test**

Add to `tests/js/ui-safe-zones.test.js` (it already requires `ui-safe-zones.js` and
`safe-zone-geometry.js` at the top — add these tests after the existing ones):

```js
test("rectToPercent converts a px rect to percent-of-canvas bounds", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { rectToPercent } = require("../../static/ui-safe-zones.js");
  const pct = rectToPercent({ left: 162, right: 918, top: 115.2, bottom: 1401.6 });
  assert.strictEqual(pct.left, 15);
  assert.strictEqual(pct.right, 85);
  assert.strictEqual(pct.top, 6);
  assert.strictEqual(pct.bottom, 73);
});

test("guideCss('text') positions the 4 bars + cutout around TEXT_IMAGE_SAFE_RECT", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { guideCss } = require("../../static/ui-safe-zones.js");
  const css = guideCss("text");
  assert.match(css, /\.safe-zone-bar-top \{ top: 0%; left: 0%; right: 0%; height: 6%; \}/);
  assert.match(css, /\.safe-zone-bar-bottom \{ bottom: 0%; left: 0%; right: 0%; height: 27%; \}/);
  assert.match(css, /\.safe-zone-bar-left \{ top: 6%; height: 67%; left: 0%; width: 15%; \}/);
  assert.match(css, /\.safe-zone-bar-right \{ top: 6%; height: 67%; left: 85%; right: 0%; \}/);
  assert.match(css, /\.safe-zone-cutout \{ top: 6%; left: 15%; right: 15%; bottom: 27%; \}/);
});

test("guideCss('caption') positions the 4 bars + cutout around CAPTION_SAFE_RECT", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { guideCss } = require("../../static/ui-safe-zones.js");
  const css = guideCss("caption");
  assert.match(css, /\.safe-zone-bar-top \{ top: 0%; left: 0%; right: 0%; height: 73%; \}/);
  assert.match(css, /\.safe-zone-bar-left \{ top: 73%; height: 20%; left: 0%; width: 0%; \}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/ui-safe-zones.test.js`
Expected: FAIL — `rectToPercent`/`guideCss` are not exported yet (`require(...)` returns `{}`,
destructured values are `undefined`).

- [ ] **Step 3: Rewrite static/ui-safe-zones.js**

Replace the entire file with:

```js
// Reusable safe-zone darkening guide, framework-free. Attaches to window.SAFE_ZONES/UI.
// SAFE_ZONES remains the single source of truth for the 4 real-TikTok-chrome band percentages
// that static/safe-zone-geometry.js derives TOP_ZONE_BOTTOM/CAPTION_ZONE_TOP/CAPTION_ZONE_BOTTOM/
// HORIZONTAL_MARGIN (and, in turn, TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT) from — but as of the
// safe-zone-darkening-alignment feature it's no longer iterated to render 4 separate shaded/
// labeled bands. UI.safeZones now darkens everything outside ONE context-aware safe rectangle
// instead (see the `kind` param below).
const uiSafeZonesGlobal = typeof window !== "undefined" ? window : global;
uiSafeZonesGlobal.UI = uiSafeZonesGlobal.UI || {};

// Percentages are of the 1080x1920 canvas (matching TikTok's real UI chrome). `inset` uses the
// same box-model shorthand as CSS: {top, right, bottom, left, width, height} as percentages.
uiSafeZonesGlobal.SAFE_ZONES = [
  { key: "top", label: "FOLLOWING / FOR YOU", inset: { top: 0, left: 0, right: 0, height: 6 } },
  { key: "right", label: "LIKE &middot; COMMENT &middot; SAVE &middot; SHARE", inset: { top: 40, right: 0, width: 15, height: 44 } },
  { key: "caption", label: "USERNAME / CAPTION / SOUND", inset: { left: 0, right: 15, bottom: 7, height: 20 } },
  { key: "nav", label: "HOME / DISCOVER / INBOX / PROFILE", inset: { left: 0, right: 0, bottom: 0, height: 7 } },
];

const STYLE_EL_ID = "safe-zone-geometry-style";

// Percent-of-canvas division (e.g. 162 / 1080 * 100) lands on values like 15.000000000000002 due
// to binary floating point — round to squash that drift back to the clean decimal, same fix
// safe-zone-geometry.js applies to its own derived constants.
function round(n) { return Math.round(n * 1e6) / 1e6; }

// Converts a SafeZoneGeometry px rect ({left, right, top, bottom}, safe-zone-geometry.js) into
// percent-of-canvas bounds — the unit the generated <style> rules below are written in.
function rectToPercent(rect) {
  const w = uiSafeZonesGlobal.SafeZoneGeometry.CANVAS_W;
  const h = uiSafeZonesGlobal.SafeZoneGeometry.CANVAS_H;
  return {
    top: round((rect.top / h) * 100),
    bottom: round((rect.bottom / h) * 100),
    left: round((rect.left / w) * 100),
    right: round((rect.right / w) * 100),
  };
}

// One CSS rule per bar + the cutout border, computed from the active safe rect
// (TEXT_IMAGE_SAFE_RECT for kind="text", CAPTION_SAFE_RECT for kind="caption"). The top/bottom
// bars span the full canvas width (so they also cover the corners above/below the cutout's own
// left/right margins); the left/right bars only span the cutout's own vertical range — so the
// four bars tile the darkened area with no gaps or overlaps.
function guideCss(kind) {
  const rectPx = kind === "caption"
    ? uiSafeZonesGlobal.SafeZoneGeometry.CAPTION_SAFE_RECT
    : uiSafeZonesGlobal.SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT;
  const r = rectToPercent(rectPx);
  return [
    `.safe-zone-bar-top { top: 0%; left: 0%; right: 0%; height: ${r.top}%; }`,
    `.safe-zone-bar-bottom { bottom: 0%; left: 0%; right: 0%; height: ${100 - r.bottom}%; }`,
    `.safe-zone-bar-left { top: ${r.top}%; height: ${r.bottom - r.top}%; left: 0%; width: ${r.left}%; }`,
    `.safe-zone-bar-right { top: ${r.top}%; height: ${r.bottom - r.top}%; left: ${r.right}%; right: 0%; }`,
    `.safe-zone-cutout { top: ${r.top}%; left: ${r.left}%; right: ${100 - r.right}%; bottom: ${100 - r.bottom}%; }`,
  ].join("\n");
}

// Injects/updates the generated geometry <style> element (idempotent — safe to call on every
// render; the element is reused, only its content is replaced when `kind` changes).
function ensureStyleElement(kind) {
  let style = document.getElementById(STYLE_EL_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_EL_ID;
    document.head.appendChild(style);
  }
  style.textContent = guideCss(kind);
}

// Renders the darkening guide into container (expects container to already be the #safe-zones
// element, which owns position:absolute/inset:0/pointer-events:none from safe-zones.css).
// kind: "text" (default) darkens around the wide, centered text/image safe area
// (SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT); "caption" darkens around the narrower, lower
// caption-only safe area (SafeZoneGeometry.CAPTION_SAFE_RECT). Call again with a different kind
// to switch which rect is cut out — editor.js's renderTimeline() does this on every selection
// change.
uiSafeZonesGlobal.UI.safeZones = function safeZones(container, kind = "text") {
  container.innerHTML = "";
  ensureStyleElement(kind);
  ["top", "bottom", "left", "right"].forEach((side) => {
    const bar = document.createElement("div");
    bar.className = `safe-zone-bar safe-zone-bar-${side}`;
    container.appendChild(bar);
  });
  const cutout = document.createElement("div");
  cutout.className = "safe-zone-cutout";
  container.appendChild(cutout);
};

if (typeof module !== "undefined") {
  module.exports = { rectToPercent, guideCss };
}
```

- [ ] **Step 4: Add --safe-zone-scrim to tokens.css**

In `static/css/tokens.css`, find the tooltip-token block (ends right before the `:root` closing
brace):

```css
  --tooltip-bg: #101113;
  --tooltip-border: #26282B;
  --tooltip-text: #E7E7E6;
  --tooltip-shortcut-bg: #E7E7E6;
  --tooltip-shortcut-border: #E7E7E6;
  --tooltip-shortcut-text: #101113;
}
```

Replace with:

```css
  --tooltip-bg: #101113;
  --tooltip-border: #26282B;
  --tooltip-text: #E7E7E6;
  --tooltip-shortcut-bg: #E7E7E6;
  --tooltip-shortcut-border: #E7E7E6;
  --tooltip-shortcut-text: #101113;

  /* Safe-zone darkening guide scrim (static/ui-safe-zones.js): fixed regardless of theme, like
     the tooltip palette above — it overlays arbitrary video content, not app chrome, so it
     shouldn't shift with the light/dark toggle. */
  --safe-zone-scrim: rgba(0, 0, 0, 0.55);
}
```

- [ ] **Step 5: Rewrite safe-zones.css**

Replace the entire contents of `static/css/components/safe-zones.css` with:

```css
/* Safe-zone darkening guide: dims everything outside a "safe rectangle" — the centered
   text/image area by default, or the narrower caption-only area while a caption is selected —
   with a solid accent border outlining the cutout. Toggled from the timeline toolbar. */
/* Exposes #safe-zones (+ .safe-zone-bar/.safe-zone-bar-*/.safe-zone-cutout). #safe-zones-toggle
   lives in #timeline-toolbar and is built via UI.button (button.css's .button[aria-pressed="true"])
   for its pressed state. Depends on tokens.css (--safe-zone-scrim, --safe-zone), #stage (position:
   relative, in stage.css). Each bar's/the cutout's position (top/right/bottom/left/width/height)
   is set by a generated <style> element (static/ui-safe-zones.js's ensureStyleElement) computed
   from the active SafeZoneGeometry rect, rather than inline styles — this file only keeps the
   shared visual (fill color / border). */
#safe-zones {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#safe-zones[hidden] { display: none; }

.safe-zone-bar {
  position: absolute;
  background: var(--safe-zone-scrim);
}

.safe-zone-cutout {
  position: absolute;
  border: 2px solid var(--safe-zone);
}
```

- [ ] **Step 6: Remove the now-dead chip modifiers from chip.css**

In `static/css/components/chip.css`, replace the whole file with:

```css
/* Shared small-labeled-chip component: usage counts, status badges. */
/* Exposes .chip + .chip--pill/.chip--tinted/.chip--silence/.chip--filler modifiers. Depends on
   tokens.css. */
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--icon-size-sm);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: var(--border-width) solid var(--border-soft);
  color: var(--text-dim);
  font-family: var(--font-ui);
  font-size: var(--fs-2xs);
  line-height: 1;
}

/* Usage-count pill (FILES panel). */
.chip--pill {
  min-width: var(--icon-size-sm);
  border-radius: var(--radius-pill);
}

/* Tinted status badge (AUTO SLICE detected-range kind). */
.chip--tinted {
  flex-shrink: 0;
  height: auto;
  padding: 2px 5px;
  background: transparent;
  border-color: var(--border-color);
  color: var(--text);
  line-height: 1.4;
  letter-spacing: var(--ls-tight);
}

.chip--silence { color: var(--accent); border-color: var(--accent); }
.chip--filler { color: var(--accent-gold); border-color: var(--accent-gold); }
```

(`.chip--outlined` and `.chip--safe-zone` are removed — their only consumer was the old per-band
label chips in `ui-safe-zones.js`, which no longer render labels.)

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test tests/js/ui-safe-zones.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 8: Run the full JS test suite to check for regressions**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS — in particular `no-raw-svg.test.js` and any test scanning for retired classes
should still pass since nothing here touches `<svg>` markup or legacy button/label classes.

- [ ] **Step 9: Commit**

```bash
git add static/ui-safe-zones.js static/css/components/safe-zones.css static/css/tokens.css static/css/components/chip.css tests/js/ui-safe-zones.test.js
git commit -m "Replace the 4-band safe-zone guide with a context-aware darkening overlay"
```

---

### Task 4: Wire selection-based context-awareness in editor.js

**Files:**
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: `UI.safeZones(container, kind)` (Task 3), the existing module-scope `selected` variable
  and `renderTimeline()` function.
- Produces: nothing new consumed by later tasks — this is the final wiring step.

- [ ] **Step 1: Add safeZoneKindFor and wire it into renderTimeline()**

In `static/editor.js`, find:

```js
function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect,
    { onAddClip: () => importMedia(), onSelectAudio: () => openAudioPanel(), onOpenCaptionsPanel: () => openCaptionsPanel() });
}
```

Replace with:

```js
// "caption" (a caption group selected on the timeline) or "captions" (the CAPTIONS panel open via
// the nav rail with nothing specific selected yet) narrows the safe-zone guide to the caption-only
// safe rect; everything else (including nothing selected) uses the wider text/image safe rect.
function safeZoneKindFor(sel) {
  return sel && (sel.type === "caption" || sel.type === "captions") ? "caption" : "text";
}

function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect,
    { onAddClip: () => importMedia(), onSelectAudio: () => openAudioPanel(), onOpenCaptionsPanel: () => openCaptionsPanel() });
  UI.safeZones(document.getElementById("safe-zones"), safeZoneKindFor(selected));
}
```

- [ ] **Step 2: Remove the now-redundant standalone initial UI.safeZones call**

In `static/editor.js`, find:

```js
UI.safeZones(document.getElementById("safe-zones"));

function setSafeZonesVisible(visible) {
```

Replace with:

```js
function setSafeZonesVisible(visible) {
```

(`renderTimeline()` — called from `openProject()` on cold start, well before the user can toggle
`#safe-zones-toggle` — now populates `#safe-zones` with the correct initial `kind`, so the
standalone call at load time is dead weight.)

- [ ] **Step 3: Manual verification in the browser**

This wiring can't be covered by `node --test` (it's DOM/selection-state glue). Start the dev
server and verify by hand:

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

Then, in the browser (open http://127.0.0.1:8000, open any project — create a throwaway one if
needed, per this project's live-verification convention of never testing on real project data):

1. Click the shield icon (`#safe-zones-toggle`) in the timeline toolbar to turn the guide on.
2. Confirm you see ONE darkened surround with a single accent-bordered cutout in the center —
   not the old 4 separate labeled bands.
3. Add a text block (TEXT tool) and select it. Confirm the guide still shows the centered
   text/image cutout (unchanged — text is the default `kind`).
4. Click each POSITION anchor button (TOP/BTM/LEFT/RIGHT/MID-H/MID-V) on that text block. Confirm
   each one lands the block's edge flush with the guide's cutout edges.
5. Select (or create) a caption — open the CAPTIONS panel. Confirm the guide's cutout switches to
   the narrower, lower caption-only rectangle.
6. Switch back to the text block. Confirm the guide's cutout switches back to the wider centered
   rectangle.
7. Toggle the guide off. Confirm `#safe-zones` is fully hidden (no residual bars/border).

- [ ] **Step 4: Commit**

```bash
git add static/editor.js
git commit -m "Make the safe-zone guide switch its cutout by selection context"
```

---

### Task 5: Update CLAUDE.md's codebase map + final verification

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** None — documentation-only task.

- [ ] **Step 1: Update the File structure tree entries**

In `CLAUDE.md`'s File structure tree, update these existing entries (they currently describe the
pre-this-feature behavior):

- `static/safe-zone-geometry.js` — mention `TEXT_IMAGE_SAFE_RECT`/`CAPTION_SAFE_RECT` alongside
  the existing `TOP_ZONE_BOTTOM`/`CAPTION_ZONE_TOP`/`CAPTION_ZONE_BOTTOM`/`HORIZONTAL_MARGIN`, and
  note `static/anchor-position.js` as a consumer (replacing the `panel-text.js`'s `anchorPositionX`
  mention).
- `static/ui-safe-zones.js` — replace the "renders one `<div class="safe-zone safe-zone-{key}">`
  per band" description with: darkens everything outside a context-aware safe rect via
  `UI.safeZones(container, kind)`, 4 bars + a cutout border, no longer renders per-band labels.
- `static/panel-text.js` — remove the `anchorPositionX`/`anchorPositionY` description, replace with
  a pointer to `static/anchor-position.js`.
- `static/editor.js` — mention `safeZoneKindFor(selected)` and that `renderTimeline()` re-renders
  the safe-zone guide on every selection change.
- `static/css/components/safe-zones.css` — update the description to match the new bars/cutout
  structure (replace "4 `.safe-zone-*` guide bands ... shaded tint + solid accent edge ... opaque
  label chips" with the new darkening-scrim + cutout-border description).
- `static/css/components/chip.css` — remove `.chip--outlined`/`.chip--safe-zone` from the "Exposes"
  list.

Add a new entry for `static/anchor-position.js` (alphabetically near `safe-zone-geometry.js`'s
neighbors, matching the tree's existing ordering) describing `AnchorPosition.positionX/positionY`.

- [ ] **Step 2: Update the "Settings & safe zones" inventory section**

In `CLAUDE.md`'s `### Settings & safe zones` inventory section, update the
`static/css/components/safe-zones.css` bullet to match the new darkening-overlay description
(replacing "4 guide bands (top nav / right action rail / caption area / bottom nav) matching
TikTok's real UI chrome, preview-only").

- [ ] **Step 3: Run the full test suite one final time**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (every test)

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (no backend files were touched by this plan, so this is a regression check only)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Update codebase map for the safe-zone darkening + anchor alignment feature"
```
