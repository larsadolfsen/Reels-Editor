# Collapsible MEDIA panel + selection-driven right panel

## Problem

The left MEDIA panel doesn't match the reference mockup: it has a manual path-text-input, and each clip row carries inline trim (in/out) fields and reorder (▲▼) buttons, making rows tall and busy. The right panel is permanently visible and only ever shows the TEXT OVERLAY STYLE controls.

## Design

**Left panel (`#panel`)** — matches the mockup:
- Header keeps "MEDIA" plus a new collapse icon button (top-right).
- `#panel-add` drops the manual path input; "+ IMPORT VIDEO" relies solely on the existing native file picker (`/api/pick-file`).
- Clip rows become display-only: thumbnail + name + duration (trimmed length, `mm:ss.s`). No inline trim fields or reorder buttons.
- Clicking a row selects that clip (highlight, like an existing `.timeline-block.selected`) and opens the right panel showing VIDEO controls for it.
- Collapse toggle sets `#panel.collapsed` → width 72px, hides row text and header title, showing only the import button (icon-only) and thumbnails, centered.
- Collapsed state persists in `localStorage` (`panelCollapsed`), consistent with existing `projectId`/`textPreset:<id>` persistence.

**Right panel (`#style-panel`)** — collapsible, selection-driven, no tabs:
- Closed by default (`hidden` attribute → `display:none`); Center reclaims the width since it's `flex:1` in the row.
- Contains three mutually-exclusive sections, each with its own existing header style, toggled via `hidden`:
  - `#panel-video` (new) — clip name, TRIM in/out fields (`UI.numberField`, reusing today's clamp logic), Set-in/Set-out buttons, and Move up/Move down (reorder) buttons acting on the selected clip.
  - `#panel-text` — today's existing TEXT OVERLAY STYLE content, unchanged.
  - `#panel-captions` — today's existing captions placeholder/preview, unchanged.
- A single close (×) button (top-right of `#style-panel`) hides the panel and clears `selected`.
- Selecting a clip (left panel row or a VIDEO timeline block), the text block (TEXT timeline block or heading input focus), or a caption group (CAPTIONS timeline block) opens the panel to the matching section — this replaces today's scroll-into-view behavior in `onTimelineSelect`.
- Deselecting only happens via the × button — clicking elsewhere does not auto-close (avoids accidental data loss mid-edit).

## Files touched

- `static/index.html` — left panel header/collapse button, drop `#clip-path` input, restructure clip rows (rendered by JS, markup unaffected beyond removing the input); wrap right panel sections in `#panel-video`/`#panel-text`/`#panel-captions` + close button.
- `static/css/components/panel.css` — `.collapsed` state, clip row click/selected styling, drop trim-field/reorder styles (moved to style-panel.css).
- `static/css/components/style-panel.css` — `#style-panel[hidden]`, close button, `#panel-video` trim/reorder styles (reuses `.style-group`/`.style-field`/`.style-row` patterns already defined).
- `static/editor.js` — `renderClipList()` simplified (display-only + click-to-select), new `selectClip()`/`showPanel(type)`/`closePanel()`, `onTimelineSelect()` rewired to call `showPanel` instead of scrolling, `addClip()` simplified (no path input fallback), collapse-toggle wiring + persistence.

## Out of scope

- No change to trim/reorder logic itself (`clampTrim`, `moveClip`) — only where its controls live.
- Captions editing stays a placeholder ("COMING IN A LATER TASK"); only its container moves into `#panel-captions`.
- No tabs — panel switching is selection-driven only, per explicit decision.

## Verification

Visual: run the dev server — confirm right panel starts closed and Center fills the space; clicking a clip row opens VIDEO trim/reorder controls and highlights the row; clicking the text heading area / a TEXT timeline block opens the TEXT panel; clicking a CAPTIONS timeline block opens the captions panel; × closes the panel back to the closed/Center-fills state; collapsing the left panel to 72px shows only thumbnails + icon-only import button and survives a page reload.
