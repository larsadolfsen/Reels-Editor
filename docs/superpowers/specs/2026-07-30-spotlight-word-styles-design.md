# Spotlight per-word style overrides — design

Date: 2026-07-30

## Problem

The CAPTIONS panel's Spotlight subpage (per-word karaoke highlight) currently only exposes a Mode
group (Current word / Progressive fill / Background) plus one shared color+radius pair
(`highlight_color`/`highlight_border_radius`, reused from the box-level Highlight feature). The
user wants the spotlighted/active word to carry its own independent styling — Color, Outline,
Shadow, and a background Highlight — separate from the base caption preset's own Color/Outline/
Shadow/Highlight, which style the caption text as a whole.

## Scope

CAPTIONS only. TEXT has no per-word karaoke concept and is unaffected.

## Data model (`app/models.py`, `TextPreset`)

New fields, all defaulted so existing saved projects load unchanged:

```
spotlight_color: str = "#FFD400"

spotlight_outline: bool = False
spotlight_outline_color: str = "#000000"
spotlight_outline_px: int = 4

spotlight_shadow: bool = False
spotlight_shadow_color: str = "#000000"
spotlight_shadow_offset_x: int = 4
spotlight_shadow_offset_y: int = 4
spotlight_shadow_blur: int = 0

spotlight_highlight: bool = False
spotlight_highlight_color: str = "#FFD400"
spotlight_highlight_border_radius: int = 4
```

`highlight_mode` values change from `current_word | progressive_fill | background` to
`off | current_word | progressive_fill`. "Background" is removed as a selectable mode — its old
rect-behind-the-active-word behavior becomes the `spotlight_highlight` toggle instead, which now
works with either remaining mode (previously it only worked as its own exclusive mode).

**Migration:** existing saved captions with `highlight_mode == "background"` self-heal on load, in
`ensureCaptionPreset()` (`static/panel-captions.js`, the same function that already self-heals
fixed-size caption boxes): rewrite to `highlight_mode = "current_word"`, `spotlight_highlight =
true`, `spotlight_highlight_color = <old highlight_color>`. `highlight_color`/
`highlight_border_radius` themselves are untouched — they remain the box-level marker-highlight
fields (`preset.highlight`, `_caption_highlight_dialogues`), a separate feature.

## Mode semantics

- **Off** — no per-word effect at all. Caption renders in the base preset style uniformly (today's
  plain-karaoke fallback path, `_karaoke_dialogue` with no color swap). The four style rows
  (Color/Outline/Shadow/Highlight) are hidden entirely.
- **Current word** — the active word swaps to `spotlight_color`; if `spotlight_outline`/
  `spotlight_shadow`/`spotlight_highlight` are on, those also apply to just that word. All four
  rows are shown.
- **Progressive fill** — words already spoken render in `spotlight_color` via ASS's native `\k`
  karaoke sweep (word-by-word swap isn't how this mode works — it's a continuous fill). **Outline
  and Shadow rows are hidden in this mode**: ASS's `\k` sweep can't carry a per-word outline/shadow
  toggle the way it carries color, so those two controls would have no effect here. Color and
  Highlight rows remain visible and functional (Highlight draws a rounded rect behind the currently
  active word, same mechanism regardless of mode).

## Frontend

`static/style-section-spotlight.js` becomes a composer:
- Mode group: Off / Current word / Progressive fill (three buttons, replacing the old three that
  included Background).
- A **nested `StylePanelHost`**, scoped to the Spotlight subpage's own body — the same generic
  component (`static/style-panel-host.js`) already used for the top-level Design tab, instantiated
  again with `bodyEl` as its `mainEl` and a sibling container (appended to the Spotlight page's own
  `el`, alongside `bodyEl`) as its `drillEl`. This gives Color/Outline/Shadow/Highlight their own
  chevron rows that drill one level deeper, matching the reference screenshot, without changing
  `StylePanelHost` itself.

