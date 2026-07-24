# Default insert positions for text blocks and captions

2026-07-24

## Problem

New text blocks and new caption tracks currently default to hardcoded `x`/`y`
pixel positions on the 1080×1920 export canvas (`static/panel-text.js`'s
`defaultTextPreset`: `x: 540, y: 700`; `static/panel-captions.js`'s
`defaultCaptionPreset`: `x: 540, y: 1520`) that were picked by eyeballing, with
no relationship to the safe-zone guide bands (`static/css/components/safe-zones.css`)
that mark TikTok's real UI chrome (top nav, right icon rail, caption area,
bottom nav).

Desired defaults:
- A new **text block** should default to top-centered, flush just below the
  top-nav safe-zone line.
- A new **caption track** should default flush at the top of the caption-area
  safe zone.
- Separately: the horizontal anchor-grid LEFT/RIGHT buttons (shared by both
  panels' POSITION controls) flush boxes all the way to the canvas edge with
  no margin, even though the right edge is visually crowded by the icon-rail
  safe zone. The left edge should reserve the same margin, even though there's
  no dedicated left safe-zone CSS band.

## Approach

### Safe-zone geometry as pixel constants

`static/css/components/safe-zones.css` already defines the zone boundaries as
percentages of the stage. Add a small pure-constants module,
`static/safe-zone-geometry.js`, mirroring those percentages as pixel values on
the 1080×1920 canvas — the same "small pure geometry module" pattern already
used for `filmstrip-layout.js` and `timeline-snap.js`. This is the single
source of truth both default functions and the anchor-grid math read from,
instead of each hardcoding the percentages separately.

```js
window.SafeZoneGeometry = {
  CANVAS_W: 1080,
  CANVAS_H: 1920,
  TOP_ZONE_BOTTOM: 115.2,       // 6% of 1920 — bottom edge of the top-nav safe zone
  CAPTION_ZONE_TOP: 1401.6,     // 73% of 1920 — top edge of the caption-area safe zone
  CAPTION_ZONE_BOTTOM: 1785.6,  // 93% of 1920 — bottom edge of the caption-area safe zone
  HORIZONTAL_MARGIN: 162,       // 15% of 1080 — width of the right icon-rail safe zone, mirrored on the left
};
```

These numbers must stay in sync with `safe-zones.css`'s percentages by hand
(no build step exists in this project to generate one from the other) — same
as `filmstrip-layout.js`'s existing relationship to `app/filmstrip.py`.

### Default `y` for new text blocks

`defaultTextPreset(id)` in `static/panel-text.js`: `y: 700` becomes
`y: Math.round(SafeZoneGeometry.TOP_ZONE_BOTTOM)` (115) — the box's top edge
sits flush against the top-nav zone's bottom edge, i.e. immediately below the
line. `x: 540, align: "center"` is unchanged (already horizontally centered on
the full canvas).

### Default `y` for new caption tracks

`defaultCaptionPreset(id)` in `static/panel-captions.js`: `y: 1520` becomes
`y: Math.round(SafeZoneGeometry.CAPTION_ZONE_TOP)` (1402) — the box's top edge
sits flush against the top of the caption-area zone. `x: 540, align: "center"`
is unchanged.

Both `y` values are the box's literal top-left pixel — there is no
vertical-centering transform in this codebase (only horizontal, via
`.text-block--align-*`'s `translate(-50%, 0)` etc., see
`static/css/components/stage.css`). "Flush against a zone edge" is therefore
exact and doesn't depend on the box's rendered height, unlike a true vertical
center would.

### Horizontal margin for the LEFT/RIGHT anchor buttons

`anchorPositionX(value, boxWidth, align)` in `static/panel-text.js` (shared by
`text-panel-position.js` and `caption-panel-box.js`'s POSITION button grids)
currently computes:

```js
if (value === "left") visualLeft = 0;
else if (value === "right") visualLeft = Math.max(0, 1080 - w);
else visualLeft = Math.max(0, (1080 - w) / 2);
```

Change to read from `SafeZoneGeometry`:

```js
const margin = SafeZoneGeometry.HORIZONTAL_MARGIN;
if (value === "left") visualLeft = margin;
else if (value === "right") visualLeft = Math.max(margin, SafeZoneGeometry.CANVAS_W - margin - w);
else visualLeft = Math.max(0, (SafeZoneGeometry.CANVAS_W - w) / 2);
```

`mid` is unchanged in effect (still resolves to a box centered on the full
1080 width — symmetric either way). This is a behavior change to an existing,
already-shipped control (not just new-item defaults), scoped narrowly to the
`left`/`right` cases.

### Script loading

Add `<script src="/static/safe-zone-geometry.js"></script>` to
`static/index.html`, immediately before `panel-text.js`'s script tag, so both
consumers (`panel-text.js`, `panel-captions.js`) have it available.

## Out of scope

- No visible new CSS safe-zone band is added — `HORIZONTAL_MARGIN` is an
  internal number used only for default/anchor math, not rendered as a guide.
- No migration of already-saved projects' `x`/`y` values — this only changes
  what a *newly created* text block or caption track starts at.
- The existing `MID` vertical anchor button (full-canvas-center, using actual
  rendered box height) is untouched; the two new zone-relative `y` defaults
  are separate hardcoded constants, not routed through `anchorPositionY`.

## Testing

No JS test framework exists in this repo (pytest covers the Python backend
only). Verification is manual: create a new text block and a new caption
track in a throwaway project, toggle the safe-zone overlay
(`#safe-zones-toggle`), and confirm both sit flush against their respective
zone lines; click the LEFT/RIGHT position-grid buttons on both panels and
confirm the new 162px margin.
