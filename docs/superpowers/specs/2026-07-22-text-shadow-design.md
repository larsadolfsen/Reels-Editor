# Text shadow — design

Date: 2026-07-22

## Goal

Add a drop-shadow style option for text, usable on both TEXT-panel headings (text blocks) and CAPTIONS, matching the existing Outline control's UX and rendering pattern end-to-end (live preview + ASS export).

## Scope

- Applies to `TextPreset`, so both text blocks and caption tracks get it (they already share `TextPreset`).
- Whole-preset setting only — no per-character-range (`FormatRun`) override, unlike `outline_color`/`outline_px`. Shadow is a uniform stylistic choice; adding per-run scope would bloat the rich-text formatting UI for no proven need.
- Controls: on/off toggle, shadow color, offset X (px), offset Y (px), blur (px).

## Data model

`app/models.py`, `TextPreset` gains 5 fields, added directly after the existing `outline_px` field:

```python
shadow: bool = False
shadow_color: str = "#000000"
shadow_offset_x: int = 4   # px on the 1080x1920 canvas; UI clamps -40..40
shadow_offset_y: int = 4   # px; UI clamps -40..40
shadow_blur: int = 0       # px; UI clamps 0..40
```

Defaults (`shadow=False`) mean existing saved projects render unchanged — no migration needed, Pydantic fills in defaults on load.

## UI

New "Shadow" row added to the Design tab, directly below the existing Outline row, in both places outline lives today:

- `static/text-panel-font-style.js` (+ its markup in `static/index.html`'s `#text-font-body`)
- `static/caption-panel-font-style.js` (+ its markup in the caption Design body)

Row shape, mirroring the Italic/Underline toggle-button pattern already in both files:

- A "Shadow" icon-button toggle (`aria-pressed`, same wiring style as `wireTextStyleToggle`/`wireToggle`'s italic/underline).
- `UI.colorSwatch` for `shadow_color`.
- Three `UI.numberField`s: OFFSET X (-40..40), OFFSET Y (-40..40), BLUR (0..40).

The three fields are hidden (via the existing `hidden` attribute convention, same as the BOX panel's width/height fields) when `shadow` is off, shown when on. Toggling the button sets `preset.shadow` and re-renders the panel section so the fields appear/disappear immediately.

## Live preview

`static/preview-text.js` and `static/preview-captions.js`: when `preset.shadow` is true, set CSS `text-shadow` on the block/caption `<div>` (not per-run `<span>`, since this is a whole-preset setting):

```js
div.style.textShadow = preset.shadow
  ? `${scale(preset.shadow_offset_x)}px ${scale(preset.shadow_offset_y)}px ${scale(preset.shadow_blur)}px ${preset.shadow_color}`
  : "none";
```

where `scale(px) = px / 1920 * stageH`, the same canvas-to-stage scaling already used for `outline_px`. CSS `text-shadow` is inherited, so setting it on the parent div covers the rich-text `<span>` runs in `preview-text.js` without touching per-span code.

## Export (ASS)

`app/ass_render.py`: ASS's `[V4+ Styles]` line has a single uniform `Shadow` distance field and a `BackColour` field — not enough for independent X/Y offset. Instead, use ASS override tags (supported by libass) prepended to each dialogue line's `fx` string when `preset.shadow` is true:

```
\4c<shadow_color, ass-encoded>\4a00\xshad<offset_x>\yshad<offset_y>\blur<blur>
```

- `\4c`/`\4a` set the shadow (back) color/alpha (opaque, `00`).
- `\xshad`/`\yshad` set independent shadow offsets, overriding the style line's uniform `Shadow` distance (which stays `0` in the style line, unchanged).
- `\blur` softens edges. Note: ASS's `\blur` blurs both outline and shadow edges together — there's no shadow-only blur primitive in ASS. Accepted limitation; not a concern given the scope decided (this is the closest native match to "blur/softness").

When `preset.shadow` is false, no shadow tags are emitted — byte-identical to today's output.

Touches:
- `_block_dialogue` (text blocks)
- `_karaoke_dialogue` and `_current_word_dialogues` (captions)

## Testing

- `tests/test_models.py`: `TextPreset` defaults include `shadow=False` and the new fields; a preset with `shadow=True` round-trips through JSON correctly.
- `tests/test_ass_render.py`: shadow override tags appear in the block/caption dialogue text when `shadow=True` with the right values; absent (dialogue text unchanged from today's baseline) when `shadow=False`.

No changes needed to `app/ffmpeg_cmd.py`, `app/font_metrics.py`, or the export route — shadow is purely an ASS-text-tag concern, doesn't affect box sizing/wrapping.
