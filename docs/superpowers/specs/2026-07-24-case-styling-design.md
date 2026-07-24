# Case styling for TEXT blocks and CAPTIONS — design

Date: 2026-07-24
Status: approved (chat, 2026-07-24)

## Goal

A three-way case-style control — lowercase / UPPERCASE / As-typed (default) — on both the TEXT
panel's Design tab and the CAPTIONS panel's Design tab. The stored text is never mutated; only
rendering (stage preview) and export (ASS burn-in) apply the transform. Lucide icons:
`case-lower`, `case-upper`, `case-sensitive`.

## Data model

One new field on `TextPreset` (`app/models.py`):

```python
text_case: str = "none"   # "none" | "upper" | "lower"
```

Whole-preset only — no per-selection `FormatRun` override (same scope decision as Shadow).
The `"none"` default means every existing saved project and saved style preset behaves
unchanged with no migration. JS treats a missing/undefined value as `"none"`.

## Why not CSS `text-transform` alone

Uppercase glyphs are wider. Word-wrap and box-fit are driven by *measured* text on both sides
(`FontFit.canvasMeasurer` / `app/font_metrics.py`), and ASS has no text-transform concept at
all — the export must emit transformed characters. So the actual string is transformed at
every consumption point, keeping preview and export identical.

## Shared helpers (reused everywhere)

- `static/text-case.js` — `window.TextCase.apply(text, textCase)`: returns `text` unchanged
  for `"none"`/missing, else `toUpperCase()`/`toLowerCase()`. Pure, DOM-free.
- `app/text_case.py` — `apply_text_case(text, text_case)`: same contract via
  `str.upper()`/`str.lower()`.

Known accepted limitation: locale-independent upper/lower; exotic length-changing mappings
(e.g. `ß` → `SS`) could shift `FormatRun` offsets — irrelevant for the Danish/English content
this app targets, documented here rather than engineered around.

## Integration points

Transform-at-the-boundary: layout modules (`caption_layout.py` / `caption-layout.js`,
`font_metrics.py`, `FontFit`) stay untouched — callers hand them already-transformed text.

Frontend — display via CSS, measurement via transformed strings. The DOM text must stay
as-typed: on-stage editing (contentEditable) writes the div's text back to `block.heading`,
so rendering a transformed string would corrupt stored text the moment the user clicks into
the block. CSS `text-transform` displays the case change while the DOM keeps the raw string
(edit mode, selection offsets, and FormatRun offsets all stay correct); only *measurement*
paths get the transformed string, matching what CSS actually draws:
- `static/text-case.js` also exposes `TextCase.cssValue(textCase)` →
  `"uppercase" | "lowercase" | "none"`.
- `static/preview-text.js` — block div gets `style.textTransform = TextCase.cssValue(...)`;
  BOX FILL's `FontFit.fitFontSize` input is `TextCase.apply(block.heading, preset.text_case)`;
  `fitCache` key gains `preset.text_case`. Fixed-width wrap and fit-mode box sizing need no
  change — the browser lays out the transformed glyphs natively.
- `static/preview-captions.js` — caption block div gets the same `textTransform`; the measure
  function handed to `CaptionLayout.paginateWords` wraps the canvas measurer with
  `TextCase.apply`, so pagination agrees with the displayed glyph widths; memo key gains
  `preset.text_case`. Word objects are never touched (timing intact).

Backend (`app/ass_render.py`):
- Text blocks: at the top of the per-block render, when `p.text_case != "none"`, substitute a
  `b.model_copy(update={"heading": apply_text_case(...)})` so measurement, wrapping, tagging,
  and highlight dialogues all see the same transformed string.
- Captions: `render_caption_ass` transforms each `CaptionWord.text` (via `model_copy`) before
  `paginate_words`, so pagination and dialogue emission agree.

## UI

- New `static/text-panel-case.js` (`TextPanel.renderCase()`) and
  `static/caption-panel-case.js` (`CaptionPanel.renderCase()`): each renders a 3-option
  `UI.buttonGroup` (existing component, icon options — same pattern as
  `text-panel-align.js`) into a new container row in its Design tab
  (`#text-case-group` / `#caption-case-group` in `static/index.html`), writing
  `preset.text_case`, then `saveProject()` + preview re-render.
- Icons: Lucide `case-lower` (lowercase), `case-upper` (UPPERCASE), `case-sensitive`
  (As-typed), hand-inlined per the project convention.
- Orchestrators `panel-text.js` / `panel-captions.js` call the new `renderCase()` alongside
  the other Design-tab renderers.
- Saved styles: add `text_case` to `styleFieldsOf()` in both `text-panel-style.js` and
  `caption-panel-style.js` so saving/applying a style carries it.

## Testing

- Python: unit tests for `apply_text_case`; `test_ass_render.py` cases asserting a text block
  with `text_case="upper"` emits uppercased dialogue text (and lowercase respectively), that
  `"none"` output is byte-identical to before, and that caption dialogues uppercase — without
  mutating the input project.
- JS side is thin wiring (stated untested layer, per convention): verified live in the
  browser preview — toggle each case option on a TEXT block and on captions, confirm stage
  text changes and stored text (word editor / on-stage edit) stays as typed.
