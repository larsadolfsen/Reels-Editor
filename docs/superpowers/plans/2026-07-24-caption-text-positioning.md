# Caption/Text Default Insert Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New text blocks default to top-centered, flush just below the top-nav safe-zone line; new caption tracks default flush at the top of the caption-area safe zone; the position anchor grid's LEFT/RIGHT buttons reserve the same horizontal margin on the left that the right icon-rail safe zone already crowds on the right.

**Architecture:** A new pure-constants module, `static/safe-zone-geometry.js`, mirrors `safe-zones.css`'s zone percentages as pixel values on the 1080×1920 canvas — the single source of truth both default-preset functions and the anchor-grid math read from. `defaultTextPreset`/`defaultCaptionPreset` (in `panel-text.js`/`panel-captions.js`) read zone-edge constants for their `y` default. `anchorPositionX` (in `panel-text.js`, shared by both panels' POSITION button grids) reads a horizontal-margin constant for its `left`/`right` cases.

**Tech Stack:** Vanilla JS (existing stack — no new dependencies, no build step).

## Global Constraints
- No visible new CSS safe-zone band — the horizontal margin constant is used only for default/anchor math, never rendered as a guide.
- No migration of already-saved projects — only newly created text blocks/caption tracks get the new defaults.
- No JS test framework exists in this repo (pytest covers the Python backend only) — verification is manual, via the live preview.
- `SafeZoneGeometry` pixel values must mirror `static/css/components/safe-zones.css`'s percentages exactly: `TOP_ZONE_BOTTOM` = 6% of 1920 = 115.2; `CAPTION_ZONE_TOP` = 73% of 1920 = 1401.6; `CAPTION_ZONE_BOTTOM` = 93% of 1920 = 1785.6; `HORIZONTAL_MARGIN` = 15% of 1080 = 162.

---

### Task 1: Safe-zone geometry module + zone-relative defaults

**Files:**
- Create: `static/safe-zone-geometry.js`
- Modify: `static/index.html` (script tag list, before `panel-text.js` at static/index.html:842)
- Modify: `static/panel-text.js` (`defaultTextPreset`, static/panel-text.js:34-45)
- Modify: `static/panel-captions.js` (`defaultCaptionPreset`, static/panel-captions.js:7-18)

**Interfaces:**
- Produces: `window.SafeZoneGeometry` — plain object with numeric properties `CANVAS_W`, `CANVAS_H`, `TOP_ZONE_BOTTOM`, `CAPTION_ZONE_TOP`, `CAPTION_ZONE_BOTTOM`, `HORIZONTAL_MARGIN`. Task 2 depends on `CANVAS_W` and `HORIZONTAL_MARGIN`.

- [ ] **Step 1: Write `static/safe-zone-geometry.js`**

Create the file:
```javascript
// Pixel-space mirror of static/css/components/safe-zones.css's zone percentages, on the
// 1080x1920 export canvas. Single source of truth for default text/caption insert positions
// (panel-text.js, panel-captions.js) and the position anchor grid's horizontal margin
// (panel-text.js's anchorPositionX). Kept in sync with safe-zones.css by hand — no build step
// generates one from the other.
window.SafeZoneGeometry = {
  CANVAS_W: 1080,
  CANVAS_H: 1920,
  TOP_ZONE_BOTTOM: 115.2,       // 6% of 1920 - bottom edge of the top-nav safe zone
  CAPTION_ZONE_TOP: 1401.6,     // 73% of 1920 - top edge of the caption-area safe zone
  CAPTION_ZONE_BOTTOM: 1785.6,  // 93% of 1920 - bottom edge of the caption-area safe zone
  HORIZONTAL_MARGIN: 162,       // 15% of 1080 - width of the right icon-rail safe zone, mirrored on the left
};
```

- [ ] **Step 2: Load the module in `index.html`**

Edit `static/index.html`. Find this line (currently static/index.html:842, may have shifted slightly — search for it):
```html
<script src="/static/panel-text.js"></script>
```
Insert a new line immediately before it:
```html
<script src="/static/safe-zone-geometry.js"></script>
<script src="/static/panel-text.js"></script>
```

- [ ] **Step 3: Update `defaultTextPreset`'s default `y`**

Edit `static/panel-text.js`. Find (static/panel-text.js:43):
```javascript
    align: "center", x: 540, y: 700, entrance: "fade_pop",
```
Replace with:
```javascript
    align: "center", x: 540, y: Math.round(SafeZoneGeometry.TOP_ZONE_BOTTOM), entrance: "fade_pop",
```

