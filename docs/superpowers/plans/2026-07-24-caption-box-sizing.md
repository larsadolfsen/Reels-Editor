# Caption box sizing (auto word-wrap/pagination) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CAPTIONS panel's FIT/FREE/FILL box-size toggle and manual "MAX WORDS PER LINE" number with a fixed WIDTH/HEIGHT box whose word-wrap and line-pagination are computed automatically from that box size and the caption's font.

**Architecture:** A new pure greedy wrap+paginate algorithm (`app/caption_layout.py` mirrored by `static/caption-layout.js`) packs words onto lines by measured pixel width, then paginates lines by box height — replacing `app/ass_render.py`'s flat `group_words`/`Timeline.groupWords` chunking wherever captions actually render (stage preview + ASS export). The CAPTIONS Box tab drops its mode toggle entirely; the box is always fixed-size.

**Tech Stack:** Existing stack only — Pydantic models, pytest, vanilla JS + Pillow-based font measurement (`app/font_metrics.py`'s `pil_font_measurer`) and canvas measurement (`static/font-fit.js`'s `canvasMeasurer`), no new dependencies.

## Global Constraints

- Caption box default size: `900` × `350` px on the 1080×1920 canvas (matches the existing caption safe-zone band).
- Box padding subtracted before wrap/paginate: `0.35em` horizontal, `0.15em` vertical (each doubled for both sides), matching `app/ass_render.py`'s existing `BOX_PAD_X_EM`/`BOX_PAD_Y_EM` constants used for TEXT block box sizing.
- Line height for pagination: `1.15` (matches `app/ass_render.py`'s existing `LINE_HEIGHT` constant and `static/css/components/stage.css`'s `.text-block`/`line-height`).
- No character-level word splitting — an oversized single word still gets its own line and is allowed to overflow.
- TEXT block box sizing (FIT/FREE/FILL, BOX FILL font auto-sizing) is unchanged — this plan touches captions only.
- `static/timeline.js`'s `Timeline.groupWords(words, 4)` (timeline-strip CAPTIONS row + `timeline-snap.js` boundaries) is unchanged — cosmetic reference chunking, not the real layout.

---

### Task 1: Pure pagination algorithm (backend)

**Files:**
- Create: `app/caption_layout.py`
- Test: `tests/test_caption_layout.py`

**Interfaces:**
- Consumes: `app.caption_word_estimate.estimate_word_timings(word) -> list[CaptionWord]` (existing), `app.models.CaptionWord` (existing).
- Produces: `paginate_words(words: list[CaptionWord], measure: Callable[[str], float], box_width_px: float, box_height_px: float, font_size_px: float, line_height: float = 1.15) -> list[list[list[CaptionWord]]]` — pages → lines → words, sorted by `t_start`. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_caption_layout.py
from app.models import CaptionWord
from app.caption_layout import paginate_words

def w(t, a, b): return CaptionWord(text=t, t_start=a, t_end=b)

def _char_width_measurer(px_per_char):
    return lambda text: len(text) * px_per_char

def test_paginate_words_empty_input():
    assert paginate_words([], _char_width_measurer(10), 1000, 1000, 20) == []

def test_paginate_words_sorts_by_start_time():
    words = [w("b", 1.0, 1.5), w("a", 0.0, 0.5)]
    pages = paginate_words(words, _char_width_measurer(10), 1000, 1000, 20)
    assert [x.text for x in pages[0][0]] == ["a", "b"]

def test_paginate_words_expands_multi_word_entries():
    words = [w("talks about this", 0.0, 3.0)]
    pages = paginate_words(words, _char_width_measurer(10), 1000, 1000, 20)
    assert len(pages) == 1 and len(pages[0]) == 1
    assert [x.text for x in pages[0][0]] == ["talks", "about", "this"]

def test_paginate_words_packs_words_that_fit_onto_one_line():
    # "one" + " " + "two" = 7 chars = 70px at 10px/char, fits an 80px-wide box
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0)]
    pages = paginate_words(words, _char_width_measurer(10), 80, 1000, 20)
    assert len(pages) == 1 and len(pages[0]) == 1
    assert [x.text for x in pages[0][0]] == ["one", "two"]

def test_paginate_words_breaks_line_when_width_exceeded():
    # "one" + " " + "two" = 70px > 60px box width -> two separate lines, same page
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0)]
    pages = paginate_words(words, _char_width_measurer(10), 60, 1000, 20)
    assert len(pages) == 1
    assert [[x.text for x in line] for line in pages[0]] == [["one"], ["two"]]

