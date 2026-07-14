# Word-style TEXT panel toolbar

Redesign the TEXT context panel (`#panel-text`) so the heading is edited in a
multiline field with a Word-like formatting toolbar underneath, instead of a
single-line input plus a bare SIZE slider.

## Scope

TEXT panel only. CAPTIONS stays the disabled placeholder — it models timed
`CaptionWord`s, not free text, and gets its own editor in a later task.

Formatting is whole-block (applies to the entire heading), not per-character
rich text — matches the existing `TextPreset` model, which is one style per
`TextBlockLayer`.

## Data model (`app/models.py`)

`TextPreset` gains three fields:

```python
bold: bool = False
italic: bool = False
underline: bool = False
```

`font: str` already exists; default changes from `"Arial"` (not vendored) to
`"Public Sans"`. The UI constrains it to the two vendored families:
`"JetBrains Mono"` and `"Public Sans"` (matches `@font-face` names in
`static/css/tokens.css`).

No highlight/highlight-color field — considered and dropped; BOX/`box_color`
already covers block background color.

`TextBlockLayer.heading` stays a plain `str`. Multiline is literal `\n`
characters in the string — no schema change, just UI/render support.

## UI layout (`static/index.html`, `static/css/components/style-panel.css`)

Replace `#text-heading` (`<input>`) with a `<textarea id="text-heading">` —
fixed height (not resizable), placed where the input is now.

Below it, a two-row toolbar replaces the current SIZE slider:

- Row 1: font family `<select>` (2 options), font size number field, grow
  (+) / shrink (–) buttons adjusting the same size field.
- Row 2: Bold / Italic / Underline toggle buttons (`.icon-btn`, `aria-pressed`
  reflecting state), then the existing font color swatch.

Everything below (outline color, outline px, box checkbox/color, TEXT ALIGN,
POSITION) is unchanged.

## Rendering

**Preview** (`static/preview.js`, `renderText`): `.text-block` gets
`white-space: pre-wrap` so `\n` renders as real line breaks, plus
`font-family`, `font-weight`, `font-style`, `text-decoration` set from
`preset.font` / `bold` / `italic` / `underline`.

**Export** (`app/ass_render.py`):
- `_style()`: Bold/Italic/Underline/StrikeOut fields use
  `preset.bold`/`italic`/`underline` (`-1`/`0`) instead of the hardcoded
  `-1,0,0,0`. StrikeOut stays `0` (no strikethrough feature).
- `_block_dialogue()`: replace `\n` with `\N` (ASS hard line break) in
  `b.heading` before emitting.

## Testing

- `tests/test_models.py`: new `TextPreset` fields default correctly, round-trip
  through JSON.
- `tests/test_ass_render.py`: style line reflects bold/italic/underline flags;
  `\n` in heading becomes `\N` in the dialogue line.
- Manual: verify in browser — type multiline heading, toggle B/I/U, change
  font family/size, confirm preview overlay updates live.