- [ ] **Step 4: Update `defaultCaptionPreset`'s default `y`**

Edit `static/panel-captions.js`. Find (static/panel-captions.js:15):
```javascript
    align: "center", x: 540, y: 1520, entrance: "none",
```
Replace with:
```javascript
    align: "center", x: 540, y: Math.round(SafeZoneGeometry.CAPTION_ZONE_TOP), entrance: "none",
```

- [ ] **Step 5: Manual verification (no automated test — pure default-value change, per spec's testing section)**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`.

Use a throwaway project (never a real one — the app's unload handler autosaves in-memory state to disk).

Check in browser:
- Open the browser devtools console and confirm no script errors on page load (check the Network tab too: `safe-zone-geometry.js` returns 200, not 404).
- Toggle the SAFE ZONES overlay on (timeline toolbar shield icon).
- Click the TEXT icon-rail entry (or the TEXT row's `+` button on the timeline) to add a new text block. Confirm it appears flush just below the top-nav safe-zone line, horizontally centered.
- Open the CAPTIONS panel and trigger caption-track creation (e.g. open the CAPTIONS section for a project with no caption track yet, or run auto-caption). Confirm the caption preset's default position is flush at the top of the caption-area safe zone, horizontally centered. (If no words exist yet the caption block may not render on stage — instead confirm via the CAPTIONS panel's Box tab VERTICAL field, which should read `1402`.)
- Confirm the TEXT panel's Box tab VERTICAL field for the new text block reads `115`.

- [ ] **Step 6: Commit**

```bash
git add static/safe-zone-geometry.js static/index.html static/panel-text.js static/panel-captions.js
git commit -m "feat: default new text blocks/caption tracks to safe-zone-relative positions"
```

---

### Task 2: Horizontal margin for the LEFT/RIGHT position anchor buttons

**Files:**
- Modify: `static/panel-text.js` (`anchorPositionX`, static/panel-text.js:14-25)

**Interfaces:**
- Consumes: `window.SafeZoneGeometry.CANVAS_W`, `window.SafeZoneGeometry.HORIZONTAL_MARGIN` (from Task 1).

- [ ] **Step 1: Update `anchorPositionX`**

Edit `static/panel-text.js`. Find (static/panel-text.js:14-25):
```javascript
function anchorPositionX(value, boxWidth, align) {
  // The box's rendered left edge is offset from `x` by a CSS transform keyed on text align
  // (stage.css's .text-block--align-*: 0 for left, -50% for center, -100% for right), so the
  // same edge-flush x must be shifted by that same fraction of the box width to compensate.
  const w = boxWidth || 0;
  const offsetFactor = align === "center" ? 0.5 : align === "right" ? 1 : 0;
  let visualLeft;
  if (value === "left") visualLeft = 0;
  else if (value === "right") visualLeft = Math.max(0, 1080 - w);
  else visualLeft = Math.max(0, (1080 - w) / 2);
  return visualLeft + offsetFactor * w;
}
```
Replace with:
```javascript
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
```

- [ ] **Step 2: Manual verification (no automated test — pure UI math change, per spec's testing section)**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000` (reuse the running server from Task 1 if still up — just hard-reload the page to pick up the edited `panel-text.js`, since the browser preview caches static JS).

Use a throwaway project.

Check in browser:
- Select an existing text block (or add a new one), open its Box tab, and click the POSITION grid's LEFT button. Confirm the HORIZONTAL field updates to `162` (for a zero-width/unrendered box) or `162 + width/2` for a centered box with known rendered width — in either case the box's visual left edge should sit noticeably inset from the canvas's left edge, not flush at 0.
- Click RIGHT. Confirm the box's visual right edge sits inset from the canvas's right edge by the same margin the box's left edge showed under LEFT (mirrored).
- Click MID (unaffected by this change). Confirm the box is still horizontally centered.
- Repeat LEFT/RIGHT/MID on the CAPTIONS panel's Box tab POSITION grid (same shared `anchorPositionX` function) and confirm the same margin behavior.

- [ ] **Step 3: Commit**

```bash
git add static/panel-text.js
git commit -m "fix: mirror the right icon-rail zone's margin on the position grid's LEFT anchor"
```

- [ ] **Step 4: Run `superpowers:finishing-a-development-branch`** to decide merge/PR/cleanup for the branch.
