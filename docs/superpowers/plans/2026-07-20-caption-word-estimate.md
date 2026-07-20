# Caption Per-Word Timing Estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karaoke caption highlighting sweeps word-by-word across a multi-word caption entry (e.g. `"talks about this"`) instead of lighting the whole phrase at once, by estimating each word's start/end time from its character position within the entry's own duration.

**Architecture:** One pure function, `estimate_word_timings`, mirrored in Python (`app/caption_word_estimate.py`) and JS (`static/caption-word-estimate.js`). It expands a single `CaptionWord` (which may hold multiple space-separated words) into one synthetic `CaptionWord` per word, with `t_start`/`t_end` linearly interpolated by character offset within the entry's `[t_start, t_end]`. It is wired into the single existing choke point both sides already have — `app/ass_render.py`'s `group_words` and `static/timeline.js`'s `groupWords` — so every current caller (preview highlighting, timeline CAPTIONS row, playhead snapping, ASS export) picks it up with zero other call-site changes.

**Tech Stack:** Python (Pydantic `CaptionWord` model), vanilla JS (`window.Timeline` object), pytest.

## Global Constraints

- No new Pydantic fields or data model changes — `CaptionWord.text`/`t_start`/`t_end` already support this (per spec's Data model section).
- A single-word entry must produce an output identical in timing to the input (real transcription output is unaffected) — verified by test.
- Every file this plan creates or touches must keep/gain its 2-3 line header comment and be reflected in `CLAUDE.md`'s codebase map in the same commit that introduces it (per `CLAUDE.md`'s File structure / Codebase map rules).
- `pytest -q` must stay green after every task.

---

### Task 1: `app/caption_word_estimate.py` — the estimation function

**Files:**
- Create: `app/caption_word_estimate.py`
- Test: `tests/test_caption_word_estimate.py`

**Interfaces:**
- Produces: `estimate_word_timings(word: CaptionWord) -> list[CaptionWord]` — takes one `CaptionWord`, returns zero or more synthetic `CaptionWord` instances covering estimated per-word sub-ranges within `[word.t_start, word.t_end]`. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_caption_word_estimate.py`:

```python
# Tests for app.caption_word_estimate's estimate_word_timings: single-word passthrough,
# multi-word proportional split by character offset, and empty/whitespace-only text.
from app.models import CaptionWord
from app.caption_word_estimate import estimate_word_timings

def w(t, a, b): return CaptionWord(text=t, t_start=a, t_end=b)

def test_single_word_is_unchanged():
    result = estimate_word_timings(w("hi", 1.0, 1.5))
    assert len(result) == 1
    assert result[0].text == "hi"
    assert result[0].t_start == 1.0
    assert result[0].t_end == 1.5

def test_multi_word_splits_proportionally_by_character_length():
    # "talks about this" -> normalized "talks about this" (len 16):
    # "talks" chars 0-5, "about" chars 6-11, "this" chars 12-16
    result = estimate_word_timings(w("talks about this", 0.0, 3.0))
    assert [r.text for r in result] == ["talks", "about", "this"]
    assert result[0].t_start == 0.0
    assert result[0].t_end == 3.0 * 5 / 16
    assert result[1].t_start == 3.0 * 6 / 16
    assert result[1].t_end == 3.0 * 11 / 16
    assert result[2].t_start == 3.0 * 12 / 16
    assert result[2].t_end == 3.0

def test_multi_word_longer_word_gets_longer_window():
    result = estimate_word_timings(w("talks about this", 0.0, 3.0))
    windows = {r.text: r.t_end - r.t_start for r in result}
    assert windows["talks"] == windows["about"]  # both 5 chars
    assert windows["talks"] > windows["this"]     # 5 chars > 4 chars

def test_empty_text_returns_empty_list():
    assert estimate_word_timings(w("", 0.0, 1.0)) == []

def test_whitespace_only_text_returns_empty_list():
    assert estimate_word_timings(w("   ", 0.0, 1.0)) == []

def test_result_words_are_sequential_and_non_overlapping():
    result = estimate_word_timings(w("one two three four", 10.0, 14.0))
    for a, b in zip(result, result[1:]):
        assert a.t_end == b.t_start
    assert result[0].t_start == 10.0
    assert result[-1].t_end == 14.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_caption_word_estimate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.caption_word_estimate'`

- [ ] **Step 3: Write the implementation**

Create `app/caption_word_estimate.py`:

