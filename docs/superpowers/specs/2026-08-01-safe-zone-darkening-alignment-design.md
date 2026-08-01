# Safe-zone darkening + position-anchor alignment

Date: 2026-08-01

## Problem

The current safe-zone guide (`static/ui-safe-zones.js`, toggled via `#safe-zones-toggle`) shows 4
separately shaded/labeled bands (top nav, right icon rail, caption area, bottom nav) matching
TikTok's real UI chrome. It's useful as a reference but doesn't clearly show *one* combined "safe
to place things" area — the user has to mentally combine 3 of the 4 bands (top/right/caption) to
figure out where a text block or image overlay is guaranteed clear of TikTok's own UI.

Separately, the TEXT panel's POSITION anchor shortcuts (TOP/BTM/LEFT/RIGHT/MID buttons,
`static/style-section-position.js` + `panel-text.js`'s `anchorPositionX`/`anchorPositionY`) only
partly respect this margin today: LEFT/RIGHT already snap to the mirrored icon-rail margin, but
TOP/BTM snap to the raw canvas edges (0 / 1920), ignoring the top-nav and caption zones entirely.

## Goal

1. Replace the 4-band guide with a single darkened overlay: everything outside one "safe
   rectangle" is dimmed, so the safe area reads as one clear cutout instead of 4 separate bands.
2. The safe rectangle is context-aware: it's the wide, centered text/image area by default, but
   narrows to the existing (lower, right-margin-only) caption band while a caption is the active
   selection — matching how captions have always had their own, smaller safe area.
3. The TEXT panel's POSITION anchor shortcuts snap to this same safe rectangle's edges instead of
   the raw canvas edges.

## Non-goals

- No change to VIDEO BOX / IMAGE BOX / SHAPE panels — none of them have anchor-shortcut buttons
  today (only manual X/Y fields + Maximize/Minimize), so there's nothing to wire up. They still
  render behind the (default, text/image) guide like any other overlay.
- No change to export/ffmpeg rendering — this is a preview-only editing aid, same as today's guide.
- No change to the toggle mechanic (`#safe-zones-toggle`, `localStorage`-persisted visibility,
  `G` keyboard shortcut) — still shows/hides the whole `#safe-zones` overlay as one unit.
- No change to CAPTIONS' own default box position/sizing logic — only its anchor-shortcut snap
  target changes (and only in the sense of tightening it to match the pre-existing caption band
  exactly, since `anchorPositionX` already effectively used a mirrored margin for both panels).

## Geometry

Two safe rectangles, both **derived** from the existing `SAFE_ZONES` percentages in
`static/ui-safe-zones.js` (via `static/safe-zone-geometry.js`'s existing `TOP_ZONE_BOTTOM` /
`CAPTION_ZONE_TOP` / `CAPTION_ZONE_BOTTOM` / `HORIZONTAL_MARGIN` constants) — no new hardcoded
numbers.

- `TEXT_IMAGE_SAFE_RECT`: `{ left: HORIZONTAL_MARGIN, right: CANVAS_W - HORIZONTAL_MARGIN, top:
  TOP_ZONE_BOTTOM, bottom: CAPTION_ZONE_TOP }`. The right icon-rail's margin mirrored onto the
  left, spanning from just below the top-nav zone to just above the caption zone — "the marked
  area" from the reference screenshot. This is the default/active rect whenever the current
  selection isn't a caption.
- `CAPTION_SAFE_RECT`: `{ left: 0, right: CANVAS_W - HORIZONTAL_MARGIN, top: CAPTION_ZONE_TOP,
  bottom: CAPTION_ZONE_BOTTOM }`. Exactly today's existing caption band bounds, unchanged — active
  whenever a caption is the current selection.

Both added to `static/safe-zone-geometry.js` alongside the existing derived constants.

## Guide overlay rendering

`static/ui-safe-zones.js`'s `UI.safeZones(container)` is rewritten to render a darkening scrim
instead of 4 shaded/labeled bands:

- Four solid divs (top/bottom/left/right bars, percentage-positioned like today's bands) fill
  everything outside the active rect with a new `--safe-zone-scrim` color (a semi-transparent
  black, added to `tokens.css` — not theme-dependent, same as the tooltip tokens, since it overlays
  arbitrary video content rather than app chrome).
- A thin `--safe-zone`-colored border (the existing accent token, reused rather than introducing a
  new color) outlines the cutout on all 4 edges.
- The 4 old per-zone shaded bands, their accent-line CSS (`.safe-zone-top`/`-right`/`-caption`/
  `-nav`), and their label chips are removed. `SAFE_ZONES` itself stays (still the single source
  of truth for the underlying percentages that `safe-zone-geometry.js` derives from), but is no
  longer iterated to render individual bands.
- `UI.safeZones(container, kind)` takes a `kind` (`"text"` | `"caption"`, default `"text"`)
  selecting which rect to darken around.

**Context-awareness:** `static/editor.js`'s `renderTimeline()` — already called after every
selection change via `onTimelineSelect`/`openXPanel` (see `panel-nav.js`) — is extended to also
call the guide's render function with the current `selected`, computing `kind` as `"caption"` when
`selected.type` is `"caption"` (a caption group selected on the timeline) or `"captions"` (the
CAPTIONS panel opened via the nav rail with nothing specific selected yet), else `"text"`. No new
event wiring is needed since this hooks into the existing re-render path.

## Position-anchor tool changes

`panel-text.js`'s `anchorPositionX(value, boxWidth, align, kind)` and
`anchorPositionY(value, boxHeight, kind)` gain a `kind` parameter and use the matching safe
rect's bounds (`TEXT_IMAGE_SAFE_RECT` for `"text"`, `CAPTION_SAFE_RECT` for `"caption"`) instead
of the current mix of raw canvas edges (Y) and always-mirrored-margin (X):

- TOP → rect's `top`; BTM → `rect.bottom - boxHeight`; MID vertical → centered within
  `[rect.top, rect.bottom]`.
- LEFT → rect's `left`; RIGHT → `rect.right - boxWidth`; MID horizontal → centered within
  `[rect.left, rect.right]` (same edge-flush-vs-align-transform compensation as today).

`static/style-section-position.js` (shared by TEXT and CAPTIONS) passes `target.kind` through to
both functions. This is always-on — not gated by the safe-zone guide's visibility toggle — matching
how LEFT/RIGHT anchoring already ignores guide visibility today.

Net effect: TEXT's anchors now respect the top-nav/caption-zone vertical bounds it previously
ignored. CAPTIONS' anchors are functionally unchanged (already using an equivalent margin via the
undifferentiated old `anchorPositionX`); tightened to explicitly use `CAPTION_SAFE_RECT` for
clarity and to stop the two panels sharing one code path that happened to produce the right answer
for both by coincidence.

## Testing

- `tests/js/` (pure JS, `node --test`): a new test file covering `TEXT_IMAGE_SAFE_RECT`/
  `CAPTION_SAFE_RECT`'s derived values against known `SAFE_ZONES` inputs, and
  `anchorPositionX`/`anchorPositionY`'s per-`kind` output for each anchor value.
- No Python/backend changes — this is entirely a `static/*.js`+CSS preview-only feature.
- Manual verification in-browser: toggle the guide, select a text block vs. a caption, confirm the
  cutout switches; click each POSITION anchor button on a text block and confirm it lands on the
  new rect's edges (visually flush with the guide's cutout when the guide is on).
