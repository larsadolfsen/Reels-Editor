# Phase 5 — Rich-Text Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let FONT properties (size, weight, italic, underline, color, outline, highlight) vary per selected range of text within a single text block, built on Phase 1's `contenteditable` stage element.

**Architecture:** `TextBlockLayer` gains a sparse `formatting_runs: list[FormatRun]` (character-offset ranges into `heading`, only overridden fields set). Word-wrap becomes range-aware (`wrap_text_runs`) so mixed-width runs still wrap correctly; ASS export emits inline override tags at run boundaries plus per-visual-line highlight rectangles. The browser preview renders one `<span>` per run — multi-line highlight comes free from the browser's native inline-box wrapping. Selection→formatting is driven by the browser's native Selection API, converted to character offsets by a small utility.

**Tech Stack:** FastAPI/Pydantic backend (`app/`), vanilla JS frontend (`static/`, no build step), Pillow for ASS-export text measurement, pytest.

## Global Constraints

- No JS build step/bundler — every `static/*.js` file is hand-written, loaded directly by `static/index.html`.
- No inline `style="..."` attributes anywhere in `static/index.html` or JS-rendered markup — styling lives in `static/css/**`.
- Every `static/*.js` file opens with a one/two-line purpose comment.
- Reusable UI/API logic lives one function/component per file under `window.UI.*` / `window.Api.*` — never grouped into shared catch-all files.
- `app/main.py` stays composition-only (routes → modules); no logic lives there.
- Backward compatible: a `TextBlockLayer` with an empty `formatting_runs` list must render and export identically to today, with no project-file migration needed (the field simply defaults to `[]`).
- This codebase has no JS test framework (`no *.test.js`, no `package.json`) — frontend tasks are verified manually in the browser via the `run`/preview tooling, not automated tests. Backend (`app/`) tasks use `pytest` TDD as normal.

---

### Task 1: `FormatRun` model + `TextBlockLayer.formatting_runs` + highlight fields

**Files:**
- Modify: `app/models.py`
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `FormatRun` class with fields `start: int`, `end: int`, and sparse-optional overrides `font: str | None`, `size_px: int | None`, `color: str | None`, `outline_color: str | None`, `outline_px: int | None`, `weight: int | None`, `italic: bool | None`, `underline: bool | None`, `highlight: bool | None`, `highlight_color: str | None`. `TextBlockLayer.formatting_runs: list[FormatRun] = []`. `TextPreset.highlight: bool = False`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_models.py`:

```python
from app.models import FormatRun

def test_format_run_only_start_end_required():
    r = FormatRun(start=2, end=5)
    assert (r.start, r.end) == (2, 5)
    assert r.color is None and r.weight is None and r.highlight is None

def test_format_run_sparse_overrides_round_trip():
    r = FormatRun(start=0, end=3, color="#FF0000", weight=700, highlight=True, highlight_color="#00FF00")
    assert FormatRun.model_validate_json(r.model_dump_json()) == r

def test_text_block_formatting_runs_defaults_empty():
    b = TextBlockLayer(heading="hi", preset_id="x")
    assert b.formatting_runs == []

def test_text_block_formatting_runs_round_trip():
    b = TextBlockLayer(heading="hi there", preset_id="x",
                        formatting_runs=[FormatRun(start=0, end=2, weight=700)])
    out = TextBlockLayer.model_validate_json(b.model_dump_json())
    assert out.formatting_runs == [FormatRun(start=0, end=2, weight=700)]

def test_text_preset_highlight_defaults_off():
    p = TextPreset(name="Pop")
    assert p.highlight is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'FormatRun'` (or `AttributeError` on `formatting_runs`/`highlight`).

- [ ] **Step 3: Implement the model changes**

In `app/models.py`, add `FormatRun` above `class TextBlockLayer(BaseModel):`:

```python
class FormatRun(BaseModel):
    # Character-offset range into a TextBlockLayer.heading string. All style fields below are
    # sparse overrides — None means "fall through to the block's base TextPreset" — so an
    # unstyled edit to the base preset (e.g. changing font size) still applies to any part of
    # the heading that isn't explicitly overridden by a run.
    start: int
    end: int
    font: str | None = None
    size_px: int | None = None
    color: str | None = None
    outline_color: str | None = None
    outline_px: int | None = None
    weight: int | None = None
    italic: bool | None = None
    underline: bool | None = None
    highlight: bool | None = None
    highlight_color: str | None = None
```

Then modify `TextBlockLayer`:

```python
class TextBlockLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    heading: str
    preset_id: str
    start: float = 0.0             # timeline seconds
    end: float = 3.0
    z_index: int = 0
    formatting_runs: list[FormatRun] = []   # sparse per-range style overrides; [] = today's flat-style rendering
```

In `TextPreset`, add the block-level highlight toggle next to the existing caption highlight fields (`highlight_color` at line 62 is reused as-is — it already exists and already defaults to `"#FFD400"`; only the boolean toggle is new):

```python
    highlight: bool = False            # block-level highlight default (off); highlight_color above is shared with captions
```

Update the existing comment on `highlight_color` (line 62) since it's no longer caption-only:

```python
    highlight_color: str = "#FFD400"   # shared: caption karaoke highlight color AND rich-text highlight color
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (no regressions — `highlight_color`'s comment-only change and the two new additive fields don't affect any existing test).

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add FormatRun model + TextBlockLayer.formatting_runs + TextPreset.highlight"
```

---

### Task 2: Range-aware word-wrap (`wrap_text_runs`)

**Files:**
- Modify: `app/font_metrics.py`
- Test: `tests/test_font_metrics.py`

**Interfaces:**
- Consumes: nothing from Task 1 (pure function, generic `measure_range` callable).
- Produces: `wrap_text_runs(text: str, measure_range: Callable[[int, int], float], max_width_px: float) -> tuple[str, list[tuple[int, int]]]` — returns the wrapped text (word-break spaces replaced with `\n` exactly like `wrap_text`) and a list of `(start, end)` character-offset spans into the *original* `text`, one per output visual line, in order. Task 4 (ASS per-run tags) and Task 5 (highlight rects) both consume this signature.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_font_metrics.py`:

