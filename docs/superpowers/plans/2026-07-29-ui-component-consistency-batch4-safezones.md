# Batch 4 — UI.safeZones

> Part of the [UI Component Consistency master plan](2026-07-29-ui-component-consistency-master.md).
> REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.
> Depends on Batches 1, 1b, and 3 being complete and committed first (this component uses `.chip`
> from Batch 1 Task 3 for its label styling).

**Goal:** Render the four safe-zone bands from one `SAFE_ZONES` data array instead of four
hand-written `<div>`s, and make `safe-zone-geometry.js` derive its pixel constants from that same
array instead of hand-mirroring `safe-zones.css`'s percentages.

## Global Constraints

See the [master plan](2026-07-29-ui-component-consistency-master.md#global-constraints).

## Task 18: Build `UI.safeZones`, derive the geometry, migrate `index.html`

**Files:**
- Create: `static/ui-safe-zones.js`
- Modify: `static/safe-zone-geometry.js` (derive constants instead of hardcoding them)
- Modify: `static/index.html` (replace the 4 hand-written `.safe-zone` divs with a single mount
  point)
- Modify: `static/editor.js` (no signature change needed — `setSafeZonesVisible`/the toggle
  listener at lines 156-164 keep working against `#safe-zones`, which `UI.safeZones` will
  still render into)
- Create: `tests/js/ui-safe-zones.test.js`

**Interfaces:**
- Produces: `window.SAFE_ZONES` (an array of `{ key, label, inset }` zone definitions, where
  `inset` is a partial `{ top, right, bottom, left, width, height }` percentage box — same
  shorthand shape as CSS positioning, in `static/ui-safe-zones.js`) and `window.UI.safeZones
  (container)` which renders all four bands into `container` from that array. The per-band
  border accent (`.safe-zone-top { border-bottom: ... }` etc.) stays a CSS rule keyed on
  `.safe-zone-{key}`, not a field on the data array.
  `static/safe-zone-geometry.js`'s `window.SafeZoneGeometry` keeps its existing 4 exported
  constant names (`TOP_ZONE_BOTTOM`, `CAPTION_ZONE_TOP`, `CAPTION_ZONE_BOTTOM`,
  `HORIZONTAL_MARGIN`) — same interface for its 2 existing consumers (`panel-text.js`,
  `panel-captions.js`), but their *values* are now computed from `SAFE_ZONES` instead of
  hardcoded.

- [ ] **Step 1: Read the current 4 bands' exact geometry**

```bash
cat static/css/components/safe-zones.css
cat static/safe-zone-geometry.js
```

Confirm the percentage-to-pixel mapping before writing the derivation (already known from the
audit): top band = 6% of 1920 height; right band = 15% width, 40%–84% height (`top: 40%; width:
15%; height: 44%`); caption band = 15% right-inset, bottom 7%, height 20% (`left: 0; right: 15%;
bottom: 7%; height: 20%`); nav band = bottom 7% height.

- [ ] **Step 2: Write the failing test**

```js
// tests/js/ui-safe-zones.test.js
// Pins that safe-zone-geometry.js's exported pixel constants match the values it hardcodes
// today (115.2 / 162 / 1401.6 / 1785.6), proving the derivation refactor is behavior-preserving.
const test = require("node:test");
const assert = require("node:assert");

delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
delete require.cache[require.resolve("../../static/safe-zone-geometry.js")];
require("../../static/ui-safe-zones.js");
require("../../static/safe-zone-geometry.js");

test("SAFE_ZONES defines exactly the 4 existing bands", () => {
  const keys = global.SAFE_ZONES.map((z) => z.key).sort();
  assert.deepStrictEqual(keys, ["caption", "nav", "right", "top"]);
});

test("SafeZoneGeometry derives the same pixel values it hardcodes today", () => {
  const g = global.SafeZoneGeometry;
  assert.strictEqual(g.CANVAS_W, 1080);
  assert.strictEqual(g.CANVAS_H, 1920);
  assert.strictEqual(g.TOP_ZONE_BOTTOM, 115.2);
  assert.strictEqual(g.CAPTION_ZONE_TOP, 1401.6);
  assert.strictEqual(g.CAPTION_ZONE_BOTTOM, 1785.6);
  assert.strictEqual(g.HORIZONTAL_MARGIN, 162);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/js/ui-safe-zones.test.js`
Expected: FAIL — neither file has these exports yet.

- [ ] **Step 4: Write `static/ui-safe-zones.js`**

```js
// Reusable safe-zone reference overlay, framework-free. Attaches to window.SAFE_ZONES/UI.
// Depends on the .safe-zone/.chip CSS (safe-zones.css, chip.css). Single source of truth for
// the 4 bands' geometry — static/safe-zone-geometry.js derives its pixel constants from this.
window.UI = window.UI || {};

// Percentages are of the 1080x1920 canvas (matching TikTok's real UI chrome). `inset` uses the
// same box-model shorthand as CSS: {top, right, bottom, left, width, height} as percentages.
window.SAFE_ZONES = [
  { key: "top", label: "FOLLOWING / FOR YOU", inset: { top: 0, left: 0, right: 0, height: 6 } },
  { key: "right", label: "LIKE &middot; COMMENT &middot; SAVE &middot; SHARE", inset: { top: 40, right: 0, width: 15, height: 44 } },
  { key: "caption", label: "USERNAME / CAPTION / SOUND", inset: { left: 0, right: 15, bottom: 7, height: 20 } },
  { key: "nav", label: "HOME / DISCOVER / INBOX / PROFILE", inset: { left: 0, right: 0, bottom: 0, height: 7 } },
];

function insetStyle(inset) {
  const parts = [];
  if (inset.top !== undefined) parts.push(`top: ${inset.top}%`);
  if (inset.right !== undefined) parts.push(`right: ${inset.right}%`);
  if (inset.bottom !== undefined) parts.push(`bottom: ${inset.bottom}%`);
  if (inset.left !== undefined) parts.push(`left: ${inset.left}%`);
  if (inset.width !== undefined) parts.push(`width: ${inset.width}%`);
  if (inset.height !== undefined) parts.push(`height: ${inset.height}%`);
  return parts.join("; ");
}

// Renders all 4 bands into container (expects container to already be the #safe-zones element,
// which owns position:absolute/inset:0/pointer-events:none from safe-zones.css).
window.UI.safeZones = function safeZones(container) {
  container.innerHTML = "";
  for (const zone of window.SAFE_ZONES) {
    const div = document.createElement("div");
    div.className = `safe-zone safe-zone-${zone.key}`;
    div.style.cssText = insetStyle(zone.inset);
    const span = document.createElement("span");
    span.className = "chip chip--outlined chip--safe-zone";
    span.innerHTML = zone.label;
    div.appendChild(span);
    container.appendChild(div);
  }
};
```

- [ ] **Step 5: Rewrite `static/safe-zone-geometry.js` to derive from `SAFE_ZONES`**

```js
// Pixel-space mirror of static/ui-safe-zones.js's SAFE_ZONES percentages, on the 1080x1920
// export canvas. Single source of truth for default text/caption insert positions
// (panel-text.js, panel-captions.js) and the position anchor grid's horizontal margin
// (panel-text.js's anchorPositionX). Derived from SAFE_ZONES, not hand-mirrored, since 2026-07-29.
window.SafeZoneGeometry = (function deriveSafeZoneGeometry() {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const zoneByKey = Object.fromEntries(window.SAFE_ZONES.map((z) => [z.key, z]));

  return {
    CANVAS_W,
    CANVAS_H,
    // Bottom edge of the top-nav safe zone.
    TOP_ZONE_BOTTOM: (zoneByKey.top.inset.height / 100) * CANVAS_H,
    // Top edge of the caption-area safe zone.
    CAPTION_ZONE_TOP: (1 - zoneByKey.caption.inset.bottom / 100 - zoneByKey.caption.inset.height / 100) * CANVAS_H,
    // Bottom edge of the caption-area safe zone.
    CAPTION_ZONE_BOTTOM: (1 - zoneByKey.caption.inset.bottom / 100) * CANVAS_H,
    // Width of the right icon-rail safe zone, mirrored on the left.
    HORIZONTAL_MARGIN: (zoneByKey.right.inset.width / 100) * CANVAS_W,
  };
})();
```

`safe-zone-geometry.js` must load after `ui-safe-zones.js` in `index.html` (it reads
`window.SAFE_ZONES` at load time via the IIFE above) — verify/update script tag order.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/js/ui-safe-zones.test.js`
Expected: PASS (2 tests) — confirming the derived values exactly match today's hardcoded
115.2 / 1401.6 / 1785.6 / 162.

- [ ] **Step 7: Migrate `index.html`**

```html
<!-- before -->
<div id="safe-zones" hidden>
  <div class="safe-zone safe-zone-top"><span>FOLLOWING / FOR YOU</span></div>
  <div class="safe-zone safe-zone-right"><span>LIKE &middot; COMMENT &middot; SAVE &middot; SHARE</span></div>
  <div class="safe-zone safe-zone-caption"><span>USERNAME / CAPTION / SOUND</span></div>
  <div class="safe-zone safe-zone-nav"><span>HOME / DISCOVER / INBOX / PROFILE</span></div>
</div>

<!-- after -->
<div id="safe-zones" hidden></div>
```

Add a call to `UI.safeZones(document.getElementById("safe-zones"))` in the same script block
where other one-time UI mounts happen (near `UI.toolbar(document.getElementById("toolbar"))` at
`static/editor.js:154`).

- [ ] **Step 8: Update `safe-zones.css`**

Remove the now-redundant `.safe-zone span` box-model rules migrated to `.chip`/`.chip--outlined`/
`.chip--safe-zone` in Batch 1 Task 3 (if any were left in place pending this batch — check first;
Task 3 may have already fully removed them, in which case this step is a no-op verification, not
a further edit). Keep `#safe-zones`, `.safe-zone` (position/background/flex layout), and the
4 `.safe-zone-{key}` positioning rules — `UI.safeZones` sets each band's inset via inline
`style.cssText` (Step 4 above) computed from `SAFE_ZONES`, so the CSS positioning rules
(`.safe-zone-top`, etc.) become redundant too. Remove them, keeping only the `border-*` accent
line per band (`.safe-zone-top { border-bottom: 2px solid var(--safe-zone); }` etc. — those stay
since they're not part of the geometry derivation, just a visual accent) scoped to
`.safe-zone-{key}` selectors that no longer also carry position/size.

- [ ] **Step 9: Verify**

```bash
grep -n "top: 0; left: 0; right: 0; height: 6%\|top: 40%; right: 0; width: 15%" static/css/components/safe-zones.css
```

Expected: no match — those percentages now live only in `ui-safe-zones.js`'s `SAFE_ZONES` array.

Open the app, toggle safe zones on, and visually compare all 4 bands against a screenshot taken
before this task — position, size, label text, and border accent must be pixel-identical (this
is a pure refactor, not a redesign). Then open the TEXT panel and confirm a newly-added text
block's default insert position still respects the safe zones (regression check for
`panel-text.js`'s consumption of `SafeZoneGeometry`).

- [ ] **Step 10: Commit**

```bash
git add static/ui-safe-zones.js static/safe-zone-geometry.js static/index.html static/editor.js static/css/components/safe-zones.css tests/js/ui-safe-zones.test.js
git commit -m "feat: add UI.safeZones component, derive safe-zone-geometry.js from one SAFE_ZONES array"
```

## Batch 4 Definition of Done

- [ ] `node --test "tests/js/**/*.test.js"` passes, including `ui-safe-zones.test.js`, and
  confirms the derived geometry constants exactly match the pre-refactor hardcoded values.
- [ ] Safe zones visually pixel-identical to before in the browser.
- [ ] `panel-text.js`/`panel-captions.js`'s default-position behavior unaffected (regression
  check passed).
- [ ] Master plan's batch table updated: Batch 4 → "done".
- [ ] Run the master plan's [final verification](2026-07-29-ui-component-consistency-master.md#verification-run-once-at-the-very-end-after-all-batches)
  (`node --test` + `pytest`) — the whole plan is now complete.
