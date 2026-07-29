# Captions marker highlight (parity with TEXT)

Date: 2026-07-25

## Problem

The original request was for a highlight background + border-radius behind both TEXT and CAPTIONS. TEXT got a whole-block marker highlight toggle (`static/text-panel-highlight.js`: ON/OFF + color + radius, background color always shown behind the text while on). CAPTIONS instead got a karaoke-timing-based "Background" mode (highlights only the currently-active word during playback) — a different feature that doesn't give captions the same always-on background TEXT has.

## Goal

Add the same always-on marker highlight to CAPTIONS: a settings row (ON/OFF + color + radius) that shows a background color behind all caption text, independent of the karaoke MODE (current word / progressive fill / background), which is unaffected by this change.

## Design

Reuses `TextPreset.highlight`/`highlight_color`/`highlight_border_radius` — already on the shared model (`app/models.py`), already commented as shared between TEXT and CAPTIONS, and already fully wired for TEXT (Task 4/`text-panel-highlight.js`). No new fields.

`static/caption-panel-highlight.js` gains a new settings-row + drill-down subpanel, structurally identical to `text-panel-highlight.js` (same `UI.settingsRow`/`UI.buttonGroup`/`UI.colorSwatch`/`UI.numberField` pattern), writing to the caption track's preset via the existing `ensureCaptionPreset(ensureCaptionTrack().preset_id)` (same accessor the rest of that file already uses). Placed above the existing MODE group in the same HIGHLIGHT body. `static/index.html` gains the matching row/subpanel markup, mirroring `#text-highlight-row`/`#panel-text-highlight`.

Rendering: `static/preview-captions.js`'s `renderCaptions()` sets the `.caption-block` container's own `background-color`/`border-radius` from `preset.highlight`/`highlight_color`/`highlight_border_radius` when `preset.highlight` is true (same idea as `preview-text.js`'s per-span background, but applied to the whole caption box container rather than per-word spans, since this is an always-on background behind all the text, not per-word). `app/ass_render.py`'s `render_caption_ass` gains a rounded-rect `Dialogue` (reusing `_rounded_rect_path`, same pattern as `_box_dialogue`) drawn behind the karaoke dialogue when `preset.highlight` is true, sized to the caption box's fixed width/height (already computed in `render_caption_ass` as `box_width`/`box_height`).

Note: `highlight_color`/`highlight_border_radius` are shared with whatever karaoke MODE is active (e.g. "Background" mode's per-word box). Turning both on simultaneously is a valid but visually redundant combination (same color used for both the always-on background and the active-word box) — no validation prevents this, consistent with how `highlight_color` was already shared between TEXT and CAPTIONS.

## Testing

`tests/test_ass_render.py`: a new test confirms `render_caption_ass` emits a background rect `Dialogue` when `preset.highlight` is true, sized to the caption box, using `preset.highlight_border_radius`; and confirms no such rect when `preset.highlight` is false (regression check against existing tests). No frontend test — thin UI/rendering, manually verified in browser per this project's convention.

## Out of scope

Per-selection (FormatRun) marker highlight for captions (captions have no per-word FormatRun concept — this is whole-track only, matching TEXT's whole-block-only scope). Any interaction/precedence rule between the always-on background and karaoke MODE beyond "both can render simultaneously, same color" — no attempt to auto-differentiate or warn.