```python
from app.font_metrics import wrap_text_runs

def _range_measurer(px_per_char):
    return lambda start, end: 0  # placeholder, replaced per-test below

def test_wrap_text_runs_matches_wrap_text_for_uniform_width():
    text = "one two three"
    measure = _char_width_measurer(10)
    range_measure = lambda s, e: measure(text[s:e])
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=80)
    assert wrapped == wrap_text(text, measure, max_width_px=80) == "one two\nthree"
    assert [text[s:e] for s, e in spans] == ["one two", "three"]

def test_wrap_text_runs_spans_cover_original_offsets_exactly():
    text = "aa bb cc dd"
    range_measure = lambda s, e: (e - s) * 10  # 10px/char, ignores which chars
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=59)  # fits "aa bb" (5 chars=50px) not "aa bb cc" (8=80px)
    assert wrapped == "aa bb\ncc dd"
    assert spans == [(0, 5), (6, 11)]  # (6,11) skips the space at offset 5, matches "cc dd"

def test_wrap_text_runs_preserves_hard_breaks_with_offsets():
    text = "one two\nthree"
    range_measure = lambda s, e: (e - s) * 10
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=1000)
    assert wrapped == "one two\nthree"
    assert [text[s:e] for s, e in spans] == ["one two", "three"]

def test_wrap_text_runs_mixed_widths_wraps_earlier_than_uniform():
    # Simulates a bold run over "two" (offsets 4-7) that's 3x wider per-char than the rest —
    # a uniform 10px/char measurer would fit "one two" (7 chars=70px) under 75px, but the
    # widened "two" pushes the true width past it, forcing an earlier break.
    text = "one two three"
    def range_measure(s, e):
        width = 0
        for i in range(s, e):
            width += 30 if 4 <= i < 7 else 10
        return width
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=75)
    assert wrapped == "one\ntwo three"
    assert [text[s:e] for s, e in spans] == ["one", "two three"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_font_metrics.py -v`
Expected: FAIL — `ImportError: cannot import name 'wrap_text_runs'`.

- [ ] **Step 3: Implement `wrap_text_runs`**

In `app/font_metrics.py`, add below the existing `wrap_text`:

```python
def wrap_text_runs(text: str, measure_range: Callable[[int, int], float], max_width_px: float) -> tuple[str, list[tuple[int, int]]]:
    """Like wrap_text, but measures each candidate line via measure_range(start, end) — character
    offsets into `text` — instead of a single whole-string measurer, so a line spanning multiple
    differently-styled FormatRuns is measured accurately. Line-break decisions still only ever
    happen at spaces (never mid-word), so the greedy algorithm itself is unchanged from wrap_text;
    only what gets measured changes. Returns the wrapped text (word-break spaces become \\n, same
    as wrap_text) plus each output line's (start, end) offsets into the original `text`."""
    out_lines: list[str] = []
    spans: list[tuple[int, int]] = []
    offset = 0
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        word_starts = []
        pos = offset
        for word in words:
            word_starts.append(pos)
            pos += len(word) + 1  # +1 accounts for the space (or the paragraph's trailing \n)
        line_start = word_starts[0]
        line_end = line_start + len(words[0])
        for i in range(1, len(words)):
            candidate_end = word_starts[i] + len(words[i])
            if measure_range(line_start, candidate_end) <= max_width_px:
                line_end = candidate_end
            else:
                out_lines.append(text[line_start:line_end])
                spans.append((line_start, line_end))
                line_start = word_starts[i]
                line_end = word_starts[i] + len(words[i])
        out_lines.append(text[line_start:line_end])
        spans.append((line_start, line_end))
        offset += len(paragraph) + 1  # +1 accounts for the \n joining this paragraph to the next
    return "\n".join(out_lines), spans
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_font_metrics.py -v`
Expected: PASS, all tests including the 4 new ones.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/font_metrics.py tests/test_font_metrics.py
git commit -m "feat: add wrap_text_runs, a range-aware word-wrap for mixed-width formatting runs"
```

---

### Task 3: Selection→offset utility + drag-vs-select hit-test spike

**Files:**
- Create: `static/ui-text-selection.js`
- Modify: `static/ui-text-interaction.js`

**Interfaces:**
- Produces: `window.UI.textSelectionOffsets(div) -> {start, end} | null` (reads `window.getSelection()`, scoped to `div`'s text content; `null` if there's no selection, it's collapsed, or it falls outside `div`). `window.UI.rangeContainsPoint(div, clientX, clientY) -> boolean` (hit-tests whether a viewport point falls inside `div`'s rendered text glyphs, via `Range.getClientRects()`). `UI.textInteraction`'s options gain a new `onSelectionChange({start, end})` callback, fired when a mouseup completes a non-collapsed native text selection inside the block (instead of firing `onEditStart`/entering edit mode). Task 7 (FONT accordion selection-awareness) consumes `onSelectionChange`.
- Consumes: nothing from earlier tasks (pure DOM + the existing `UI.textInteraction` shape from Phase 1).

This task has no backend pytest cycle — it's a DOM interaction change verified live in the browser, per this codebase's existing convention (no JS test framework).

- [ ] **Step 1: Create the selection-offset utility**

Create `static/ui-text-selection.js`:

```javascript
// Selection <-> character-offset mapping for one contenteditable .text-block element, plus a
// glyph hit-test used to distinguish "drag over text = select" from "drag over box padding = move".
// Exposes window.UI.{textSelectionOffsets, rangeContainsPoint}. Pure DOM reads, no state.
window.UI = window.UI || {};