Four new files, each mirroring the shape of its shared-section counterpart exactly (settings row +
drill-down subpage built from `UI.settingsRow`/`UI.colorSwatch`/`UI.numberField`/`UI.buttonGroup`),
but writing `spotlight_*` fields via `target.setPresetField` only (whole-preset — captions have no
per-range `FormatRun`, so there is no `setField`/`getFieldValue` split here unlike the base Color/
Outline/Shadow sections):

- `static/spotlight-section-color.js` — mirrors `style-section-color.js`. Always visible when mode
  != off.
- `static/spotlight-section-outline.js` — mirrors `style-section-outline.js`. Visible only in
  Current word mode.
- `static/spotlight-section-shadow.js` — mirrors `style-section-shadow.js`. Visible only in
  Current word mode.
- `static/spotlight-section-highlight.js` — mirrors `style-section-highlight.js` (on/off + color +
  radius). Visible in both Current word and Progressive fill.

`style-section-spotlight.js` re-renders which of these four are shown whenever the mode changes
(same `syncFields()`-style visibility toggle the file already uses for the old Radius field).

## Preview (`static/preview-captions.js`)

The active word's `<span>` styling, currently driven by `highlight_color`/`highlight_mode`, is
reworked:
- Text color: `spotlight_color` (current_word swap; progressive_fill's already-spoken words).
- Outline (current_word only): CSS `-webkit-text-stroke` (or the same technique the base per-word
  span already uses for the block/caption text outline, for visual consistency) using
  `spotlight_outline_color`/`spotlight_outline_px` when `spotlight_outline` is on.
- Shadow (current_word only): CSS `text-shadow` using `spotlight_shadow_color`/offsets/blur when
  `spotlight_shadow` is on.
- Highlight (current_word + progressive_fill): background-color + border-radius + padding on the
  active word's wrapper, using `spotlight_highlight_color`/`spotlight_highlight_border_radius` when
  `spotlight_highlight` is on — replacing today's `highlight_mode === "background"` branch, which
  is deleted.

## Export (`app/ass_render.py`)

- `_caption_style`: progressive-fill's `\k`-sweep primary color switches from `p.highlight_color`
  to `p.spotlight_color`.
- `_current_word_dialogues`: gains optional inline ASS override + revert around the active word's
  text segment, same technique already used for its `\1c` color swap —
  - Outline: `\3c{spotlight_outline_color}\bord{spotlight_outline_px}` ... revert to
    `\3c{p.outline_color}\bord{p.outline_px}` after the word, when `spotlight_outline` is on.
  - Shadow: `\4c{spotlight_shadow_color}\4a00\xshad{...}\yshad{...}\blur{...}` ... revert to the
    base `_shadow_tag(p)` equivalent after the word, when `spotlight_shadow` is on.
- The per-word rounded-rect drawing currently in `_background_word_dialogues` (only reachable via
  the old "background" mode) is generalized into a shared helper, called whenever
  `spotlight_highlight` is on — from `_current_word_dialogues` (per active word) and from a new
  small per-word-rect pass alongside `_karaoke_dialogue` (progressive_fill), reusing the existing
  `_line_word_offsets`/`_line_left_origin`/`_rounded_rect_path` helpers. `render_caption_ass`'s
  dispatch drops the `elif highlight_mode == "background"` branch entirely.

## Testing

- `app/models.py`: new fields default correctly; old `"background"` value is still a valid stored
  string (Pydantic doesn't reject it — the JS self-heal handles the value, Python just needs to not
  crash if it somehow still sees it, treating anything other than `"current_word"`/
  `"progressive_fill"` as `"off"` for its own dispatch, since Python never migrates data itself).
- `tests/test_ass_render.py`: extend for spotlight outline/shadow/highlight tag output in
  current_word mode, spotlight_color in progressive_fill's style line, highlight rect present in
  progressive_fill when `spotlight_highlight` is on, absent when mode is `off`.
- `tests/js/`: no existing JS test touches captions styling directly (these are DOM-dependent UI
  files) — covered by manual verification in the browser preview, per the project's stated
  UI-testing gap pattern (thin wiring, logic lives in the tested Python mirror).