def test_paginate_words_oversized_single_word_gets_its_own_line():
    words = [w("supercalifragilistic", 0.0, 1.0), w("hi", 1.0, 1.5)]
    pages = paginate_words(words, _char_width_measurer(10), 50, 1000, 20)
    assert [[x.text for x in line] for line in pages[0]] == [["supercalifragilistic"], ["hi"]]

def test_paginate_words_paginates_when_height_exceeded():
    # font_size_px=20, line_height=1.15 -> one line is 23px tall; box_height=30 fits only 1 line/page
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0), w("three", 1.0, 1.5)]
    pages = paginate_words(words, _char_width_measurer(10), 10, 30, 20, line_height=1.15)
    assert [len(page) for page in pages] == [1, 1, 1]

def test_paginate_words_multiple_lines_fit_one_page_when_tall_enough():
    # box_height=60 fits 2 lines (2 * 23px = 46px <= 60px, 3 * 23px = 69px > 60px)
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0), w("three", 1.0, 1.5)]
    pages = paginate_words(words, _char_width_measurer(10), 10, 60, 20, line_height=1.15)
    assert [len(page) for page in pages] == [2, 1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_caption_layout.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.caption_layout'`

- [ ] **Step 3: Write the implementation**

```python
# app/caption_layout.py
# Pure word-wrap + pagination for the CAPTIONS box: packs CaptionWords onto lines by measured
# pixel width, then paginates lines by box height, so what renders on stage/export always fits
# the caption preset's fixed box size instead of a flat manual word-per-line count.
# Exposes paginate_words. Depends on app.models/app.caption_word_estimate.
from typing import Callable
from app.models import CaptionWord
from app.caption_word_estimate import estimate_word_timings

def paginate_words(
    words: list[CaptionWord],
    measure: Callable[[str], float],
    box_width_px: float,
    box_height_px: float,
    font_size_px: float,
    line_height: float = 1.15,
) -> list[list[list[CaptionWord]]]:
    expanded = [sub for word in words for sub in estimate_word_timings(word)]
    sorted_words = sorted(expanded, key=lambda word: word.t_start)
    if not sorted_words:
        return []

    max_lines = max(1, int(box_height_px // (font_size_px * line_height)))
    pages: list[list[list[CaptionWord]]] = []
    current_page: list[list[CaptionWord]] = []
    current_line: list[CaptionWord] = []
    current_line_text = ""

    for word in sorted_words:
        candidate = f"{current_line_text} {word.text}" if current_line_text else word.text
        if current_line and measure(candidate) > box_width_px:
            current_page.append(current_line)
            if len(current_page) >= max_lines:
                pages.append(current_page)
                current_page = []
            current_line = [word]
            current_line_text = word.text
        else:
            current_line.append(word)
            current_line_text = candidate

    if current_line:
        current_page.append(current_line)
    if current_page:
        pages.append(current_page)
    return pages
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_caption_layout.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/caption_layout.py tests/test_caption_layout.py
git commit -m "feat: add pure word-wrap/pagination algorithm for caption box sizing"
```

---

### Task 2: Backend export integration (`app/ass_render.py`, `app/models.py`, `app/main.py`)

**Files:**
- Modify: `app/models.py` (remove `TextPreset.max_words_per_line`)
- Modify: `app/ass_render.py` (remove `group_words`, rewrite `_karaoke_dialogue`/`_current_word_dialogues`/`render_caption_ass` around pages)
- Modify: `app/caption_word_estimate.py` (header comment only — its consumer moves from `group_words` to `paginate_words`)
- Modify: `app/main.py:174-175` (transcribe route's default caption preset)
- Modify: `tests/test_models.py:144` (drop the removed-field assertion)
- Modify: `tests/test_ass_render.py` (remove `group_words` tests, update `max_words_per_line`-using tests, add pagination-driven export tests)

**Interfaces:**
- Consumes: `app.caption_layout.paginate_words` (Task 1), `app.font_metrics.pil_font_measurer` (existing).
- Produces: `render_caption_ass(project, preset)` unchanged signature/behavior for callers (`app/main.py`'s export route) — internal rendering now paginates instead of flat-chunking. `CAPTION_DEFAULT_BOX_WIDTH = 900`, `CAPTION_DEFAULT_BOX_HEIGHT = 350` module constants in `app/ass_render.py`, consumed nowhere outside this file (Task 3's JS defaults are independent literals kept in sync manually, per the Global Constraints line above).

- [ ] **Step 1: Remove the field from the model**

In `app/models.py`, delete this line (part of `TextPreset`):

```python
    max_words_per_line: int = 4        # caption line-grouping size; unused by TextBlockLayer consumers
```

- [ ] **Step 2: Update `tests/test_models.py`**

In `test_text_preset_highlight_and_grouping_defaults` (around line 139-144), delete:

```python
    assert p.max_words_per_line == 4
```

- [ ] **Step 3: Run the model tests to verify they still pass**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 4: Write the failing export-level tests**

Add to `tests/test_ass_render.py`, replacing every existing `test_group_words_*` test (delete `test_group_words_respects_max_words`, `test_group_words_sorts_by_start_time`, `test_group_words_empty`, `test_group_words_expands_multi_word_entries`, `test_group_words_expansion_still_respects_max_words` — that coverage now lives in `tests/test_caption_layout.py`) and adding:

```python
def test_karaoke_dialogue_joins_lines_with_ass_hard_break():
    from app.ass_render import _karaoke_dialogue
    pr = TextPreset(name="Cap")
    page = [[w("Hello", 0.0, 0.5)], [w("world", 0.5, 1.0)]]
    line = _karaoke_dialogue(page, pr)
    assert "\\N" in line
    assert "Hello" in line and "world" in line
    assert line.startswith("Dialogue: 0,0:00:00.00,0:00:01.00")

def test_current_word_dialogues_highlight_word_on_any_line():
    from app.ass_render import _current_word_dialogues
    pr = TextPreset(name="Cap", color="#FFFFFF", highlight_color="#FFD400")
    page = [[w("Hello", 0.0, 0.5)], [w("world", 0.5, 1.0)]]
    dialogues = _current_word_dialogues(page, pr)
    assert len(dialogues) == 2
    assert "\\N" in dialogues[0] and "\\N" in dialogues[1]
    assert dialogues[0].count("{\\1c") == 1

def test_render_caption_ass_wraps_to_multiple_lines_when_box_is_narrow():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill",
                     box_width_mode="fixed", box_width=1, box_height_mode="fixed", box_height=1000)
    p = Project(name="r", captions=CaptionTrack(words=[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\N" in line  # box_width=1 forces every word onto its own line

def test_render_caption_ass_paginates_when_box_is_short():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill", size_px=96,
                     box_width_mode="fixed", box_width=1, box_height_mode="fixed", box_height=50)
    # box_height=50 is smaller than one line (size_px*1.15 ~ 110) -> 1 line/page
    p = Project(name="r", captions=CaptionTrack(words=[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 2
    assert "\\N" not in dialogues[0]

def test_render_caption_ass_falls_back_to_default_box_when_not_fixed():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill")  # box_width_mode defaults "fit"
    p = Project(name="r", captions=CaptionTrack(words=[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "Hello" in line and "world" in line
    assert "\\N" not in line  # fits comfortably inside the 900x350 default box
```

Also update these two existing tests to drop the now-invalid `max_words_per_line=4` kwarg (field removed in Step 1):

```python
def test_progressive_fill_emits_one_k_tagged_dialogue_per_group():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(
        words=[w("Hello", 1.0, 1.5), w("world", 1.5, 2.2)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if "Hello" in l)
    assert line.startswith("Dialogue: 0,0:00:01.00,0:00:02.20,Caption")
    assert "{\\k50}Hello" in line and "{\\k70}world" in line

def test_render_caption_ass_expands_multi_word_entry_into_karaoke_segments():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(words=[w("talks about this", 0.0, 3.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if "talks" in l)
    assert line.count("{\\k") == 3
    assert "talks" in line and "about" in line and "this" in line
```

- [ ] **Step 5: Run tests to verify the new/updated ones fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: FAIL — `_karaoke_dialogue`/`_current_word_dialogues` still take a flat `group`, `render_caption_ass` still calls the now-deleted `group_words` with a `max_words_per_line` attribute that no longer exists.

- [ ] **Step 6: Rewrite the caption dialogue builders in `app/ass_render.py`**

Update the module header comment (line 1-2):

```python
# Generates the ASS subtitle files burned into exports: text-block dialogues via render_ass() (accepts an optional text_blocks subset so app/main.py can render one ASS file per z-order band, see app.timeline.banded_layers), and karaoke caption dialogues via render_caption_ass() (word-wrap/pagination against the caption box's fixed size via app.caption_layout.paginate_words).
# Exposes render_ass, render_caption_ass, ass_time, hex_to_ass. Consumed by the export route; rendered by libass.
```

Replace the `app.caption_word_estimate` import (its only consumer, `group_words`, is being deleted below) with the new pagination import — change:

```python
from app.caption_word_estimate import estimate_word_timings
```

to:

```python
from app.caption_layout import paginate_words
```

Also update `app/caption_word_estimate.py`'s header comment, which currently reads "Consumed by app.ass_render.group_words" — change that line to "Consumed by app.caption_layout.paginate_words."

Add default-box constants right after the existing `BOX_PAD_X_EM`/`BOX_PAD_Y_EM`/`LINE_HEIGHT` constants:

```python
CAPTION_DEFAULT_BOX_WIDTH = 900    # px on the 1080x1920 canvas — used when the preset predates fixed-size captions
CAPTION_DEFAULT_BOX_HEIGHT = 350   # px
```

Delete the `group_words` function entirely:

```python
def group_words(words: list[CaptionWord], max_words: int) -> list[list[CaptionWord]]:
    expanded = [w for word in words for w in estimate_word_timings(word)]
    sorted_words = sorted(expanded, key=lambda w: w.t_start)
    return [sorted_words[i:i + max_words] for i in range(0, len(sorted_words), max_words)]
```

Replace `_karaoke_dialogue` and `_current_word_dialogues` (they now take a `page: list[list[CaptionWord]]` instead of a flat `group`):

```python
def _karaoke_dialogue(page: list[list[CaptionWord]], p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
    line_bodies = []
    for line in page:
        body = "".join(f"{{\\k{max(1, round((w.t_end - w.t_start) * 100))}}}{w.text} " for w in line).rstrip()
        line_bodies.append(body)
    body = "\\N".join(line_bodies)
    start, end = page[0][0].t_start, page[-1][-1].t_end
    return f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}"

def _current_word_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
    highlight = _ass_override_color(p.highlight_color)
    normal = _ass_override_color(p.color)
    flat = [word for line in page for word in line]
    dialogues = []
    for active in flat:
        line_bodies = []
        for line in page:
            segments = []
            for j, other in enumerate(line):
                seg = other.text + (" " if j < len(line) - 1 else "")
                segments.append(f"{{\\1c{highlight}}}{seg}{{\\1c{normal}}}" if other is active else seg)
            line_bodies.append("".join(segments))
        body = "\\N".join(line_bodies)
        dialogues.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                          f"{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}")
    return dialogues
```

Replace `render_caption_ass`:

```python
def render_caption_ass(project: Project, preset: TextPreset) -> str:
    words = project.captions.words if project.captions else []
    weight = _resolved_weight(preset)
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = _caption_style(preset, weight)
    box_width = preset.box_width if preset.box_width_mode == "fixed" and preset.box_width > 0 else CAPTION_DEFAULT_BOX_WIDTH
    box_height = preset.box_height if preset.box_height_mode == "fixed" and preset.box_height > 0 else CAPTION_DEFAULT_BOX_HEIGHT
    pad_x = BOX_PAD_X_EM * preset.size_px * 2
    pad_y = BOX_PAD_Y_EM * preset.size_px * 2
    measure = pil_font_measurer(preset.font, preset.size_px, weight)
    pages = paginate_words(words, measure, max(1, box_width - pad_x), max(1, box_height - pad_y), preset.size_px, LINE_HEIGHT)
    event_lines = []
    for page in pages:
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(page, preset))
        else:
            event_lines.append(_karaoke_dialogue(page, preset))
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(event_lines))
    return header + styles + events + "\n"
```

- [ ] **Step 7: Update `app/main.py`'s transcribe-route default caption preset**

Around line 174-175, replace:

```python
        preset = TextPreset(name="Caption", size_px=72, x=540, y=1520, align="center",
                             highlight_color="#FFD400", highlight_mode="current_word", max_words_per_line=4)
```

with:

```python
        preset = TextPreset(name="Caption", size_px=72, x=540, y=1520, align="center",
                             highlight_color="#FFD400", highlight_mode="current_word",
                             box_width_mode="fixed", box_height_mode="fixed", box_width=900, box_height=350)
```

- [ ] **Step 8: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, all tests green (no `group_words`/`max_words_per_line` references remain anywhere in `app/` or `tests/`)

- [ ] **Step 9: Commit**

```bash
git add app/models.py app/ass_render.py app/main.py tests/test_models.py tests/test_ass_render.py
git commit -m "feat: export captions via box-size-driven pagination instead of flat word count"
```

---

### Task 3: CAPTIONS panel UI — remove SIZE toggle and max-words field

**Files:**
- Modify: `static/panel-captions.js` (`defaultCaptionPreset`, `ensureCaptionPreset`)
- Modify: `static/caption-panel-box.js` (remove SIZE mode toggle, always show WIDTH/HEIGHT)
- Modify: `static/caption-panel-highlight.js` (remove MAX WORDS PER LINE field)
- Modify: `static/index.html:270-273,331-333` (remove the now-unused container markup)

**Interfaces:**
- Consumes: existing `UI.buttonGroup`/`UI.numberField` (unchanged).
- Produces: `ensureCaptionPreset(id)` now guarantees every caption preset it returns has `box_width_mode === "fixed"`, `box_height_mode === "fixed"`, `box_width > 0`, `box_height > 0` — Task 4's pagination code relies on this guarantee and does not re-check it.

- [ ] **Step 1: Update `static/panel-captions.js`'s defaults and self-heal**

In `defaultCaptionPreset`, replace:

```javascript
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
```

with:

```javascript
    box_width_mode: "fixed", box_height_mode: "fixed", box_width: 900, box_height: 350,
```

and remove `max_words_per_line: 4,` from the same object literal (on the `highlight_color`/`highlight_mode` line).

Replace `ensureCaptionPreset`:

```javascript
function ensureCaptionPreset(id) {
  if (!project.text_presets[id]) {
    project.text_presets[id] = defaultCaptionPreset(id);
  }
  const preset = project.text_presets[id];
  // Self-heal presets saved before captions always used a fixed-size box.
  if (preset.box_width_mode !== "fixed" || preset.box_height_mode !== "fixed" ||
      !(preset.box_width > 0) || !(preset.box_height > 0)) {
    preset.box_width_mode = "fixed";
    preset.box_height_mode = "fixed";
    preset.box_width = preset.box_width > 0 ? preset.box_width : 900;
    preset.box_height = preset.box_height > 0 ? preset.box_height : 350;
  }
  return preset;
}
```

- [ ] **Step 2: Remove the SIZE toggle from `static/caption-panel-box.js`**

Delete:

```javascript
  UI.buttonGroup(document.getElementById("caption-box-size-mode-group"),
    [{ value: "fit", label: "FIT", span: 3 }, { value: "fixed", label: "FREE", span: 2 }, { value: "fill", label: "FILL", span: 3 }],
    preset.box_width_mode,
    (value) => {
      preset.box_width_mode = value;
      preset.box_height_mode = value;
      renderCaptionPreview(); saveProject(); CaptionPanel.renderBox();
    });

  const boxSizeFieldsHidden = preset.box_width_mode === "fit";
  document.getElementById("caption-box-width-field").hidden = boxSizeFieldsHidden;
  document.getElementById("caption-box-height-field").hidden = boxSizeFieldsHidden;
```

and change the two `UI.numberField` calls right below it (WIDTH/HEIGHT) so their `onChange` also re-runs pagination-aware caption preview — no field-visibility logic needed since they're now unconditionally shown:

```javascript
  UI.numberField(document.getElementById("caption-box-width-field"),
    { label: "WIDTH", unit: "PX", value: preset.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.box_width = v; renderCaptionPreview(); saveProject(); } });

  UI.numberField(document.getElementById("caption-box-height-field"),
    { label: "HEIGHT", unit: "PX", value: preset.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.box_height = v; renderCaptionPreview(); saveProject(); } });
```

Update the file header comment (line 1-5) to drop the removed SIZE-mode mention:

```javascript
// CAPTIONS panel Box tab: fixed WIDTH/HEIGHT, background/border, TEXT ALIGN, and absolute
// POSITION fields — same shape as editor.js's renderBoxPanel() + text-panel-align.js
// + text-panel-position.js combined, pointed at the caption track's preset. The box is always a
// fixed size for captions (word-wrap/pagination adapts to it — see preview-captions.js /
// app/ass_render.py), unlike TEXT blocks which keep FIT/FREE/FILL. POSITION anchor grid shares
// panel-text.js's anchorPositionX/Y helpers + Preview.getCaptionBoxSize().
```

- [ ] **Step 3: Remove the MAX WORDS PER LINE field from `static/caption-panel-highlight.js`**

Delete:

```javascript
  UI.numberField(document.getElementById("caption-max-words-field"),
    { label: "MAX WORDS PER LINE", value: preset.max_words_per_line, step: 1, min: 1, max: 12, span: 8,
      onChange: (v) => { preset.max_words_per_line = Math.round(v); saveProject(); renderCaptionPreview(); } });
```

Update the file header comment (line 1-3):

```javascript
// CAPTIONS panel Design tab (HIGHLIGHT group): karaoke mode toggle + highlight color —
// captions-only controls with no TEXT-panel equivalent. Word-per-line/line-per-page counts are
// no longer manual (see the Box tab's fixed WIDTH/HEIGHT + app/caption_layout.py's
// paginate_words). Exposes window.CaptionPanel.renderHighlight().
```

- [ ] **Step 4: Remove the now-unused markup from `static/index.html`**

Around line 269-280, replace:

```html
            <div class="style-group-label">SIZE</div>
            <div class="style-group">
              <div id="caption-box-size-mode-group"></div>
            </div>
            <div class="style-group">
              <div class="style-row">
                <label id="caption-box-width-field"></label>
                <label id="caption-box-height-field"></label>
              </div>
            </div>
```

with:

```html
            <div class="style-group">
              <div class="style-row">
                <label id="caption-box-width-field"></label>
                <label id="caption-box-height-field"></label>
              </div>
            </div>
```

Around line 329-334, replace:

```html
              <div id="caption-highlight-color-field"></div>
            </div>
            <div class="style-group">
              <label id="caption-max-words-field"></label>
            </div>
          </div>
```

with:

```html
              <div id="caption-highlight-color-field"></div>
            </div>
          </div>
```

- [ ] **Step 5: Verify live in the browser**

Start the dev server (`preview_start` with the project's server config, or `.venv/Scripts/python -m uvicorn app.main:app --reload`), open the editor, open a project with captions (or transcribe a clip), open the CAPTIONS panel's Box tab and confirm:
- No SIZE mode toggle is visible.
- WIDTH/HEIGHT number fields are always visible and editable.
- The Design tab's HIGHLIGHT group no longer shows "MAX WORDS PER LINE".

- [ ] **Step 6: Commit**

```bash
git add static/panel-captions.js static/caption-panel-box.js static/caption-panel-highlight.js static/index.html
git commit -m "feat: remove caption SIZE mode toggle and manual max-words field"
```

---

### Task 4: Frontend pagination engine + stage rendering

**Files:**
- Create: `static/caption-layout.js`
- Modify: `static/preview-captions.js` (full rewrite of the rendering path)
- Modify: `static/css/components/stage.css` (`.caption-block`/new `.caption-line`)
- Modify: `static/index.html` (add the new script tag)

**Interfaces:**
- Consumes: `Timeline.estimateWordTimings` (existing, `static/caption-word-estimate.js`), `FontFit.canvasMeasurer` (existing, `static/font-fit.js`), `ensureCaptionPreset`'s guarantee from Task 3 that a caption preset always has a valid fixed box.
- Produces: `window.CaptionLayout.paginateWords(words, measureFn, boxWidthPx, boxHeightPx, fontSizePx, lineHeightEm = 1.15) -> Array<Array<Array<word>>>` (pages → lines → words), consumed by `static/preview-captions.js` only.

- [ ] **Step 1: Create `static/caption-layout.js`**

```javascript
// Pure word-wrap + pagination for the CAPTIONS box: packs caption words onto lines by measured
// pixel width, then paginates lines by box height. JS mirror of app/caption_layout.py's
// paginate_words — same algorithm, same page/line/word output shape. Depends on
// window.Timeline.estimateWordTimings (load after caption-word-estimate.js).
// Exposes window.CaptionLayout.paginateWords.
window.CaptionLayout = (() => {
  function paginateWords(words, measureFn, boxWidthPx, boxHeightPx, fontSizePx, lineHeightEm = 1.15) {
    const expanded = words.flatMap((word) => Timeline.estimateWordTimings(word));
    const sorted = expanded.sort((a, b) => a.t_start - b.t_start);
    if (sorted.length === 0) return [];

    const maxLines = Math.max(1, Math.floor(boxHeightPx / (fontSizePx * lineHeightEm)));
    const pages = [];
    let currentPage = [];
    let currentLine = [];
    let currentLineText = "";

    for (const word of sorted) {
      const candidate = currentLineText ? `${currentLineText} ${word.text}` : word.text;
      if (currentLine.length > 0 && measureFn(candidate) > boxWidthPx) {
        currentPage.push(currentLine);
        if (currentPage.length >= maxLines) {
          pages.push(currentPage);
          currentPage = [];
        }
        currentLine = [word];
        currentLineText = word.text;
      } else {
        currentLine.push(word);
        currentLineText = candidate;
      }
    }
    if (currentLine.length > 0) currentPage.push(currentLine);
    if (currentPage.length > 0) pages.push(currentPage);
    return pages;
  }

  return { paginateWords };
})();
```

- [ ] **Step 2: Add the script tag to `static/index.html`**

Right after the existing `<script src="/static/caption-word-estimate.js"></script>` line, add:

```html
<script src="/static/caption-layout.js"></script>
```

- [ ] **Step 3: Update `.caption-block` and add `.caption-line` in `static/css/components/stage.css`**

Replace:

```css
.caption-block {
  position: absolute;
  white-space: pre;
  box-sizing: border-box;
}
```

with:

```css
.caption-block {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.caption-line {
  white-space: pre;
}
```

- [ ] **Step 4: Rewrite `static/preview-captions.js`**

```javascript
// Stage caption overlay rendering: paginates project.captions.words via CaptionLayout.paginateWords
// (word-wrap by the caption box's fixed width, line-pagination by its fixed height), finds the
// page active at a given timelineTime, and renders it as one .caption-block div containing one
// .caption-line div per line, each with per-word highlight color per preset.highlight_mode.
// Memoizes the paginated pages per (words, box size, font) so a full re-measure only happens when
// something relevant actually changed — mirrors preview-text.js's fitCache pattern.
// getBoxSizeCanvasPx() reads the caption block's live on-stage rendered size (in 1080x1920 canvas
// px) for the POSITION anchor-grid shortcut. Exposes window.PreviewCaptions.
// {renderCaptions(project, presets, timelineTime), getBoxSizeCanvasPx}.
window.PreviewCaptions = (() => {
  const overlay = document.getElementById("overlay");
  const stage = document.getElementById("stage");
  let paginationCache = null; // { key, pages }

  function hexToRgba(hex, opacityPercent) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
  }

  function paginationKey(track, preset) {
    return JSON.stringify([
      track.words.map((w) => [w.id, w.text, w.t_start, w.t_end]),
      preset.box_width, preset.box_height, preset.size_px, preset.font, preset.weight, preset.italic,
    ]);
  }

  function getPaginatedPages(track, preset) {
    const key = paginationKey(track, preset);
    if (paginationCache && paginationCache.key === key) return paginationCache.pages;
    const measure = FontFit.canvasMeasurer(preset.font, preset.size_px, { weight: preset.weight, italic: preset.italic });
    const padX = 0.35 * preset.size_px * 2;
    const padY = 0.15 * preset.size_px * 2;
    const pages = CaptionLayout.paginateWords(track.words, measure,
      Math.max(1, preset.box_width - padX), Math.max(1, preset.box_height - padY), preset.size_px);
    paginationCache = { key, pages };
    return pages;
  }

  function activeCaptionPage(track, preset, timelineTime) {
    const pages = getPaginatedPages(track, preset);
    return pages.find((page) => {
      const words = page.flat();
      return timelineTime >= words[0].t_start && timelineTime < words[words.length - 1].t_end;
    }) || null;
  }

  function renderCaptions(project, presets, timelineTime) {
    overlay.querySelectorAll(".caption-block").forEach((el) => el.remove());
    const track = project.captions;
    if (!track || !track.words.length) return;
    const preset = presets[track.preset_id];
    if (!preset) return;

    const page = activeCaptionPage(track, preset, timelineTime);
    if (!page) return;

    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) stageH = stageW * 16 / 9;

    const div = document.createElement("div");
    div.className = `caption-block text-block--align-${preset.align}`;
    div.style.zIndex = String(track.z_index ?? 0);
    div.style.left = (preset.x / 1080 * stageW) + "px";
    div.style.top = (preset.y / 1920 * stageH) + "px";
    div.style.width = (preset.box_width / 1080 * stageW) + "px";
    div.style.height = (preset.box_height / 1920 * stageH) + "px";
    div.style.textAlign = preset.align;
    div.style.fontFamily = `"${preset.font}", sans-serif`;
    div.style.fontWeight = String(preset.weight);
    div.style.fontStyle = preset.italic ? "italic" : "normal";
    div.style.textDecoration = preset.underline ? "underline" : "none";
    div.style.fontSize = (preset.size_px / 1920 * stageH) + "px";
    div.style.webkitTextStroke = `${preset.outline_px / 1920 * stageH}px ${preset.outline_color}`;
    div.style.padding = "0.15em 0.35em";
    div.style.backgroundColor = preset.box_background ? hexToRgba(preset.box_background_color, preset.box_background_opacity) : "transparent";
    div.style.borderWidth = (preset.box_border_width / 1080 * stageW) + "px";
    div.style.borderStyle = preset.box_border_width > 0 ? "solid" : "none";
    div.style.borderColor = preset.box_border_color;
    div.style.textShadow = preset.shadow
      ? `${preset.shadow_offset_x / 1920 * stageH}px ${preset.shadow_offset_y / 1920 * stageH}px ${preset.shadow_blur / 1920 * stageH}px ${preset.shadow_color}`
      : "none";
    div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";
    div.style.pointerEvents = "none";

    page.forEach((line) => {
      const lineDiv = document.createElement("div");
      lineDiv.className = "caption-line";
      line.forEach((word, i) => {
        const span = document.createElement("span");
        let isHighlighted;
        if (preset.highlight_mode === "progressive_fill") {
          isHighlighted = timelineTime >= word.t_start;
        } else {
          isHighlighted = timelineTime >= word.t_start && timelineTime < word.t_end;
        }
        span.style.color = isHighlighted ? preset.highlight_color : preset.color;
        span.textContent = word.text + (i < line.length - 1 ? " " : "");
        lineDiv.appendChild(span);
      });
      div.appendChild(lineDiv);
    });

    overlay.appendChild(div);
  }

  function getBoxSizeCanvasPx() {
    const div = overlay.querySelector(".caption-block");
    if (!div) return null;
    const stageW = overlay.clientWidth || stage.clientWidth;
    const stageH = overlay.clientHeight || stage.clientHeight;
    if (!stageW || !stageH) return null;
    return { width: div.offsetWidth / stageW * 1080, height: div.offsetHeight / stageH * 1920 };
  }

  return { renderCaptions, getBoxSizeCanvasPx };
})();
```

- [ ] **Step 5: Verify live in the browser**

Start the dev server, open a project with transcribed captions:
- Confirm captions render on stage, wrapped across multiple lines within the box (default 900×350 at `size_px=72` should show up to ~3-4 lines).
- Open CAPTIONS > Box tab, shrink WIDTH to something narrow (e.g. 300px) and confirm the on-stage caption re-wraps to more/shorter lines instead of overflowing.
- Shrink HEIGHT and confirm fewer lines show per page (captions cycle through pages faster).
- Toggle highlight mode (current word / progressive fill) and confirm per-word highlighting still works correctly across multiple lines.
- Check the browser console for errors (`read_console_messages`).

- [ ] **Step 6: Commit**

```bash
git add static/caption-layout.js static/preview-captions.js static/css/components/stage.css static/index.html
git commit -m "feat: render captions via box-size-driven word-wrap and pagination"
```

---

### Task 5: Update the codebase map (CLAUDE.md)

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (documentation only).

- [ ] **Step 1: Update the File structure tree**

Add `app/caption_layout.py` and `static/caption-layout.js` entries (alphabetically placed near `app/caption_word_estimate.py` and `static/caption-word-estimate.js` respectively), each with a one-line description matching their file-header comments from Tasks 1 and 4.

Update the existing `app/ass_render.py`, `app/models.py`, `static/panel-captions.js`, `static/caption-panel-box.js`, `static/caption-panel-highlight.js`, and `static/preview-captions.js` entries' descriptions to reflect: `group_words`/`max_words_per_line` removed, caption box is always fixed-size, pagination replaces flat word-chunking.

- [ ] **Step 2: Update the Captions & transcription inventory section**

Update the `TextPreset`/`CaptionTrack` bullet to drop the `max_words_per_line` mention. Add a short bullet for `app/caption_layout.py` / `static/caption-layout.js` describing `paginate_words`/`CaptionLayout.paginateWords`. Update `app/ass_render.py`'s bullet to describe pagination-driven `render_caption_ass` instead of `group_words`. Update `static/preview-captions.js`'s bullet to describe page/line-based rendering. Update `static/caption-panel-box.js`/`static/caption-panel-highlight.js` bullets to reflect the removed SIZE toggle and max-words field.

- [ ] **Step 3: Run the full test suite one more time as a final check**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for caption box sizing"
```