window.UI.textSelectionOffsets = function textSelectionOffsets(div) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  if (!div.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== div) return null;

  const pre = range.cloneRange();
  pre.selectNodeContents(div);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;
  return { start, end };
};

window.UI.rangeContainsPoint = function rangeContainsPoint(div, clientX, clientY) {
  const range = document.createRange();
  range.selectNodeContents(div);
  const rects = range.getClientRects();
  for (const r of rects) {
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return true;
  }
  return false;
};
```

- [ ] **Step 2: Wire the file into `static/index.html`**

Add a `<script src="/static/ui-text-selection.js"></script>` tag next to the existing `ui-text-interaction.js` tag (find it with a search for `ui-text-interaction.js` in `static/index.html` and add the new tag immediately before or after it — script order doesn't matter here since neither file references the other at load time, only at call time).

- [ ] **Step 3: Change the mousedown hit-test in `static/ui-text-interaction.js`**

Replace the `div.addEventListener("mousedown", ...)` block with:

```javascript
window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd, onMove, onMoveEnd, onSelectionChange } = {}) {
  function enterEditMode() {
    if (div.contentEditable === "true") return;
    div.contentEditable = "true";
    div.focus();
    if (onEditStart) onEditStart();
    const onInputEvt = () => { if (onInput) onInput(div.textContent); };
    const onBlur = () => {
      div.removeEventListener("input", onInputEvt);
      div.removeEventListener("blur", onBlur);
      div.contentEditable = "false";
      if (onEditEnd) onEditEnd(div.textContent);
    };
    div.addEventListener("input", onInputEvt);
    div.addEventListener("blur", onBlur);
  }

  div.addEventListener("mousedown", (e) => {
    if (e.target.closest(".resize-handle")) return; // let resize handles work unmodified
    if (div.contentEditable === "true") return; // already editing, let native caret placement work

    if (UI.rangeContainsPoint(div, e.clientX, e.clientY)) {
      // Landed on a glyph: let the browser's native text-selection drag run completely
      // unmodified (no preventDefault, no custom mousemove tracking) and classify the
      // outcome on mouseup — a real drag produces a non-collapsed selection (format-range
      // intent), a plain click leaves it collapsed (edit intent, same as before).
      const onMouseUp = () => {
        document.removeEventListener("mouseup", onMouseUp);
        const offsets = UI.textSelectionOffsets(div);
        if (offsets && offsets.end > offsets.start) {
          if (onSelectionChange) onSelectionChange(offsets);
        } else {
          enterEditMode();
        }
      };
      document.addEventListener("mouseup", onMouseUp);
      return;
    }

    // Landed on empty box padding: box-move drag, unchanged from Phase 1.
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (moved && onMove) onMove({ dx, dy });
    };
    const onMouseUp = (upEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (moved) {
        const dx = upEvent.clientX - startX, dy = upEvent.clientY - startY;
        if (onMoveEnd) onMoveEnd({ dx, dy });
      } else {
        enterEditMode();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
};
```

Update the file's header comment to mention the new selection-vs-move hit-test behavior.

- [ ] **Step 4: Spike verification in the browser**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000` in the preview browser.

Manually verify, using the preview tools (`preview_start`, `computer`, `read_console_messages`):
1. Add a text block with heading text long enough to have visible glyphs (e.g. "HELLO WORLD").
2. Click once on the block (not dragging) → confirm it still enters edit mode (caret visible, can type) exactly as before this task.
3. Blur (click elsewhere) to exit edit mode. Click-and-drag across a few letters of the heading → confirm a native blue text-selection highlight appears and the box does **not** move.
4. Click-and-drag starting from empty padding around the text (if the box has visible padding — resize it larger first if needed to have empty space) → confirm the box moves and no text gets selected.
5. Check `read_console_messages` for any JS errors during these interactions.

If step 3 doesn't produce a native selection (e.g. the browser's default drag-selection is being suppressed elsewhere), investigate whether another handler (e.g. Phase 1's resize-handle or drag machinery) is calling `preventDefault()` on the same event bubbling path, and adjust — this is exactly the uncertainty this spike exists to catch.

- [ ] **Step 5: Commit**

```bash
git add static/ui-text-selection.js static/ui-text-interaction.js static/index.html
git commit -m "feat: add selection-offset utility + hit-test drag-vs-select for rich-text formatting"
```

---

### Task 4: ASS export — per-run inline override tags

**Files:**
- Modify: `app/ass_render.py`
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `FormatRun` (Task 1), `wrap_text_runs` (Task 2).
- Produces: `_wrapped_lines_and_size(b, p, weight=None)` now always returns a 4-tuple `(text, width, height, line_spans)` (was 3-tuple) — `line_spans: list[tuple[int, int]]`, offsets into `b.heading`, empty when there's no wrapping info needed (single-line fit mode still returns one span covering the whole heading). `_block_dialogue` emits per-run inline override tags when `b.formatting_runs` is non-empty; a block with no runs renders byte-for-byte identically to today. Task 5 (highlight rects) consumes `_wrapped_lines_and_size`'s new `line_spans` return value and a new `_measure_range_for(b, p, weight)` helper this task also adds.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py`:

```python
from app.models import FormatRun

def test_block_dialogue_with_no_runs_is_unchanged():
    pr = TextPreset(name="Pop", size_px=96)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="PLAIN TEXT", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "box" not in l)
    assert "PLAIN TEXT" in line
    assert "\\fn" not in line  # no per-run override tags when there are no runs

def test_block_dialogue_with_one_run_emits_override_and_reset_tags():
    pr = TextPreset(name="Pop", font="Public Sans", size_px=96, color="#FFFFFF", weight=400)
    run = FormatRun(start=0, end=3, color="#FF0000", weight=700)  # "BIG" in "BIG NEWS"
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "BIG" in l)
    assert "\\1c&H0000FF&" in line              # _ass_override_color("#FF0000") == "&H0000FF&" (BGR)
    assert "\\fnPublic Sans Bold" in line       # run's overridden weight face
    assert "\\fnPublic Sans Regular" in line    # reset back to base style after the run ends
    assert line.index("BIG") < line.index("NEWS")

def test_block_dialogue_run_preserves_unstyled_text_around_it():
    pr = TextPreset(name="Pop")
    run = FormatRun(start=4, end=8, color="#00FF00")  # "NEWS" in "BIG NEWS TODAY"
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS TODAY", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "TODAY" in l)
    assert "BIG " in line and "NEWS" in line and " TODAY" in line
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: FAIL — `ImportError: cannot import name 'FormatRun'` from the test's import line resolves fine (added in Task 1), but the two new run-specific tests fail because no `\fn` override tags are emitted yet.

- [ ] **Step 3: Implement per-run tags in `app/ass_render.py`**

Add `from app.font_metrics import wrap_text_runs` to the existing font_metrics import line at the top of the file.

Replace `_wrapped_lines_and_size` with a version that also returns line spans, and add `_measure_range_for` + `_run_style_tag` + a helper to build the tagged Dialogue text:

```python
def _measure_range_for(b, p: TextPreset, weight: int) -> Callable[[int, int], float]:
    """Builds a measure_range(start, end) callable over b.heading that's aware of
    b.formatting_runs — a range spanning multiple runs (or run + unstyled text) is split at
    each run boundary and measured with that piece's own font/size/weight, then summed."""
    base_measure = pil_font_measurer(p.font, p.size_px, weight)
    if not b.formatting_runs:
        return lambda s, e: base_measure(b.heading[s:e])

    boundaries = sorted({0, len(b.heading)} | {r.start for r in b.formatting_runs} | {r.end for r in b.formatting_runs})
    measurer_cache: dict[tuple[str, int, int], Callable[[str], float]] = {}

    def measurer_for(pos: int) -> Callable[[str], float]:
        run = next((r for r in b.formatting_runs if r.start <= pos < r.end), None)
        font = (run.font if run and run.font else p.font)
        size = (run.size_px if run and run.size_px else p.size_px)
        rweight = nearest_available_weight(font, run.weight if run and run.weight else weight)
        key = (font, size, rweight)
        if key not in measurer_cache:
            measurer_cache[key] = pil_font_measurer(*key)
        return measurer_cache[key]

    def measure_range(start: int, end: int) -> float:
        total = 0.0
        pos = start
        for b_end in boundaries:
            if b_end <= pos:
                continue
            seg_end = min(b_end, end)
            if seg_end > pos:
                total += measurer_for(pos)(b.heading[pos:seg_end])
                pos = seg_end
            if pos >= end:
                break
        return total

    return measure_range

def _wrapped_lines_and_size(b, p: TextPreset, weight: int | None = None) -> tuple[str, float, float, list[tuple[int, int]]]:
    weight = weight if weight is not None else _resolved_weight(p)
    measure_range = _measure_range_for(b, p, weight)
    pad_x = BOX_PAD_X_EM * p.size_px * 2
    pad_y = BOX_PAD_Y_EM * p.size_px * 2
    width_fixed = p.box_width_mode in ("fixed", "fill")
    height_fixed = p.box_height_mode in ("fixed", "fill")
    if width_fixed:
        text, spans = wrap_text_runs(b.heading, measure_range, max(1, p.box_width - pad_x))
    else:
        text = b.heading
        spans = [(0, len(b.heading))] if "\n" not in b.heading else _spans_for_hard_breaks(b.heading)
    lines = text.split("\n")
    width = p.box_width if width_fixed else max(measure_range(s, e) for s, e in spans) + pad_x
    height = p.box_height if height_fixed else len(lines) * p.size_px * LINE_HEIGHT + pad_y
    return text, width, height, spans

def _spans_for_hard_breaks(text: str) -> list[tuple[int, int]]:
    spans = []
    pos = 0
    for line in text.split("\n"):
        spans.append((pos, pos + len(line)))
        pos += len(line) + 1
    return spans
```

Add `from typing import Callable` to the top imports.

Update `_box_dialogue` (only its unpacking changes):

```python
def _box_dialogue(b, p: TextPreset, weight: int | None = None) -> str | None:
    if not p.box_background and p.box_border_width <= 0:
        return None
    _, width, height, _ = _wrapped_lines_and_size(b, p, weight)
    ...  # rest unchanged
```

Replace `_block_dialogue` with a version that emits per-run tags:

```python
def _run_style_tag(p: TextPreset, run: "FormatRun | None") -> str:
    """Full ASS override tag switching to a run's effective style (base preset + this run's
    sparse overrides), or back to the base style when run is None. Always emits every field
    rather than a diff against the previous state, so each run's tag is self-contained and the
    reset-to-base tag after a run ends never has to remember what came before it."""
    font = (run.font if run and run.font else p.font)
    size = (run.size_px if run and run.size_px else p.size_px)
    weight = nearest_available_weight(font, run.weight if run and run.weight else p.weight)
    color = (run.color if run and run.color else p.color)
    outline_color = (run.outline_color if run and run.outline_color else p.outline_color)
    outline_px = (run.outline_px if run and run.outline_px is not None else p.outline_px)
    italic = (run.italic if run and run.italic is not None else p.italic)
    underline = (run.underline if run and run.underline is not None else p.underline)
    fontname = f"{font} {WEIGHT_LABELS[weight]}"
    return (f"\\fn{fontname}\\fs{size}\\1c{_ass_override_color(color)}\\3c{_ass_override_color(outline_color)}"
            f"\\bord{outline_px}\\i{1 if italic else 0}\\u{1 if underline else 0}")

def _run_at(runs: list, offset: int):
    return next((r for r in runs if r.start <= offset < r.end), None)

def _tagged_text(b, p: TextPreset, text: str) -> str:
    """text is the wrapped output of _wrapped_lines_and_size — same length as b.heading except
    word-break spaces have become \\n in place, so offsets into b.heading still line up 1:1."""
    out = []
    active = "unset"
    for i, ch in enumerate(text):
        run = _run_at(b.formatting_runs, i)
        if run is not active:
            out.append(f"{{{_run_style_tag(p, run)}}}")
            active = run
        out.append("\\N" if ch == "\n" else ch)
    return "".join(out)

def _block_dialogue(b, p: TextPreset, weight: int | None = None) -> str:
    fx = f"\\pos({p.x},{p.y})"
    if p.entrance == "fade_pop":
        fx += "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    text, _, _, _ = _wrapped_lines_and_size(b, p, weight)
    if b.formatting_runs:
        body = _tagged_text(b, p, text)
    else:
        body = text.replace("\n", "\\N")
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{body}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: PASS, all tests including the 3 new ones. If a specific assertion in `test_block_dialogue_with_one_run_emits_override_and_reset_tags` fails on the exact color-tag string, adjust the assertion to check for the substring your `_ass_override_color("#FF0000")` actually produces (`&H0000FF&`) rather than guessing — run `python -c "from app.ass_render import _ass_override_color; print(_ass_override_color('#FF0000'))"` to confirm.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS — pay particular attention to existing Box-related tests (`test_ffmpeg_cmd.py`, other `test_ass_render.py` box tests) since `_wrapped_lines_and_size`'s return signature changed from 3-tuple to 4-tuple; every call site was updated in this task (`_box_dialogue`, `_block_dialogue`) but double check no other file calls it directly.

Run: `.venv/Scripts/python -c "import app.ffmpeg_cmd"` (import smoke check — `_wrapped_lines_and_size` isn't imported there, but confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: emit per-run inline ASS override tags for rich-text formatting"
```

---

### Task 5: ASS export — multi-line highlight rectangles

**Files:**
- Modify: `app/ass_render.py`
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `_wrapped_lines_and_size`'s `line_spans` and `_measure_range_for` (both from Task 4).
- Produces: `_highlight_dialogues(b, p, weight=None) -> list[str]` — zero or more `Dialogue:` lines, one per (highlighted run × visual line it touches). `render_ass` calls this and appends the results for every block, before that block's `_block_dialogue` line (so highlight rectangles render underneath the text, same layering as `_box_dialogue`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py`:

```python
def test_no_highlight_runs_emits_no_highlight_dialogues():
    pr = TextPreset(name="Pop")
    run = FormatRun(start=0, end=3, color="#FF0000")  # not highlighted
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    assert "hl0" not in out

def test_highlighted_run_on_single_line_emits_one_rectangle():
    pr = TextPreset(name="Pop", x=100, y=200, size_px=50, box_width_mode="fit")
    run = FormatRun(start=0, end=3, highlight=True, highlight_color="#00FF00")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    highlight_lines = [l for l in out.splitlines() if "hl0" in l]
    assert len(highlight_lines) == 1
    assert "\\p1" in highlight_lines[0]

def test_highlighted_run_spanning_two_wrapped_lines_emits_two_rectangles():
    pr = TextPreset(name="Pop", x=0, y=0, size_px=20, box_width_mode="fixed", box_width=90)
    # Force a wrap between "BIG" and "NEWS TODAY" by constraining box_width tightly; the
    # highlighted run covers "NEWS TODAY" which the fixed width should split across 2 lines.
    run = FormatRun(start=4, end=14, highlight=True)  # "NEWS TODAY"
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS TODAY", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    highlight_lines = [l for l in out.splitlines() if "hl" in l and l.startswith("Dialogue:")]
    assert len(highlight_lines) == 2

def test_highlighted_run_from_base_preset_default():
    pr = TextPreset(name="Pop", highlight=True, highlight_color="#0000FF")
    run = FormatRun(start=0, end=3)  # no per-run highlight override — falls through to preset default
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    assert any("hl0" in l for l in out.splitlines())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: FAIL — `AttributeError`/`NameError` around `_highlight_dialogues` not existing, or the new tests finding no `hl` lines.

- [ ] **Step 3: Implement `_highlight_dialogues`**

Add to `app/ass_render.py`:

```python
HIGHLIGHT_RADIUS = 4

def _highlight_dialogues(b, p: TextPreset, weight: int | None = None) -> list[str]:
    if not b.formatting_runs:
        return []
    weight = weight if weight is not None else _resolved_weight(p)
    measure_range = _measure_range_for(b, p, weight)
    _, _, _, line_spans = _wrapped_lines_and_size(b, p, weight)
    out = []
    for run_i, run in enumerate(b.formatting_runs):
        highlighted = run.highlight if run.highlight is not None else p.highlight
        if not highlighted:
            continue
        color = run.highlight_color or p.highlight_color
        fill = _ass_override_color(color)
        for line_i, (line_start, line_end) in enumerate(line_spans):
            s, e = max(run.start, line_start), min(run.end, line_end)
            if s >= e:
                continue
            line_width = measure_range(line_start, line_end)
            if p.align == "left":
                left_origin = p.x
            elif p.align == "right":
                left_origin = p.x - line_width
            else:
                left_origin = p.x - line_width / 2
            x_offset = measure_range(line_start, s)
            rect_width = measure_range(s, e)
            rect_height = p.size_px * LINE_HEIGHT
            top = p.y + line_i * rect_height
            path = _rounded_rect_path(rect_width, rect_height, HIGHLIGHT_RADIUS)
            fx = f"\\an7\\pos({left_origin + x_offset:.0f},{top:.0f})\\1a&H00&\\3a&HFF&\\1c{fill}\\p1"
            out.append(f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},"
                        f"P{p.id[:8]}hl{run_i}_{line_i},,0,0,0,,{{{fx}}}{path}{{\\p0}}")
    return out