```python
# Splits a multi-word CaptionWord (e.g. "talks about this" authored as one subtitle chunk)
# into per-word estimated sub-ranges, interpolated by character offset within its own
# [t_start, t_end]; a single-word entry passes through unchanged.
# Exposes estimate_word_timings. Consumed by app.ass_render.group_words. Depends on app.models.
from app.models import CaptionWord

def estimate_word_timings(word: CaptionWord) -> list[CaptionWord]:
    tokens = word.text.split()
    if not tokens:
        return []
    normalized = " ".join(tokens)
    total_len = len(normalized)
    duration = word.t_end - word.t_start
    result = []
    offset = 0
    for i, token in enumerate(tokens):
        start_frac = offset / total_len
        end_frac = (offset + len(token)) / total_len
        result.append(CaptionWord(
            id=f"{word.id}-{i}",
            text=token,
            t_start=word.t_start + start_frac * duration,
            t_end=word.t_start + end_frac * duration,
        ))
        offset += len(token) + 1
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_caption_word_estimate.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, find the line listing `app/transcribe.py` under the file structure tree (near the other `app/*.py` one-line entries) and add a line directly after it:

```
  caption_word_estimate.py # pure estimate_word_timings(word) -> list[CaptionWord]: splits a multi-word CaptionWord into per-word estimated sub-ranges, character-offset-proportional
```

Then find `- \`app/transcribe.py\` — ...` in the Inventory section's "Captions & transcription" feature block and add directly after it:

```
- `app/caption_word_estimate.py` — `estimate_word_timings(word: CaptionWord) -> list[CaptionWord]` (pure): splits a multi-word entry into per-word sub-ranges by character-offset interpolation within the entry's own `[t_start, t_end]`; a single-word entry passes through unchanged. Consumed by `app/ass_render.py`'s `group_words`.
```

- [ ] **Step 6: Commit**

```bash
git add app/caption_word_estimate.py tests/test_caption_word_estimate.py CLAUDE.md
git commit -m "feat: add estimate_word_timings for multi-word caption entries"
```

---

### Task 2: Wire into `app/ass_render.py`'s `group_words`

**Files:**
- Modify: `app/ass_render.py:246-248` (the `group_words` function)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `estimate_word_timings(word: CaptionWord) -> list[CaptionWord]` from Task 1 (`app.caption_word_estimate`).
- Produces: `group_words` keeps its existing signature `group_words(words: list[CaptionWord], max_words: int) -> list[list[CaptionWord]]`, now expanding multi-word entries before grouping. No other function in `app/ass_render.py` changes.

- [ ] **Step 1: Write the failing test**

In `tests/test_ass_render.py`, add after `test_group_words_empty` (around line 250):

```python
def test_group_words_expands_multi_word_entries():
    from app.ass_render import group_words
    words = [w("talks about this", 0.0, 3.0)]
    groups = group_words(words, max_words=4)
    assert len(groups) == 1
    assert [x.text for x in groups[0]] == ["talks", "about", "this"]

def test_group_words_expansion_still_respects_max_words():
    from app.ass_render import group_words
    # "a b c" expands to 3 words; combined with 2 more single-word entries that's 5 total
    words = [w("a b c", 0.0, 1.5), w("d", 1.5, 2.0), w("e", 2.0, 2.5)]
    groups = group_words(words, max_words=4)
    assert [len(g) for g in groups] == [4, 1]
```

And add, after `test_current_word_emits_one_dialogue_per_word_with_inline_override` (around line 282):

```python
def test_render_caption_ass_expands_multi_word_entry_into_karaoke_segments():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", highlight_mode="progressive_fill", max_words_per_line=4)
    p = Project(name="r", captions=CaptionTrack(words=[w("talks about this", 0.0, 3.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if "talks" in l)
    assert line.count("{\\k") == 3
    assert "talks" in line and "about" in line and "this" in line
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v -k "expand"`
Expected: FAIL — `test_group_words_expands_multi_word_entries` and `test_group_words_expansion_still_respects_max_words` fail because `groups[0]` still contains the single unexpanded `"talks about this"` entry; `test_render_caption_ass_expands_multi_word_entry_into_karaoke_segments` fails because the line has only 1 `{\k` segment, not 3.

- [ ] **Step 3: Wire in the expansion**

In `app/ass_render.py`, add the import at the top (after the existing `from app.models import ...` line, ~line 4):

```python
from app.caption_word_estimate import estimate_word_timings
```

Replace the `group_words` function (currently lines 246-248):

```python
def group_words(words: list[CaptionWord], max_words: int) -> list[list[CaptionWord]]:
    sorted_words = sorted(words, key=lambda w: w.t_start)
    return [sorted_words[i:i + max_words] for i in range(0, len(sorted_words), max_words)]
```

with:

```python
def group_words(words: list[CaptionWord], max_words: int) -> list[list[CaptionWord]]:
    expanded = [w for word in words for w in estimate_word_timings(word)]
    sorted_words = sorted(expanded, key=lambda w: w.t_start)
    return [sorted_words[i:i + max_words] for i in range(0, len(sorted_words), max_words)]
```

- [ ] **Step 4: Run the full ass_render test file to verify everything passes**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: PASS, all tests including the 3 new ones and the pre-existing `test_group_words_respects_max_words`/`test_group_words_sorts_by_start_time`/`test_group_words_empty` (all of which use single-word entries and are unaffected by expansion).

- [ ] **Step 5: Run the full suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, no regressions.

- [ ] **Step 6: Update the codebase map**

In `CLAUDE.md`'s Inventory section, find the line:

```
- `app/ass_render.py` — `group_words(words, max_words)` (pure), `render_caption_ass(project, preset)`: standalone ASS script — one `Caption` style + karaoke dialogue, `progressive_fill` via native `\k` sweep, `current_word` via per-word `\1c` override.
```

Replace it with:

```
- `app/ass_render.py` — `group_words(words, max_words)` (pure; expands each `CaptionWord` through `app.caption_word_estimate.estimate_word_timings` before sorting/chunking, so multi-word entries split into per-word groups), `render_caption_ass(project, preset)`: standalone ASS script — one `Caption` style + karaoke dialogue, `progressive_fill` via native `\k` sweep, `current_word` via per-word `\1c` override.
```

- [ ] **Step 7: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py CLAUDE.md
git commit -m "feat: expand multi-word caption entries before ASS karaoke grouping"
```

---

### Task 3: `static/caption-word-estimate.js` — mirrored JS implementation

**Files:**
- Create: `static/caption-word-estimate.js`
- Modify: `static/index.html` (add script tag)

**Interfaces:**
- Consumes: nothing (pure, standalone).
- Produces: `Timeline.estimateWordTimings(word) -> [{id, text, t_start, t_end}]`, attached onto the existing `window.Timeline` object (same pattern as `static/timeline-snap.js`). Consumed by Task 4.

- [ ] **Step 1: Write the file**

Create `static/caption-word-estimate.js`:

```javascript
// Splits a multi-word CaptionWord-shaped object into per-word estimated sub-ranges by
// character offset within its own [t_start, t_end]; mirrors app/caption_word_estimate.py exactly.
// Exposes Timeline.estimateWordTimings. Depends on window.Timeline (load after timeline.js).
(() => {
  function estimateWordTimings(word) {
    const tokens = word.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const normalized = tokens.join(" ");
    const totalLen = normalized.length;
    const duration = word.t_end - word.t_start;
    const result = [];
    let offset = 0;
    tokens.forEach((token, i) => {
      const startFrac = offset / totalLen;
      const endFrac = (offset + token.length) / totalLen;
      result.push({
        id: `${word.id}-${i}`,
        text: token,
        t_start: word.t_start + startFrac * duration,
        t_end: word.t_start + endFrac * duration,
      });
      offset += token.length + 1;
    });
    return result;
  }

  Object.assign(window.Timeline, { estimateWordTimings });
})();
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, find (around line 630):

```html
<script src="/static/timeline.js"></script>
<script src="/static/timeline-snap.js"></script>
```

Replace with:

```html
<script src="/static/timeline.js"></script>
<script src="/static/caption-word-estimate.js"></script>
<script src="/static/timeline-snap.js"></script>
```

- [ ] **Step 3: Run the full Python test suite to confirm nothing broke**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (this task is JS-only; this just confirms no accidental Python edits).

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`'s file structure tree, find the line for `timeline-snap.js` (near the top of the `static/` listing) and add a line directly before it:

```
  caption-word-estimate.js # Timeline.estimateWordTimings(word): pure, mirrors app/caption_word_estimate.py — splits a multi-word CaptionWord into per-word estimated sub-ranges
```

In the Inventory section's "Captions & transcription" feature block, find the line for `static/timeline.js` — `groupWords(words, max)` and add directly after it:

```
- `static/caption-word-estimate.js` — `Timeline.estimateWordTimings(word)` (pure, mirrors `app/caption_word_estimate.py`): splits a multi-word `CaptionWord`-shaped object into per-word sub-ranges by character-offset interpolation. Consumed by `static/timeline.js`'s `groupWords`.
```

- [ ] **Step 5: Commit**

```bash
git add static/caption-word-estimate.js static/index.html CLAUDE.md
git commit -m "feat: add JS estimateWordTimings, mirroring the Python implementation"
```

---

### Task 4: Wire into `static/timeline.js`'s `groupWords`

**Files:**
- Modify: `static/timeline.js:30-35`

**Interfaces:**
- Consumes: `Timeline.estimateWordTimings(word)` from Task 3.
- Produces: `groupWords(words, max)` keeps its existing signature and is still exposed as `Timeline.groupWords` (see the `return { render, groupWords, timeAtX, tick, PX_PER_SEC }` at the bottom of the file, unchanged) — now expanding multi-word entries before grouping. No other function in `static/timeline.js` changes, and no caller (`static/preview.js`'s `activeCaptionGroup`, `static/timeline.js`'s own CAPTIONS-row rendering, `static/timeline-snap.js`'s `collectBoundaries`) needs any edit.

- [ ] **Step 1: Make the change**

In `static/timeline.js`, replace the existing `groupWords` function (currently lines 30-35):

```javascript
  function groupWords(words, max = 4) {
    const sorted = [...words].sort((a, b) => a.t_start - b.t_start);
    const groups = [];
    for (let i = 0; i < sorted.length; i += max) groups.push(sorted.slice(i, i + max));
    return groups;
  }
```

with:

```javascript
  function groupWords(words, max = 4) {
    const expanded = words.flatMap((word) => Timeline.estimateWordTimings(word));
    const sorted = expanded.sort((a, b) => a.t_start - b.t_start);
    const groups = [];
    for (let i = 0; i < sorted.length; i += max) groups.push(sorted.slice(i, i + max));
    return groups;
  }
```

- [ ] **Step 2: Run the full Python test suite to confirm nothing broke**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (JS-only change; confirms no accidental Python edits).

- [ ] **Step 3: Verify live in the browser**

Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`, open (or create) a project, and in the browser console:

```javascript
project.captions = { id: crypto.randomUUID().replaceAll("-", ""), words: [
  { id: crypto.randomUUID().replaceAll("-", ""), text: "talks about this", t_start: 0, t_end: 3 }
], z_index: 0, preset_id: (ensureCaptionTrack(), project.captions.preset_id) };
renderTimeline(); renderCaptionPreview();
```

(If `ensureCaptionTrack()` isn't available as a bare global, open the CAPTIONS panel once first so `ensureCaptionPreset` has run, then re-set `project.captions.words` to the single entry above and re-render.)

Confirm:
- The timeline CAPTIONS row now shows 3 blocks (one per estimated word: "talks", "about", "this"), not 1 block for the whole phrase.
- Scrubbing the playhead through the 0-3s range and checking `Preview.renderCaptions`'s output (or just watching the stage caption overlay) shows the highlight color moving from "talks" to "about" to "this" as time advances, not the whole phrase highlighting/unhighlighting together.
- No console errors.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`'s Inventory section, find the line:

```
- `static/timeline.js` — `groupWords(words, max)` (shared with preview.js, not duplicated).
```

Replace it with:

```
- `static/timeline.js` — `groupWords(words, max)` (shared with preview.js, not duplicated; expands each entry through `Timeline.estimateWordTimings` before sorting/chunking, so multi-word entries split into per-word groups).
```

- [ ] **Step 5: Commit**

```bash
git add static/timeline.js CLAUDE.md
git commit -m "feat: expand multi-word caption entries before timeline karaoke grouping"
```

---

### Task 5: Update the backlog

**Files:**
- Modify: `docs/superpowers/backlog.md`

- [ ] **Step 1: Move the item to Done**

In `docs/superpowers/backlog.md`, under `## Done`, add a new entry above the most recent one:

```markdown
- [x] **Caption per-word timing estimation** — [design](specs/2026-07-20-caption-word-estimate-design.md): karaoke highlighting now sweeps word-by-word across a multi-word caption entry (e.g. "talks about this" authored as one chunk with one start/end) instead of lighting the whole phrase at once. A new pure `estimate_word_timings`/`Timeline.estimateWordTimings`, mirrored in `app/caption_word_estimate.py` and `static/caption-word-estimate.js`, splits a multi-word entry into per-word sub-ranges by character-offset interpolation within the entry's own duration; a single-word entry (real transcription output) passes through unchanged. Wired into the single existing grouping choke point on each side (`app/ass_render.py`'s `group_words`, `static/timeline.js`'s `groupWords`), so every caller — preview highlighting, the timeline CAPTIONS row, playhead snapping, ASS export — picked it up with zero other call-site changes. No data model changes; the Caption-words drill-down (shipped earlier the same day) needed no edits since it already authors chunk-level text/timing. Verified live: seeded a multi-word entry via the console, confirmed the timeline CAPTIONS row split it into 3 blocks and the stage highlight swept word-by-word instead of lighting the whole phrase at once; `pytest -q` green.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/backlog.md
git commit -m "docs: record caption per-word timing estimation in backlog"
```

---

## Final check

- [ ] Run `.venv/Scripts/python -m pytest -q` one more time from the repo root — expect all tests green, no failures.
- [ ] Confirm `git log --oneline` on the branch shows 5 clean commits, one per task above.
