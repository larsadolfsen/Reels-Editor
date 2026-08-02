# Fix: foggy export letters (shadow blur bleeding into glyph fill)

## Problem

Text blocks and captions with **Shadow ON and BLUR > 0** render with visibly soft/foggy
letters in the exported mp4, while the live editor preview shows crisp text. Reported via a
screenshot of a heading ("Hvad er et LANGVARIGT PRODUKT") where every letter has a hazy halo.

## Root cause

ASS/libass has no "blur the shadow only" primitive. `_shadow_tag()` in `app/ass_render.py`
places `\4c` (shadow color) `\4a` (shadow alpha) `\xshad`/`\yshad` (offset) and `\blur` (Gaussian
edge blur) in the *same* override block as the glyph's own fill (`\1c`) and outline (`\3c`,
`\bord`). libass's `\blur` softens the edges of the whole composited glyph — fill included, not
just the decorative shadow — so any preset with `shadow=True` and `shadow_blur > 0` blurs the
actual letters, not just their shadow.

The live preview doesn't reproduce this: `static/preview-text.js` renders the shadow via CSS
`text-shadow`, which blurs only the shadow layer, leaving the glyph fill/outline crisp. This
preview/export mismatch is why the bug wasn't visible until export.

Three call sites share `_shadow_tag()` and are all affected:
- `_block_dialogue` — TEXT block headings (whole-preset shadow)
- `_karaoke_dialogue` — captions in `progressive_fill` mode (whole-preset shadow)
- `_current_word_dialogues` — captions in `current_word` mode (per-active-word `spotlight_shadow`
  toggling, via the `shadow_on`/`shadow_off` inline tag pair)

## Fix

Render the shadow as a **separate ASS dialogue line**, drawn *before* (i.e. underneath, same
layer/timing, earlier in event order — ASS draws same-layer overlapping events in script order)
the main text line:

- **Shadow line**: same text body, with fill and outline forced fully transparent
  (`\1a&HFF&\3a&HFF&`) so only the shadow's offset, blurred back-copy (`\4c`/`\4a`/`\xshad`/
  `\yshad`/`\blur`) is visible.
- **Main line**: unchanged text/positioning/entrance effects, but with the shadow tags removed
  entirely — fill and outline render crisp, matching the preview.

This is the same "extra dialogue line drawn underneath" technique the file already uses for
`_box_dialogue` and `_highlight_dialogues`.

When `p.shadow` is `False` (or, for the current-word path, no active word has shadow toggled
on), no shadow line is emitted — output is unchanged from today for the no-shadow case.

## Changes

### `_block_dialogue` (and `render_ass`'s caller)

Returns a `list[str]` of 1 (no shadow) or 2 (shadow line + main line) dialogue strings instead
of a single string. `render_ass` changes `event_lines.append(_block_dialogue(...))` to
`event_lines.extend(_block_dialogue(...))`.

### `_karaoke_dialogue` (and `render_caption_ass`'s caller)

Same shape change: returns `list[str]`, caller uses `extend`.

### `_current_word_dialogues`

More involved: today, one dialogue line per active word contains inline color-cycling tags
(`\1c{highlight}...{\1c{normal}...` etc.) for the *whole page's* text, with `shadow_on`/
`shadow_off` swapping the shadow tags on the active word only. This becomes two dialogue lines
per active word:

- **Shadow-layer line**: same per-word segment structure and same active/inactive branching for
  `shadow_on`/`shadow_off`, but every segment's tag also carries `\1a&HFF&\3a&HFF&` (fill/outline
  hidden throughout) instead of the `\1c`/outline swapping — only the shadow tags vary between
  active and inactive words, so this line reuses the existing `shadow_on`/`shadow_off` tag
  strings basically unchanged, just wrapped with the alpha-hiding prefix and stripped of the
  `\1c`/outline_on/outline_off parts.
- **Main-layer line**: the existing color/outline-cycling logic (`\1c{highlight}{outline_on}` /
  `\1c{normal}{outline_off}`), with the `\4c`/`\4a`/`\xshad`/`\yshad`/`\blur` tags removed from
  both the on/off variants and from the line's own top-level `fx`.

If neither `p.shadow` nor `p.spotlight_shadow` is set, no shadow-layer line is emitted for that
active word (matches today's "no shadow tags at all" behavior).

## Tests

Existing tests in `tests/test_ass_render.py` that assert `\blur`/`\4c`/`\xshad` appear in the
*same* dialogue as the visible text body will be rewritten to assert:
- A shadow-only dialogue line precedes the main line, contains the blur/color/offset tags plus
  `\1a&HFF&\3a&HFF&`, and appears in the event list *before* the main text line.
- The main text line contains no `\4c`/`\4a`/`\xshad`/`\yshad`/`\blur` tags.
- `shadow=False` (and, for current-word, both shadow flags off) still produces exactly the same
  single-line output as before — no regression for the common no-shadow case.

Covers all three call sites (`test_block_dialogue_shadow_on_*`,
`test_karaoke_dialogue_shadow_on_*`, `test_current_word_dialogue_shadow_on_*` and their
`_off` counterparts).

## Out of scope

- No change to the preview (`preview-text.js`/`preview-captions.js`) — it already renders shadow
  correctly (blur isolated to the shadow layer); this fix brings export in line with it.
- No change to the Shadow UI controls, field ranges, or defaults.
- No change to non-shadow rendering (box background, highlight rects, per-run formatting).