```

Wire it into `render_ass`'s block loop — find the existing loop:

```python
    for b in blocks:
        p = presets[b.preset_id]
        weight = _resolved_weight(p)
        box_line = _box_dialogue(b, p, weight)
        if box_line:
            event_lines.append(box_line)
        event_lines.append(_block_dialogue(b, p, weight))
```

and insert the highlight rectangles between the box line and the text line (highlight sits above the box background but below the glyphs):

```python
    for b in blocks:
        p = presets[b.preset_id]
        weight = _resolved_weight(p)
        box_line = _box_dialogue(b, p, weight)
        if box_line:
            event_lines.append(box_line)
        event_lines.extend(_highlight_dialogues(b, p, weight))
        event_lines.append(_block_dialogue(b, p, weight))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: PASS, all tests including the 4 new ones. If `test_highlighted_run_spanning_two_wrapped_lines_emits_two_rectangles` doesn't actually produce 2 wrapped lines with the chosen `box_width=90`/`size_px=20`, adjust those numbers (measure via `python -c` against `pil_font_measurer("Public Sans", 20, 400)` to pick a width that reliably wraps "NEWS TODAY" onto its own line split in two) rather than the assertion.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: emit per-visual-line ASS highlight rectangles for rich-text formatting"
```

---

### Task 6: `preview.js` span-per-run rendering

**Files:**
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `TextBlockLayer.formatting_runs` shape from Task 1 (JSON: `{start, end, font?, size_px?, color?, outline_color?, outline_px?, weight?, italic?, underline?, highlight?, highlight_color?}`).
- Produces: `renderText()`'s per-block div now contains one `<span class="text-run">` per run-boundary segment instead of a raw `textContent` string. A block with `formatting_runs: []` renders one span covering the whole heading, styled identically to today's div-level styling — this must be visually indistinguishable from before the task (verified by screenshot comparison in Step 3).

This task has no backend pytest cycle — verified manually in the browser.

- [ ] **Step 1: Locate and understand the current single-content render**

Read `static/preview.js` lines 220 (`div.textContent = block.heading;`) through the surrounding style-setting block (lines ~186-222) — this is the exact code being replaced. The div-level style properties that are *not* run-specific (position, box background/border, box sizing, alignment, padding) stay on `div` unchanged; only text-content and the per-character-styled properties (`color`, `font-family`, `font-weight`, `font-style`, `text-decoration`, highlight background, `outline` via `-webkit-text-stroke`) move to per-run spans.

- [ ] **Step 2: Replace the text-content line with span-per-run rendering**

Replace `div.textContent = block.heading;` (and remove the div-level `div.style.color`, `div.style.fontFamily`, `div.style.fontWeight`, `div.style.fontStyle`, `div.style.textDecoration`, `div.style.webkitTextStroke` lines — those move onto each span) with:

```javascript
      div.style.whiteSpace = widthIsBoxed ? "pre-wrap" : "pre";
      div.style.boxSizing = "border-box";

      const outlinePxScaled = preset.outline_px / 1920 * stageH;
      const runs = (block.formatting_runs && block.formatting_runs.length) ? block.formatting_runs : [];
      const heading = block.heading || "";
      let pos = 0;
      const boundaries = [...new Set([0, heading.length, ...runs.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b);
      div.textContent = "";
      for (let i = 0; i < boundaries.length - 1; i++) {
        const segStart = boundaries[i], segEnd = boundaries[i + 1];
        if (segStart >= segEnd) continue;
        const run = runs.find((r) => r.start <= segStart && segEnd <= r.end);
        const span = document.createElement("span");
        span.className = "text-run";
        span.textContent = heading.slice(segStart, segEnd);
        span.style.color = (run && run.color) || preset.color;
        span.style.fontFamily = `"${(run && run.font) || preset.font}", sans-serif`;
        span.style.fontWeight = String((run && run.weight) || preset.weight);
        span.style.fontStyle = (run && run.italic != null ? run.italic : preset.italic) ? "italic" : "normal";
        span.style.textDecoration = (run && run.underline != null ? run.underline : preset.underline) ? "underline" : "none";
        span.style.webkitTextStroke = `${outlinePxScaled}px ${(run && run.outline_color) || preset.outline_color}`;
        const highlighted = run && run.highlight != null ? run.highlight : preset.highlight;
        span.style.backgroundColor = highlighted ? ((run && run.highlight_color) || preset.highlight_color) : "transparent";
        div.appendChild(span);
      }
      if (!heading) { div.style.minWidth = "40px"; div.style.minHeight = "1em"; } // stay clickable while empty
```

Note this keeps the existing `if (!block.heading) { div.style.minWidth ...}` check (previously right after `div.textContent = block.heading;`) — it's now folded into the block above since `heading` is already computed.

- [ ] **Step 3: Manual verification — zero-run blocks render identically**

Run: start the dev server via `preview_start` (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open the editor.

1. Create a text block with a plain heading, no formatting runs (the default — this feature has no UI to create runs yet, that's Task 7). Take a screenshot.
2. Compare against a screenshot taken before this task's change (or reason about it directly: with `formatting_runs = []`, `boundaries = [0, heading.length]`, exactly one span is created covering the whole string with every style falling through to `preset.*` — identical to the old div-level styling). Confirm via `read_page`/`javascript_tool` that `getComputedStyle` on the rendered text matches expectations (color, font, weight).
3. Check `read_console_messages` for errors.

- [ ] **Step 4: Manual verification — multi-run rendering (using a temporary console-injected run)**

Since Task 7 (the FONT-accordion UI for creating runs) hasn't landed yet, verify span rendering directly via `javascript_tool`:

```javascript
// Injects a test run into the first text block and re-renders, to visually confirm span styling
// without needing the not-yet-built selection UI.
const proj = window.__debugProject || null; // adjust to however editor.js exposes the current project if no global exists — check editor.js for the module-level project variable name
```

If `editor.js` doesn't expose the project object globally, instead add a temporary one-line `console.log` inside `renderText()` right before the span loop (`console.log("DEBUG runs", block.formatting_runs)`), then in the browser console directly mutate `block.formatting_runs` isn't reachable without a global — simplest path: temporarily hardcode a test run in `renderText()` (e.g. `const runs = [{start: 0, end: 3, color: "#FF0000", weight: 700}];` in place of the `runs` line), reload, screenshot, confirm the first 3 characters render bold and red while the rest render in the base style, **then revert that hardcoded line** before committing.

- [ ] **Step 5: Commit**

```bash
git add static/preview.js
git commit -m "feat: render text-block headings as one span per formatting run"
```

---

### Task 7: FONT accordion selection-awareness

**Files:**
- Modify: `static/preview.js` (wire `onSelectionChange` from Task 3 into a module-level "active selection" state)
- Modify: `static/text-panel-font-style.js`
- Modify: `static/editor.js` (only the `Preview.setSelectedTextBlock(...)` callback object, to pass through `onSelectionChange`)

**Interfaces:**
- Consumes: `onSelectionChange` callback shape from Task 3, `FormatRun` JSON shape from Task 1, span rendering from Task 6.
- Produces: `Preview.getActiveFormatSelection() -> {blockId, start, end} | null` (new exported function on the `Preview` module) — the currently active non-collapsed selection, if any, cleared whenever the selected text block changes or the selection collapses. FONT accordion controls (`text-panel-font-style.js`'s color/outline/size, `text-panel-font-weight.js`'s weight, italic/underline toggles) check this before writing to the base preset.

- [ ] **Step 1: Track selection state in `preview.js`**

In `static/preview.js`, find `setSelectedTextBlock` (referenced in the file's header comment and called from `editor.js`). Add a module-level `let activeFormatSelection = null;` near the other module-level state (`editingBlockId`, `editingDiv`), and inside the function that wires `boxResizeCallbacks` (the object passed to `setSelectedTextBlock`), add a wrapper that:
- Clears `activeFormatSelection` whenever `setSelectedTextBlock` is called with a different block id than the currently tracked one.
- Sets `activeFormatSelection = { blockId, start, end }` when the callback object's `onSelectionChange` fires (wired in the `UI.textInteraction(div, { ... })` call added in Task 6/3).

Update the `UI.textInteraction(div, {...})` call (from Task 3's `onSelectionChange` addition) to include:

```javascript
        onSelectionChange: (offsets) => {
          activeFormatSelection = { blockId: block.id, start: offsets.start, end: offsets.end };
          if (boxResizeCallbacks && boxResizeCallbacks.onSelectionChange) boxResizeCallbacks.onSelectionChange(activeFormatSelection);
        },
```

Add to the module's public return object (find the existing `return { load, locate, ... }` at the bottom of the file):

```javascript
  function getActiveFormatSelection() {
    return activeFormatSelection;
  }
```

and add `getActiveFormatSelection` to the returned object.

- [ ] **Step 2: Clear selection state on block switch**

Find where `selectedTextBlockId` is set (inside `setSelectedTextBlock`). Add, at the top of that function:

```javascript
    if (blockId !== selectedTextBlockId) activeFormatSelection = null;
```

- [ ] **Step 3: Write a `FormatRun` write helper and wire it into FONT accordion controls**

In `static/text-panel-font-style.js`, add a helper near the top of the IIFE:

```javascript
  function upsertFormatRun(block, start, end, field, value) {
    // Runs never overlap: this splits/merges as needed by first removing any existing run whose
    // range exactly matches [start, end) (the common case: re-editing the same selection), then
    // pushing a fresh run for it. Overlapping-but-not-identical ranges are out of scope for v1 —
    // the UI only ever selects fresh ranges via the browser's native Selection API, so exact-range
    // re-edits are the only overlap case that occurs in practice.
    block.formatting_runs = block.formatting_runs || [];
    let run = block.formatting_runs.find((r) => r.start === start && r.end === end);
    if (!run) {
      run = { start, end };
      block.formatting_runs.push(run);
    }
    run[field] = value;
  }
```

Update each control's `onChange` to check `Preview.getActiveFormatSelection()` first. For example, the color swatch:

```javascript
    UI.colorSwatch(document.getElementById("text-color-field"),
      { label: "Color", value: preset.color,
        onChange: (v) => {
          const block = ensureTextBlock();
          const sel = Preview.getActiveFormatSelection();
          if (sel && sel.blockId === block.id) {
            upsertFormatRun(block, sel.start, sel.end, "color", v);
          } else {
            preset.color = v;
          }
          saveProject();
          renderTextPreview();
        } });
```

Apply the same pattern to `text-outline-color-field`'s `onChange` (field `"outline_color"`), `text-outline-px-field`'s `onChange` (field `"outline_px"`), and `text-size-field`'s `onChange` (field `"size_px"`) in this file. Also apply it to the two `wireTextStyleToggle` calls (`text-italic` → field `"italic"`, `text-underline` → field `"underline"`) — since those read/flip `preset[prop]` directly, change `wireTextStyleToggle` to:

```javascript
  function wireTextStyleToggle(id, prop) {
    const btn = document.getElementById(id);
    btn.addEventListener("click", async () => {
      const block = ensureTextBlock();
      const preset = ensureTextPreset(block.preset_id);
      const sel = Preview.getActiveFormatSelection();
      if (sel && sel.blockId === block.id) {
        const current = block.formatting_runs.find((r) => r.start === sel.start && r.end === sel.end);
        const currentValue = (current && current[prop] != null) ? current[prop] : preset[prop];
        upsertFormatRun(block, sel.start, sel.end, prop, !currentValue);
      } else {
        preset[prop] = !preset[prop];
        btn.setAttribute("aria-pressed", String(preset[prop]));
      }
      await saveProject();
      renderTextPreview();
    });
  }
```

- [ ] **Step 4: Wire `weight` similarly in `static/text-panel-font-weight.js`**

Read `static/text-panel-font-weight.js` to find its `onChange`/click handler that sets `preset.weight`, and apply the same `Preview.getActiveFormatSelection()` branch (field `"weight"`) as Step 3.

- [ ] **Step 5: Manual verification**

Using the preview browser:
1. Type a heading, click-drag to select part of it (using Task 3's new selection behavior).
2. Change color in the FONT accordion — confirm only the selected characters change color on the stage (via Task 6's span rendering), the rest stays the base preset color.
3. Click elsewhere to collapse the selection, change color again — confirm the whole block's base color changes this time (old behavior).
4. Re-select the exact same range and change weight — confirm it updates the same run (not a duplicate) by checking `block.formatting_runs.length` stays 1 via `javascript_tool`.
5. Check `read_console_messages` for errors.

- [ ] **Step 6: Commit**

```bash
git add static/preview.js static/text-panel-font-style.js static/text-panel-font-weight.js
git commit -m "feat: FONT accordion writes per-range FormatRuns when a text selection is active"
```

---

### Task 8: STYLE preset apply clears `formatting_runs`

**Files:**
- Modify: `static/text-panel-style.js`

**Interfaces:**
- Consumes: `TextBlockLayer.formatting_runs` (Task 1).
- Produces: no new exports — behavior-only change to the existing `applySavedPreset` function.

This task has no backend pytest cycle — verified manually in the browser.

- [ ] **Step 1: Clear runs in `applySavedPreset`**

In `static/text-panel-style.js`, modify `applySavedPreset`:

```javascript
  async function applySavedPreset(saved) {
    const block = ensureTextBlock();
    const preset = ensureTextPreset(block.preset_id);
    Object.assign(preset, styleFieldsOf(saved));
    block.formatting_runs = [];   // a saved preset is "reset to this whole look" — clears any per-range overrides
    saved.usage_count = (saved.usage_count || 0) + 1;
    await Api.savePreset(saved);
    await saveProject();
    await loadSavedPresets();
    renderTextPanel();
    closeStylePanel();
  }
```

- [ ] **Step 2: Manual verification**

1. Create a text block, select part of its heading, apply a color override (using Task 7's flow) so `formatting_runs` is non-empty.
2. Apply a saved STYLE preset from the STYLE accordion.
3. Via `javascript_tool`, confirm the block's `formatting_runs` is now `[]` and the stage shows the preset's flat style with no leftover colored range.

- [ ] **Step 3: Commit**

```bash
git add static/text-panel-style.js
git commit -m "fix: applying a saved STYLE preset clears existing formatting_runs"
```

---

### Task 9: End-to-end verification + finishing branch

**Files:** none (verification only)

- [ ] **Step 1: Full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass, including every test added in Tasks 1, 2, 4, 5.

- [ ] **Step 2: Full manual walkthrough in the browser**

Using the preview tools:
1. Create a text block, type a multi-word heading.
2. Select part of it, change size/color/weight/italic/underline — confirm only the selection changes live on the stage.
3. Toggle highlight on that same selection, confirm a colored background appears behind exactly the selected glyphs.
4. Resize the box narrow enough to force the highlighted range to wrap across two lines — confirm the highlight background follows correctly on both lines (no gap, no overflow).
5. Confirm a block with zero formatting runs still renders and behaves exactly as it did before this phase (drag-to-move on padding, click-to-edit, plain color/size changes when nothing is selected).
6. Export the project (`EXPORT` panel) and inspect the resulting mp4: confirm the rendered video visually matches the preview for the mixed-formatting block, including the wrapped-line highlight.

- [ ] **Step 3: Update `CLAUDE.md`'s inventory**

Add/update entries in `CLAUDE.md`'s File Structure and Inventory sections for: `app/models.py` (`FormatRun`, `TextBlockLayer.formatting_runs`, `TextPreset.highlight`), `app/font_metrics.py` (`wrap_text_runs`), `app/ass_render.py` (`_measure_range_for`, `_run_style_tag`, `_tagged_text`, `_highlight_dialogues`, `_wrapped_lines_and_size`'s new 4-tuple return), `static/ui-text-selection.js` (new file), `static/ui-text-interaction.js` (hit-test change + `onSelectionChange`), `static/preview.js` (span-per-run rendering, `getActiveFormatSelection`), `static/text-panel-font-style.js`/`static/text-panel-font-weight.js` (selection-aware writes), `static/text-panel-style.js` (clears runs on apply).

- [ ] **Step 4: Commit the CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md inventory for Phase 5 rich-text formatting"
```

- [ ] **Step 5: Run `superpowers:finishing-a-development-branch`**

Follow that skill to decide how to integrate this work (merge to main locally + push, open a PR, or other options it presents).
