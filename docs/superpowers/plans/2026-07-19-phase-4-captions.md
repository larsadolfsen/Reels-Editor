# Phase 4 — Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-functional `#panel-captions` placeholder with real captions: faster-whisper transcription, a track-level style reusing the FONT/STYLE/BOX accordion pattern from Phase 1, a self-contained karaoke highlight (current-word vs progressive-fill), and an editable caption-words list — wired end to end in preview and export.

**Architecture:** Backend: `app/transcribe.py` (faster-whisper wrapper) → `POST /api/projects/{pid}/transcribe` route exports the assembled reel's audio, transcribes it, stores word timestamps on `project.captions`. `app/ass_render.py` gains karaoke dialogue generation (`group_words` + both highlight modes) burned into export as its own always-on-top ASS file. Frontend: a new `CaptionPanel` JS module family (mirrors the existing `TextPanel` family) wires `#panel-captions`'s accordions to a `TextPreset` reached via `CaptionTrack.preset_id` (the same preset entity text blocks use, so the STYLE library is shared), plus a `preview.js` caption overlay with a live highlight tick.

**Tech Stack:** Python 3.12+, FastAPI, pydantic, pytest, faster-whisper (`ml` optional dependency group), ffmpeg/ffprobe, vanilla HTML/JS/CSS (no build step, no bundler).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-phase-4-captions-design.md` — read it first; all data-model/UI decisions below are already resolved there.
- One purpose per file — new `caption-panel-*.js` files mirror the existing `text-panel-*.js` split, one accordion/concern per file.
- Every `static/*.js` and `static/css/**/*.css` file opens with a one-to-two-line purpose comment.
- No inline `style="..."` attributes anywhere in `static/index.html` or JS-rendered markup.
- `app/main.py` stays composition-only — no feature logic there, only route wiring.
- Backend changes are TDD (write failing test → implement → pass). Frontend JS is a stated untested layer (per `CLAUDE.md`) — verify manually via the dev server instead of unit tests, but every step still ships complete, non-placeholder code.
- Run tests: `.venv/Scripts/python -m pytest -q`. Run server: `.venv/Scripts/python -m uvicorn app.main:app --reload` (http://127.0.0.1:8000).
- Update `CLAUDE.md`'s file tree/Inventory in the same commit as any task that adds a new file or changes an existing bullet's behavior.
- Never commit to `main` directly during task work — each task's steps say which branch/worktree to commit on; the final task merges via `superpowers:finishing-a-development-branch`.

---

## Execution Strategy — parallel worktree tasks, not one sequential session

- **Task 1** (data model) is sequential and first — every other task reads fields it adds.
- **Batch A — dispatch simultaneously after Task 1 merges:** Task 2 (`app/transcribe.py`), Task 3 (`ffmpeg_cmd.build_audio_cmd`), Task 4 (`ass_render` karaoke), Task 5 (CAPTIONS panel skeleton + STYLE/FONT/BOX accordions). All four touch disjoint files (or, for Task 5, a disjoint region of `index.html`/`editor.js` from every other task) and have no code dependency on each other.
- **Batch B — dispatch after Task 5 merges:** Task 6 (HIGHLIGHT accordion) and Task 7 (caption-words drill-down) each append one line to `renderCaptionPanel()` (created by Task 5) and add their own non-overlapping HTML block — a real but small dependency on Task 5's merged code, not on each other.
- **Task 8** (transcribe route) — sequential, needs Task 2 + Task 3 merged.
- **Task 9** (Auto-caption button) — sequential, needs Task 5 + Task 8 merged.
- **Task 10** (preview overlay + highlight tick) — sequential, needs Batch A + Batch B merged (reads the final preset shape).
- **Task 11** (export wiring) — sequential, needs Task 4 merged.
- **Task 12** (verification + finish branch) — last, after everything above has merged.

---

### Task 1: Data model — caption style fields + track/preset link

**Files:**
- Modify: `app/models.py`
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `TextPreset.highlight_color: str`, `TextPreset.highlight_mode: str`, `TextPreset.max_words_per_line: int`; `CaptionTrack.preset_id: str`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_text_preset_highlight_and_grouping_defaults():
    from app.models import TextPreset
    p = TextPreset(name="Caption")
    assert p.highlight_color == "#FFD400"
    assert p.highlight_mode == "current_word"
    assert p.max_words_per_line == 4

def test_caption_track_has_preset_id():
    from app.models import CaptionTrack, CaptionWord
    t = CaptionTrack(words=[CaptionWord(text="hi", t_start=0.0, t_end=0.5)])
    assert isinstance(t.preset_id, str) and len(t.preset_id) == 32
```

- [ ] **Step 2: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: FAIL — `AttributeError` (fields don't exist yet).

- [ ] **Step 3: Implement**

In `app/models.py`, add three fields to `TextPreset` (after `usage_count`):

```python
    usage_count: int = 0    # how many times this saved preset has been applied to a block; drives the STYLE accordion's "most used" list
    highlight_color: str = "#FFD400"   # caption karaoke highlight color; unused by TextBlockLayer consumers
    highlight_mode: str = "current_word"   # current_word | progressive_fill; unused by TextBlockLayer consumers
    max_words_per_line: int = 4        # caption line-grouping size; unused by TextBlockLayer consumers
```

And add `preset_id` to `CaptionTrack`:

```python
class CaptionTrack(BaseModel):
    id: str = Field(default_factory=new_id)
    words: list[CaptionWord] = []
    z_index: int = 0
    preset_id: str = Field(default_factory=new_id)   # points at a TextPreset, same pattern as TextBlockLayer.preset_id
```

(`default_factory=new_id` rather than a required field: any `CaptionTrack` saved before this change loads with a fresh random id — the client's `ensureCaptionPreset()`, Task 5, lazily creates a default-styled preset for whatever id it finds, so old data self-heals instead of failing Pydantic validation on load.)

- [ ] **Step 4: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, all tests green.

- [ ] **Step 5: Update CLAUDE.md**

In the `app/models.py` Inventory bullet, extend the `TextPreset` description to mention `highlight_color`/`highlight_mode`/`max_words_per_line` (caption-only fields, added 2026-07-19 for Phase 4), and extend `CaptionTrack`'s to mention `preset_id`.

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/test_models.py CLAUDE.md
git commit -m "feat: add caption highlight/grouping fields to TextPreset, preset_id to CaptionTrack"
```

---

### Task 2: `app/transcribe.py` — faster-whisper wrapper

**Files:**
- Create: `app/transcribe.py`
- Test: `tests/test_transcribe.py`

**Interfaces:**
- Consumes: `app.models.CaptionWord`.
- Produces: `transcribe.words_from_segments(segments) -> list[CaptionWord]` (pure); `transcribe.transcribe_file(path: str) -> list[CaptionWord]` (lazy `WhisperModel` load, module-level cache).

- [ ] **Step 1: Write the failing test**

Create `tests/test_transcribe.py`:

```python
# Tests for app.transcribe: mapping faster-whisper word segments to CaptionWords.
from types import SimpleNamespace as NS
from app.transcribe import words_from_segments

def test_words_from_segments_flattens_and_orders():
    segs = [NS(words=[NS(word=" Hello", start=0.1, end=0.4), NS(word=" world", start=0.4, end=0.9)]),
            NS(words=[NS(word=" again", start=1.2, end=1.6)])]
    out = words_from_segments(segs)
    assert [w.text for w in out] == ["Hello", "world", "again"]
    assert out[0].t_start == 0.1 and out[2].t_end == 1.6
    assert len({w.id for w in out}) == 3

def test_words_from_segments_skips_none_words():
    segs = [NS(words=None)]
    assert words_from_segments(segs) == []
```

- [ ] **Step 2: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.transcribe'`.

- [ ] **Step 3: Implement**

Create `app/transcribe.py`:

```python
# Speech-to-captions: runs faster-whisper (CUDA) over the assembled reel's audio.
# Exposes transcribe_file, words_from_segments. Heavy import is lazy (ml extra).
from app.models import CaptionWord

_model = None

def words_from_segments(segments) -> list[CaptionWord]:
    return [CaptionWord(text=w.word.strip(), t_start=w.start, t_end=w.end)
            for seg in segments for w in (seg.words or [])]

def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    return _model

def transcribe_file(path: str) -> list[CaptionWord]:
    segments, _info = _get_model().transcribe(path, word_timestamps=True)
    return words_from_segments(segments)
```

- [ ] **Step 4: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS. `transcribe_file`/CUDA is never exercised by tests — only the pure `words_from_segments` is tested.

- [ ] **Step 5: Update CLAUDE.md**

Add `app/transcribe.py` to the file tree (replacing the "planned (Task 10)" placeholder note if present) and an Inventory bullet:

```
- `app/transcribe.py` — `words_from_segments(segments) -> list[CaptionWord]` (pure), `transcribe_file(path) -> list[CaptionWord]` (lazy `WhisperModel("large-v3", device="cuda")` load, module-level cache). Requires the `ml` optional dependency group (`.venv/Scripts/pip install -e .[ml]`).
```

- [ ] **Step 6: Commit**

```bash
git add app/transcribe.py tests/test_transcribe.py CLAUDE.md
git commit -m "feat: faster-whisper transcription wrapper"
```

---

### Task 3: `ffmpeg_cmd.build_audio_cmd` — audio-only export for transcription

**Files:**
- Modify: `app/ffmpeg_cmd.py`
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `Project`, `app.timeline.ordered`.
- Produces: `ffmpeg_cmd.build_audio_cmd(project: Project, wav_path: str) -> list[str]`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ffmpeg_cmd.py`:

```python
def test_build_audio_cmd_one_atrim_per_clip_and_vn():
    from app.ffmpeg_cmd import build_audio_cmd
    cmd = build_audio_cmd(proj(), "out.wav")
    assert cmd[:1] == ["ffmpeg"] and cmd[-1] == "out.wav"
    i = cmd.index("-filter_complex"); fc = cmd[i + 1]
    assert fc.count("atrim=") == 2
    assert "-vn" in cmd
    assert cmd[cmd.index("-map") + 1] == "[a]"
```

- [ ] **Step 2: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_audio_cmd'`.

- [ ] **Step 3: Implement**

Add to `app/ffmpeg_cmd.py` (after `build_export_cmd`):

```python
def build_audio_cmd(p: Project, wav_path: str) -> list[str]:
    clips = ordered(p.clips)
    cmd = ["ffmpeg", "-y"]
    parts = []
    for i, c in enumerate(clips):
        cmd += ["-i", c.file_path]
        parts.append(f"[{i}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS[a{i}];")
    fc = "".join(parts) + "".join(f"[a{i}]" for i in range(len(clips))) + f"concat=n={len(clips)}:v=0:a=1[a]"
    return cmd + ["-filter_complex", fc, "-map", "[a]", "-vn", "-ac", "1", "-ar", "16000", wav_path]
```

- [ ] **Step 4: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

- [ ] **Step 5: Update CLAUDE.md**

Extend the `app/ffmpeg_cmd.py` Inventory bullet: "...also `build_audio_cmd(project, wav_path)` — audio-only concat export (mono, 16kHz) used to produce a timeline-relative wav for transcription."

- [ ] **Step 6: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py CLAUDE.md
git commit -m "feat: audio-only export command for caption transcription"
```

---

### Task 4: `ass_render` karaoke — `group_words` + both highlight modes

**Files:**
- Modify: `app/ass_render.py`
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset` (Task 1's `highlight_color`/`highlight_mode`/`max_words_per_line`), `CaptionWord`, `Project.captions`.
- Produces: `ass_render.group_words(words: list[CaptionWord], max_words: int) -> list[list[CaptionWord]]` (pure); `ass_render.render_caption_ass(project: Project, preset: TextPreset) -> str` (full standalone ASS script — Script Info + one `Caption` style + karaoke dialogue).

Both highlight modes are implemented as plain ASS tags, self-contained (no dependency on any future rich-text mechanism):
- **`progressive_fill`**: native `\k` karaoke tags. The `Caption` style's `PrimaryColour` is set to `highlight_color` and `SecondaryColour` to the preset's normal `color` — libass natively sweeps each syllable from Secondary to Primary as its `\k` duration elapses, so already-spoken words stay highlighted (cumulative fill) while unspoken ones show the normal color. One `Dialogue` line per caption line-group.
- **`current_word`**: one `Dialogue` line **per word**, each spanning exactly that word's `[t_start, t_end)`. Each line renders the full line-group's text, with only the active word's span wrapped in a `{\1c<highlight>}...{\1c<normal>}` inline color override — so only the single currently-spoken word is ever colored, never accumulating.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py`:

```python
from app.models import CaptionTrack, CaptionWord

def w(t, a, b): return CaptionWord(text=t, t_start=a, t_end=b)

def test_group_words_respects_max_words():
    from app.ass_render import group_words
    words = [w(str(i), i, i + 0.5) for i in range(6)]
    groups = group_words(words, max_words=4)
    assert [len(g) for g in groups] == [4, 2]

def test_group_words_sorts_by_start_time():
    from app.ass_render import group_words
    words = [w("b", 1.0, 1.5), w("a", 0.0, 0.5)]
    groups = group_words(words, max_words=4)
    assert [x.text for x in groups[0]] == ["a", "b"]

def test_group_words_empty():
    from app.ass_render import group_words
    assert group_words([], max_words=4) == []

def test_progressive_fill_style_uses_highlight_as_primary():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", color="#FFFFFF", highlight_color="#FFD400", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 1.0, 1.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    style = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = style.split(",")
    assert fields[3] == hex_to_ass("#FFD400")   # PrimaryColour
    assert fields[4] == hex_to_ass("#FFFFFF")   # SecondaryColour

def test_progressive_fill_emits_one_k_tagged_dialogue_per_group():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", highlight_mode="progressive_fill", max_words_per_line=4)
    p = Project(name="r", captions=CaptionTrack(
        words=[w("Hello", 1.0, 1.5), w("world", 1.5, 2.2)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if "Hello" in l)
    assert line.startswith("Dialogue: 0,0:00:01.00,0:00:02.20,Caption")
    assert "{\\k50}Hello" in line and "{\\k70}world" in line

def test_current_word_emits_one_dialogue_per_word_with_inline_override():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption", color="#FFFFFF", highlight_color="#FFD400", highlight_mode="current_word")
    p = Project(name="r", captions=CaptionTrack(
        words=[w("Hello", 1.0, 1.5), w("world", 1.5, 2.2)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 2
    first = next(l for l in dialogues if l.startswith("Dialogue: 0,0:00:01.00,0:00:01.50"))
    assert "{\\1c" in first and "Hello" in first and "world" in first  # both words present, only Hello wrapped
    second = next(l for l in dialogues if l.startswith("Dialogue: 0,0:00:01.50,0:00:02.20"))
    assert second.count("{\\1c") == 2   # world's override pair; Hello unwrapped in this line

def test_render_caption_ass_no_words_still_valid_header():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Caption")
    p = Project(name="r", captions=CaptionTrack(words=[], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    assert "PlayResX: 1080" in out and "Style: Caption," in out
    assert not [l for l in out.splitlines() if l.startswith("Dialogue:")]
```

- [ ] **Step 2: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: FAIL — `ImportError: cannot import name 'group_words'`.

- [ ] **Step 3: Implement**

Add to `app/ass_render.py` (after `render_ass`), reusing `_resolved_weight`, `hex_to_ass`, `_ass_override_color`, `ass_time`, `WEIGHT_LABELS` already in the file:

```python
from app.models import CaptionWord   # add to the existing `from app.models import ...` import line

CAPTION_STYLE_NAME = "Caption"

def group_words(words: list[CaptionWord], max_words: int) -> list[list[CaptionWord]]:
    sorted_words = sorted(words, key=lambda w: w.t_start)
    return [sorted_words[i:i + max_words] for i in range(0, len(sorted_words), max_words)]

def _caption_style(p: TextPreset, weight: int) -> str:
    fontname = f"{p.font} {WEIGHT_LABELS[weight]}"
    alignment = {"left": 7, "right": 9}.get(p.align, 8)
    if p.highlight_mode == "progressive_fill":
        primary, secondary = hex_to_ass(p.highlight_color), hex_to_ass(p.color)
    else:
        primary, secondary = hex_to_ass(p.color), hex_to_ass(p.color)
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    return (f"Style: {CAPTION_STYLE_NAME},{fontname},{p.size_px},{primary},{secondary},"
            f"{hex_to_ass(p.outline_color)},&H00000000,"
            f"0,{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,{alignment},0,0,0,1")

def _karaoke_dialogue(group: list[CaptionWord], p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})"
    body = "".join(f"{{\\k{max(1, round((w.t_end - w.t_start) * 100))}}}{w.text} " for w in group).rstrip()
    start, end = group[0].t_start, group[-1].t_end
    return f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}"

def _current_word_dialogues(group: list[CaptionWord], p: TextPreset) -> list[str]:
    fx = f"\\pos({p.x},{p.y})"
    highlight = _ass_override_color(p.highlight_color)
    normal = _ass_override_color(p.color)
    lines = []
    for i, active in enumerate(group):
        segments = []
        for j, other in enumerate(group):
            seg = other.text + (" " if j < len(group) - 1 else "")
            segments.append(f"{{\\1c{highlight}}}{seg}{{\\1c{normal}}}" if j == i else seg)
        body = "".join(segments)
        lines.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                      f"{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}")
    return lines

def render_caption_ass(project: Project, preset: TextPreset) -> str:
    words = project.captions.words if project.captions else []
    weight = _resolved_weight(preset)
    header = ("[Script Info]\nScriptType: v4.00+\n"
              f"PlayResX: {project.width}\nPlayResY: {project.height}\nWrapStyle: 2\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
              "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding\n")
    styles = _caption_style(preset, weight)
    groups = group_words(words, preset.max_words_per_line)
    event_lines = []
    for g in groups:
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(g, preset))
        else:
            event_lines.append(_karaoke_dialogue(g, preset))
    events = ("\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
              + "\n".join(event_lines))
    return header + styles + events + "\n"
```

- [ ] **Step 4: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, all tests green.

- [ ] **Step 5: Update CLAUDE.md**

Extend the `app/ass_render.py` Inventory bullet: "...as of 2026-07-19, also `group_words(words, max_words)` (pure) and `render_caption_ass(project, preset) -> str` (standalone ASS script for the caption track: one `Caption` style + karaoke dialogue, `progressive_fill` via native `\\k` PrimaryColour/SecondaryColour sweep, `current_word` via per-word Dialogue events with an inline `\\1c` override around only the active word) — burned in as its own always-on-top ASS file by the export route (`app/main.py`), independent of the text-block/video-box z-order banding."

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py CLAUDE.md
git commit -m "feat: karaoke caption ASS rendering, current-word and progressive-fill modes"
```

---

### Task 5: CAPTIONS panel skeleton — STYLE/FONT/BOX accordions

**Files:**
- Modify: `static/index.html` (replace the `#panel-captions` placeholder, lines ~166-176)
- Modify: `static/editor.js` (add caption preset/track helpers + `renderCaptionPanel()` orchestrator + accordion wiring)
- Create: `static/caption-panel-style.js`, `static/caption-panel-font-family.js`, `static/caption-panel-font-weight.js`, `static/caption-panel-font-style.js`, `static/caption-panel-box.js`

**Interfaces:**
- Consumes: `project.text_presets` (Task 1's new fields already present), `Api.listPresets`/`Api.savePreset` (existing), `Api.listFontWeights` (existing), `UI.accordionSection`/`UI.buttonGroup`/`UI.numberField`/`UI.colorSwatch`/`UI.settingsRow`/`UI.subPanelHeader`/`UI.divider` (existing, unmodified).
- Produces: `ensureCaptionTrack() -> CaptionTrack`, `ensureCaptionPreset(id) -> TextPreset`, `renderCaptionPreview()`, `renderCaptionPanel()` (all in `editor.js`, same shape as the existing `ensureTextBlock`/`ensureTextPreset`/`renderTextPreview`/`renderTextPanel`); `window.CaptionPanel.renderStyle/renderFontFamily/renderFontWeight/renderFontStyle/renderBox()`. Batch B (Tasks 6/7) will append one call each (`CaptionPanel.renderHighlight()`, `CaptionPanel.renderWords()`) to the bottom of `renderCaptionPanel()` and their own subpanel `hidden = true` reset lines at its top.

- [ ] **Step 1: Replace the `#panel-captions` placeholder markup**

In `static/index.html`, replace the entire block (from `<div id="panel-captions" class="context-panel caption-placeholder" hidden>` through its matching closing `</div>`, i.e. what's currently the 11-line placeholder with the disabled B/I/U/align icons and `.caption-preview-box`) with:

```html
      <div id="panel-captions" class="context-panel" hidden>
        <div id="panel-captions-main">
          <div class="style-panel-header">CAPTIONS</div>

          <div class="style-group">
            <button id="caption-auto-btn" type="button">Auto-caption</button>
            <p id="caption-empty-state" class="context-panel-name">No captions yet — click Auto-caption to transcribe this reel's audio.</p>
          </div>

          <div id="caption-style-accordion"></div>
          <div id="caption-style-body">
            <div class="style-group">
              <button id="caption-style-save" type="button">+ Save current style</button>
            </div>
            <div class="style-group">
              <ul id="caption-style-most-used" class="font-list"></ul>
            </div>
            <div class="style-group">
              <div id="caption-style-browse-row"></div>
            </div>
          </div>

          <div id="caption-font-accordion">
          <div id="caption-font-body">
            <div class="style-group">
              <div id="caption-font-row"></div>
            </div>

            <div class="style-group">
              <div class="style-row" id="caption-size-row">
                <button class="icon-btn" id="caption-size-step-down" type="button" aria-label="Decrease font size" title="Decrease font size">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>
                </button>
                <label id="caption-size-field"></label>
                <button class="icon-btn" id="caption-size-step-up" type="button" aria-label="Increase font size" title="Increase font size">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 11 4-4 4 4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>
                </button>
              </div>
            </div>

            <div class="style-group">
              <div id="caption-weight-row"></div>
            </div>

            <div class="style-group">
              <div class="style-row">
                <button class="icon-btn" id="caption-italic" type="button" aria-pressed="false" title="Italic">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
                </button>
                <button class="icon-btn" id="caption-underline" type="button" aria-pressed="false" title="Underline">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
                </button>
              </div>
            </div>

            <div class="style-group">
              <label id="caption-color-field"></label>
            </div>

            <div class="style-group">
              <label id="caption-outline-color-field"></label>
            </div>

            <div class="style-group">
              <label id="caption-outline-px-field"></label>
            </div>
          </div>
          </div>

          <div id="caption-box-accordion">
          <div id="caption-box-body">

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

            <div id="caption-box-width-height-divider"></div>

            <div class="style-group">
              <div class="style-row">
                <div id="caption-box-background-color-field"></div>
                <label id="caption-box-background-opacity-field"></label>
              </div>
            </div>

            <div id="caption-box-background-border-divider"></div>

            <div class="style-group-label">BORDER</div>
            <div class="style-group">
              <div class="style-row">
                <label id="caption-box-border-width-field"></label>
                <label id="caption-box-border-radius-field"></label>
                <div id="caption-box-border-color-field"></div>
              </div>
            </div>

            <div id="caption-box-border-position-divider"></div>

            <div class="style-group-label">TEXT ALIGN</div>
            <div class="style-group">
              <div id="caption-align-group"></div>
            </div>

            <div class="style-group-label">POSITION</div>
            <div class="style-group">
              <div id="caption-position-row-group"></div>
              <div id="caption-position-col-group"></div>
            </div>

            <div class="style-group">
              <div class="style-row">
                <label id="caption-offset-x-field"></label>
                <label id="caption-offset-y-field"></label>
              </div>
            </div>

          </div>
          </div>

        </div>

        <div id="panel-captions-font" hidden>
          <div id="caption-font-subpanel-header"></div>
          <ul id="caption-font-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-weight" hidden>
          <div id="caption-weight-subpanel-header"></div>
          <ul id="caption-weight-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-style" hidden>
          <div id="caption-style-subpanel-header"></div>
          <ul id="caption-style-list" class="font-list"></ul>
        </div>
      </div>
```

Also add these `<script>` tags in `static/index.html`, immediately after the existing `<script src="/static/text-panel-style.js"></script>`-style block (find the line `<script src="/static/api-save-preset.js"></script>` near the end of the file and add after it):

```html
<script src="/static/caption-panel-style.js"></script>
<script src="/static/caption-panel-font-family.js"></script>
<script src="/static/caption-panel-font-weight.js"></script>
<script src="/static/caption-panel-font-style.js"></script>
<script src="/static/caption-panel-box.js"></script>
```

- [ ] **Step 2: Add caption preset/track helpers and the panel orchestrator to `editor.js`**

In `static/editor.js`, immediately after the existing `ensureTextBlock()` function, add:

```js
function defaultCaptionPreset(id) {
  return {
    id, name: "Caption", font: "Public Sans", size_px: 72, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000", box_background_opacity: 100,
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: 1520, entrance: "none",
    highlight_color: "#FFD400", highlight_mode: "current_word", max_words_per_line: 4,
  };
}

// Same self-healing pattern as ensureTextPreset — resolving through the caption track's own
// preset_id keeps the two from drifting apart, and heals old data whose preset_id points
// nowhere (Task 1's CaptionTrack.preset_id default_factory=new_id).
function ensureCaptionPreset(id) {
  if (!project.text_presets[id]) {
    project.text_presets[id] = defaultCaptionPreset(id);
  }
  return project.text_presets[id];
}

function ensureCaptionTrack() {
  let track = project.captions;
  if (!track) {
    track = {
      id: crypto.randomUUID().replaceAll("-", ""), words: [], z_index: 0,
      preset_id: crypto.randomUUID().replaceAll("-", ""),
    };
    project.captions = track;
  }
  ensureCaptionPreset(track.preset_id);
  return track;
}

function renderCaptionPreview() {
  if (window.Preview && Preview.renderCaptions) {
    Preview.renderCaptions(project, project.text_presets, Preview.currentTimelineTime());
  }
}

async function renderCaptionPanel() {
  document.getElementById("panel-captions-font").hidden = true;
  document.getElementById("panel-captions-weight").hidden = true;
  document.getElementById("panel-captions-style").hidden = true;
  document.getElementById("panel-captions-main").hidden = false;

  const track = ensureCaptionTrack();
  document.getElementById("caption-empty-state").hidden = track.words.length > 0;

  CaptionPanel.renderStyle();
  CaptionPanel.renderFontFamily();
  await CaptionPanel.renderFontWeight();
  CaptionPanel.renderFontStyle();
  CaptionPanel.renderBox();

  renderCaptionPreview();
}
```

Then find the existing block of `UI.accordionSection(...)` calls (the four calls for `text-style-accordion`/`text-font-accordion`/`text-box-accordion`/`text-time-accordion`) and add three more immediately after them:

```js
UI.accordionSection(document.getElementById("caption-style-accordion"), document.getElementById("caption-style-body"), { title: "STYLE", expanded: false });
UI.accordionSection(document.getElementById("caption-font-accordion"), document.getElementById("caption-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("caption-box-accordion"), document.getElementById("caption-box-body"), { title: "BOX", expanded: false });
```

And in the existing `UI.divider(...)` calls block, add:

```js
UI.divider(document.getElementById("caption-box-width-height-divider"));
UI.divider(document.getElementById("caption-box-background-border-divider"));
UI.divider(document.getElementById("caption-box-border-position-divider"));
```

Finally, replace `openCaptionsPanel()`'s body and the `onTimelineSelect`'s `"caption"` branch (which currently just writes into the now-deleted `.caption-preview-box`) with real wiring:

```js
async function openCaptionsPanel() {
  selected = { type: "captions" };
  showPanel("captions");
  await renderCaptionPanel();
  renderTimeline();
}
```

and, inside `onTimelineSelect`, replace:

```js
  } else if (type === "caption") {
    document.querySelector(".caption-preview-box").textContent = item.map((w) => w.text).join(" ");
    showPanel("captions");
```

with:

```js
  } else if (type === "caption") {
    showPanel("captions");
    await renderCaptionPanel();
```

- [ ] **Step 3: `static/caption-panel-style.js`**

```js
// CAPTIONS panel STYLE accordion: saved-style preset library, same global library TEXT's
// STYLE accordion uses (GET/POST /api/presets) — a saved style can be applied to a text
// block or a caption track interchangeably. Exposes window.CaptionPanel.renderStyle().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let savedPresets = [];

  function styleFieldsOf(preset) {
    const { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      x, y, highlight_color, highlight_mode, max_words_per_line } = preset;
    return { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      x, y, highlight_color, highlight_mode, max_words_per_line };
  }

  async function loadSavedPresets() {
    savedPresets = await Api.listPresets();
  }

  async function saveCurrentStyleAsPreset() {
    const name = prompt("Name this style:");
    if (!name) return;
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    await loadSavedPresets();
    renderStyle();
  }

  async function applySavedPreset(saved) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    Object.assign(preset, styleFieldsOf(saved));
    saved.usage_count = (saved.usage_count || 0) + 1;
    await Api.savePreset(saved);
    await saveProject();
    await loadSavedPresets();
    renderCaptionPanel();
    closeStylePanel();
  }

  function renderStyleListRow(saved) {
    const li = document.createElement("li");
    li.className = "font-list-row";
    li.addEventListener("click", () => applySavedPreset(saved));
    const nameEl = document.createElement("span");
    nameEl.className = "font-list-row-name";
    nameEl.textContent = saved.name;
    li.appendChild(nameEl);
    return li;
  }

  function renderStyle() {
    const mostUsed = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 3);
    const listEl = document.getElementById("caption-style-most-used");
    listEl.innerHTML = "";
    mostUsed.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));

    UI.settingsRow(document.getElementById("caption-style-browse-row"), {
      label: "Browse all styles", value: String(savedPresets.length), onClick: openStylePanel,
    });
  }

  function openStylePanel() {
    renderStyleList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-style").hidden = false;
  }

  function closeStylePanel() {
    document.getElementById("panel-captions-style").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  function renderStyleList() {
    const listEl = document.getElementById("caption-style-list");
    listEl.innerHTML = "";
    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    sorted.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));
  }

  UI.subPanelHeader(document.getElementById("caption-style-subpanel-header"), { title: "Saved Styles", onBack: closeStylePanel });
  document.getElementById("caption-style-save").addEventListener("click", saveCurrentStyleAsPreset);
  loadSavedPresets();

  window.CaptionPanel.renderStyle = renderStyle;
})();
```

- [ ] **Step 4: `static/caption-panel-font-family.js`**

```js
// CAPTIONS panel FONT accordion: font-family row + drill-down subpanel. Pure UI over the
// caption track's TextPreset.font. Exposes window.CaptionPanel.renderFontFamily().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let fontRowSetValue = null;

  function openFontPanel() {
    renderFontList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-font").hidden = false;
  }

  function closeFontPanel() {
    document.getElementById("panel-captions-font").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
    renderCaptionPreview();
  }

  function hoverPreviewFont(fontName) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const previewPresets = { ...project.text_presets, [preset.id]: { ...preset, font: fontName } };
    if (window.Preview && Preview.renderCaptions) Preview.renderCaptions(project, previewPresets, Preview.currentTimelineTime());
  }

  async function selectFont(fontName) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.font = fontName;
    const weights = await Api.listFontWeights(fontName);
    if (!weights.some((w) => w.value === preset.weight)) {
      preset.weight = weights.reduce((closest, w) =>
        Math.abs(w.value - preset.weight) < Math.abs(closest.value - preset.weight) ? w : closest
      ).value;
    }
    await saveProject();
    renderFontFamily();
    await CaptionPanel.renderFontWeight();
    renderFontList();
    closeFontPanel();
  }

  function renderFontList() {
    const listEl = document.getElementById("caption-font-list");
    listEl.innerHTML = "";
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const orderedFonts = [preset.font, ...AVAILABLE_FONTS.filter((f) => f !== preset.font)];
    orderedFonts.forEach((fontName, index) => {
      if (index > 0) {
        const dividerLi = document.createElement("li");
        dividerLi.className = "font-list-divider";
        UI.divider(dividerLi);
        listEl.appendChild(dividerLi);
      }

      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
      li.addEventListener("mouseleave", () => renderCaptionPreview());
      li.addEventListener("click", () => selectFont(fontName));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.style.fontFamily = fontName;
      nameEl.textContent = fontName;
      li.appendChild(nameEl);

      if (fontName === preset.font) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "font-list-checkmark");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("fill", "none");
        check.setAttribute("stroke", "currentColor");
        check.setAttribute("stroke-width", "2");
        check.setAttribute("stroke-linecap", "round");
        check.setAttribute("stroke-linejoin", "round");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6 9 17l-5-5");
        check.appendChild(path);
        li.appendChild(check);
      }

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("caption-font-subpanel-header"), { title: "Font Family", onBack: closeFontPanel });

  function renderFontFamily() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    if (fontRowSetValue) {
      fontRowSetValue(preset.font, preset.font);
    } else {
      fontRowSetValue = UI.settingsRow(document.getElementById("caption-font-row"), {
        label: "Font Family", value: preset.font, valueFontFamily: preset.font,
        onClick: openFontPanel,
      });
    }
  }

  window.CaptionPanel.renderFontFamily = renderFontFamily;
})();
```

- [ ] **Step 5: `static/caption-panel-font-weight.js`**

```js
// CAPTIONS panel FONT accordion: font-weight row + drill-down subpanel. Pure UI over the
// caption track's TextPreset.weight. Exposes window.CaptionPanel.renderFontWeight().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let weightRowSetValue = null;
  let currentWeights = [];

  function openWeightPanel() {
    renderWeightList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-weight").hidden = false;
  }

  function closeWeightPanel() {
    document.getElementById("panel-captions-weight").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  async function selectWeight(weightValue) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.weight = weightValue;
    await saveProject();
    renderCaptionPreview();
    renderFontWeight();
    closeWeightPanel();
  }

  function renderWeightList() {
    const listEl = document.getElementById("caption-weight-list");
    listEl.innerHTML = "";
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    currentWeights.forEach((w) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("click", () => selectWeight(w.value));

      const content = document.createElement("span");
      content.className = "font-weight-row-content";

      const labelEl = document.createElement("span");
      labelEl.className = "font-list-row-name";
      labelEl.textContent = w.label;
      content.appendChild(labelEl);

      const previewEl = document.createElement("span");
      previewEl.className = "font-weight-row-preview";
      previewEl.style.fontFamily = preset.font;
      previewEl.style.fontWeight = w.value;
      previewEl.textContent = "kind of insane";
      content.appendChild(previewEl);

      li.appendChild(content);

      if (w.value === preset.weight) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "font-list-checkmark");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("fill", "none");
        check.setAttribute("stroke", "currentColor");
        check.setAttribute("stroke-width", "2");
        check.setAttribute("stroke-linecap", "round");
        check.setAttribute("stroke-linejoin", "round");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6 9 17l-5-5");
        check.appendChild(path);
        li.appendChild(check);
      }

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("caption-weight-subpanel-header"), { title: "Weight", onBack: closeWeightPanel });

  async function renderFontWeight() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    currentWeights = await Api.listFontWeights(preset.font);
    const current = currentWeights.find((w) => w.value === preset.weight);
    const label = current ? current.label : String(preset.weight);
    if (weightRowSetValue) {
      weightRowSetValue(label);
    } else {
      weightRowSetValue = UI.settingsRow(document.getElementById("caption-weight-row"), {
        label: "Weight", value: label,
        onClick: openWeightPanel,
      });
    }
  }

  window.CaptionPanel.renderFontWeight = renderFontWeight;
})();
```

- [ ] **Step 6: `static/caption-panel-font-style.js`**

```js
// CAPTIONS panel FONT accordion: SIZE/Italic/Underline/Color/Outline controls, whole-track
// caption styling. Exposes window.CaptionPanel.renderFontStyle().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  function wireToggle(id, prop) {
    const btn = document.getElementById(id);
    btn.addEventListener("click", async () => {
      const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
      preset[prop] = !preset[prop];
      btn.setAttribute("aria-pressed", String(preset[prop]));
      await saveProject();
      renderCaptionPreview();
    });
  }
  wireToggle("caption-italic", "italic");
  wireToggle("caption-underline", "underline");

  const FONT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 36, 45, 56, 72, 96];

  function stepFontSizePreset(currentSize, direction) {
    if (direction < 0) {
      const lower = FONT_SIZE_PRESETS.filter((p) => p < currentSize);
      return lower.length ? lower[lower.length - 1] : FONT_SIZE_PRESETS[0];
    }
    const higher = FONT_SIZE_PRESETS.filter((p) => p > currentSize);
    return higher.length ? higher[0] : FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
  }

  let currentSizeFieldSetValue = null;

  document.getElementById("caption-size-step-down").addEventListener("click", () => {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.size_px = stepFontSizePreset(preset.size_px, -1);
    saveProject();
    renderCaptionPreview();
    if (currentSizeFieldSetValue) currentSizeFieldSetValue(preset.size_px);
  });

  document.getElementById("caption-size-step-up").addEventListener("click", () => {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.size_px = stepFontSizePreset(preset.size_px, 1);
    saveProject();
    renderCaptionPreview();
    if (currentSizeFieldSetValue) currentSizeFieldSetValue(preset.size_px);
  });

  window.CaptionPanel.renderFontStyle = function renderFontStyle() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const sizeFieldDisabled = preset.box_width_mode === "fill";

    document.getElementById("caption-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("caption-underline").setAttribute("aria-pressed", String(preset.underline));
    document.getElementById("caption-size-step-down").disabled = sizeFieldDisabled;
    document.getElementById("caption-size-step-up").disabled = sizeFieldDisabled;

    currentSizeFieldSetValue = UI.numberField(document.getElementById("caption-size-field"),
      { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200, disabled: sizeFieldDisabled,
        onChange: (v) => { preset.size_px = v; saveProject(); renderCaptionPreview(); } });

    UI.colorSwatch(document.getElementById("caption-color-field"),
      { label: "Color", value: preset.color,
        onChange: (v) => { preset.color = v; saveProject(); renderCaptionPreview(); } });

    UI.colorSwatch(document.getElementById("caption-outline-color-field"),
      { label: "Outline", value: preset.outline_color,
        onChange: (v) => { preset.outline_color = v; saveProject(); renderCaptionPreview(); } });

    UI.numberField(document.getElementById("caption-outline-px-field"),
      { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20,
        onChange: (v) => { preset.outline_px = v; saveProject(); renderCaptionPreview(); } });
  };
})();
```

- [ ] **Step 7: `static/caption-panel-box.js`**

```js
// CAPTIONS panel BOX accordion: width/height SIZE mode, background/border, TEXT ALIGN, and
// absolute POSITION fields — same shape as editor.js's renderBoxPanel() + text-panel-align.js
// + text-panel-position.js combined, pointed at the caption track's preset.
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderBox = function renderBox() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.buttonGroup(document.getElementById("caption-box-size-mode-group"),
    [{ value: "fit", label: "FIT" }, { value: "fixed", label: "FREE" }, { value: "fill", label: "FILL" }],
    preset.box_width_mode,
    (value) => {
      preset.box_width_mode = value;
      preset.box_height_mode = value;
      renderCaptionPreview(); saveProject(); CaptionPanel.renderBox();
    });

  const boxSizeFieldsHidden = preset.box_width_mode === "fit";
  document.getElementById("caption-box-width-field").hidden = boxSizeFieldsHidden;
  document.getElementById("caption-box-height-field").hidden = boxSizeFieldsHidden;

  UI.numberField(document.getElementById("caption-box-width-field"),
    { label: "WIDTH", unit: "PX", value: preset.box_width, min: 1, max: 1080,
      onChange: (v) => { preset.box_width = v; renderCaptionPreview(); saveProject(); } });

  UI.numberField(document.getElementById("caption-box-height-field"),
    { label: "HEIGHT", unit: "PX", value: preset.box_height, min: 1, max: 1920,
      onChange: (v) => { preset.box_height = v; renderCaptionPreview(); saveProject(); } });

  UI.colorSwatch(document.getElementById("caption-box-background-color-field"),
    { label: "Background", showLabel: false, value: preset.box_background_color,
      onChange: (v) => { preset.box_background_color = v; preset.box_background = true; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-background-opacity-field"),
    { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100,
      onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-border-width-field"),
    { label: "BORDER", unit: "PX", value: preset.box_border_width, min: 0, max: 40,
      onChange: (v) => { preset.box_border_width = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200,
      onChange: (v) => { preset.box_border_radius = v; saveProject(); renderCaptionPreview(); } });

  UI.colorSwatch(document.getElementById("caption-box-border-color-field"),
    { label: "Border Color", showLabel: false, value: preset.box_border_color,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderCaptionPreview(); } });

  UI.buttonGroup(document.getElementById("caption-align-group"),
    [
      { value: "left", label: "LEFT",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" /></svg>' },
      { value: "center", label: "CENTER",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" /></svg>' },
      { value: "right", label: "RIGHT",
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" /></svg>' },
    ],
    preset.align, (value) => { preset.align = value; saveProject(); renderCaptionPreview(); });

  UI.numberField(document.getElementById("caption-offset-x-field"),
    { label: "HORIZONTAL", unit: "PX", value: preset.x, step: 1, min: 1, max: 1080,
      onChange: (v) => { preset.x = Math.round(v); saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-offset-y-field"),
    { label: "VERTICAL", unit: "PX", value: preset.y, step: 1, min: 1, max: 1920,
      onChange: (v) => { preset.y = Math.round(v); saveProject(); renderCaptionPreview(); } });

  UI.buttonGroup(document.getElementById("caption-position-row-group"),
    [{ value: "top", label: "TOP" }, { value: "mid", label: "MID" }, { value: "btm", label: "BTM" }],
    null, (value) => { preset.y = POSITION_ANCHORS_Y[value]; saveProject(); renderCaptionPanel(); });

  UI.buttonGroup(document.getElementById("caption-position-col-group"),
    [{ value: "left", label: "LEFT" }, { value: "mid", label: "MID" }, { value: "right", label: "RIGHT" }],
    null, (value) => { preset.x = POSITION_ANCHORS_X[value]; saveProject(); renderCaptionPanel(); });
};
```

- [ ] **Step 8: Manual verification**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open http://127.0.0.1:8000, click the CAPTIONS icon in the left rail. Confirm: the panel opens with an "Auto-caption" button, "No captions yet" empty state, and STYLE/FONT/BOX accordions that expand and function exactly like TEXT's (change font, weight, size, italic/underline, color/outline, box size mode/background/border, align, position) — but nothing is visible on the stage yet (no overlay rendering until Task 10). Confirm `pytest -q` is still green (backend untouched by this task).

- [ ] **Step 9: Update CLAUDE.md**

Add the five new files to the file tree and Inventory, each with a one-line description mirroring their `text-panel-*.js` counterparts but noting they target the caption track's preset via `ensureCaptionTrack()`/`ensureCaptionPreset()` instead of a text block's.

- [ ] **Step 10: Commit**

```bash
git add static/index.html static/editor.js static/caption-panel-style.js static/caption-panel-font-family.js static/caption-panel-font-weight.js static/caption-panel-font-style.js static/caption-panel-box.js CLAUDE.md
git commit -m "feat: CAPTIONS panel STYLE/FONT/BOX accordions, wired to a shared TextPreset"
```

---

### Task 6: HIGHLIGHT accordion

**Files:**
- Modify: `static/index.html` (insert a new accordion block + script tag)
- Modify: `static/editor.js` (one accordion-registration line + one `renderCaptionPanel()` call)
- Create: `static/caption-panel-highlight.js`

**Interfaces:**
- Consumes: `ensureCaptionPreset`/`ensureCaptionTrack`/`saveProject`/`renderCaptionPreview` (Task 5), `TextPreset.highlight_color`/`highlight_mode`/`max_words_per_line` (Task 1).
- Produces: `window.CaptionPanel.renderHighlight()`.

- [ ] **Step 1: Insert the HIGHLIGHT accordion markup**

In `static/index.html`, insert immediately after the `caption-box-accordion`'s closing `</div></div>` pair and before the `<div id="panel-captions-font" hidden>` line added in Task 5:

```html
          <div id="caption-highlight-accordion"></div>
          <div id="caption-highlight-body">
            <div class="style-group-label">MODE</div>
            <div class="style-group">
              <div id="caption-highlight-mode-group"></div>
            </div>
            <div class="style-group">
              <div id="caption-highlight-color-field"></div>
            </div>
            <div class="style-group">
              <label id="caption-max-words-field"></label>
            </div>
          </div>
```

Add a script tag after `<script src="/static/caption-panel-box.js"></script>`:

```html
<script src="/static/caption-panel-highlight.js"></script>
```

- [ ] **Step 2: Register the accordion and hook it into the panel orchestrator, in `editor.js`**

Add one line after the three `UI.accordionSection(...)` calls Task 5 added:

```js
UI.accordionSection(document.getElementById("caption-highlight-accordion"), document.getElementById("caption-highlight-body"), { title: "HIGHLIGHT", expanded: false });
```

And add one line at the end of `renderCaptionPanel()`'s existing accordion-render calls (after `CaptionPanel.renderBox();`, before `renderCaptionPreview();`):

```js
  CaptionPanel.renderHighlight();
```

- [ ] **Step 3: `static/caption-panel-highlight.js`**

```js
// CAPTIONS panel HIGHLIGHT accordion: karaoke mode toggle, highlight color, max words per
// line — captions-only controls with no TEXT-panel equivalent. Exposes
// window.CaptionPanel.renderHighlight().
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderHighlight = function renderHighlight() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.buttonGroup(document.getElementById("caption-highlight-mode-group"),
    [{ value: "current_word", label: "Current word" }, { value: "progressive_fill", label: "Progressive fill" }],
    preset.highlight_mode,
    (value) => { preset.highlight_mode = value; saveProject(); renderCaptionPreview(); });

  UI.colorSwatch(document.getElementById("caption-highlight-color-field"),
    { label: "Highlight color", value: preset.highlight_color,
      onChange: (v) => { preset.highlight_color = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-max-words-field"),
    { label: "MAX WORDS PER LINE", value: preset.max_words_per_line, step: 1, min: 1, max: 12,
      onChange: (v) => { preset.max_words_per_line = Math.round(v); saveProject(); renderCaptionPreview(); } });
};
```

- [ ] **Step 4: Manual verification**

Open the CAPTIONS panel, expand HIGHLIGHT. Confirm the mode toggle switches between "Current word"/"Progressive fill", the color swatch picks a highlight color, and the max-words field accepts 1–12. Confirm `pytest -q` still green (backend untouched).

- [ ] **Step 5: Update CLAUDE.md, commit**

Add `static/caption-panel-highlight.js` to the file tree/Inventory.

```bash
git add static/index.html static/editor.js static/caption-panel-highlight.js CLAUDE.md
git commit -m "feat: CAPTIONS panel HIGHLIGHT accordion (mode, color, max words per line)"
```

---

### Task 7: Caption words drill-down

**Files:**
- Modify: `static/index.html` (a settings row + a subpanel + script tag)
- Modify: `static/editor.js` (one hidden-reset line + one `renderCaptionPanel()` call)
- Create: `static/caption-panel-words.js`

**Interfaces:**
- Consumes: `project.captions.words` (`CaptionWord[]`), `ensureCaptionTrack`, `saveProject`, `renderCaptionPreview`.
- Produces: `window.CaptionPanel.renderWords()`.

- [ ] **Step 1: Insert the words settings-row and drill-down markup**

In `static/index.html`, insert a settings row right after the `caption-highlight-body` closing `</div>` added in Task 6, still inside `#panel-captions-main`:

```html
          <div class="style-group">
            <div id="caption-words-row"></div>
          </div>
```

And add the drill-down subpanel after `panel-captions-style` (still inside `#panel-captions`, as a sibling):

```html
        <div id="panel-captions-words" hidden>
          <div id="caption-words-subpanel-header"></div>
          <ul id="caption-words-list" class="font-list"></ul>
        </div>
```

Add a script tag after `<script src="/static/caption-panel-highlight.js"></script>`:

```html
<script src="/static/caption-panel-words.js"></script>
```

- [ ] **Step 2: Wire the reset + orchestrator call in `editor.js`**

Add one line to `renderCaptionPanel()`'s top reset block (alongside the existing three `hidden = true` lines):

```js
  document.getElementById("panel-captions-words").hidden = true;
```

And one line at the end of the accordion-render calls (after `CaptionPanel.renderHighlight();`):

```js
  CaptionPanel.renderWords();
```

- [ ] **Step 3: `static/caption-panel-words.js`**

```js
// CAPTIONS panel: "Caption words" drill-down — every transcribed word, inline-editable text
// (empty text deletes the word), timing not editable (per the design spec's v1 scope).
// Exposes window.CaptionPanel.renderWords().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  function openWordsPanel() {
    renderWordsList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-words").hidden = false;
  }

  function closeWordsPanel() {
    document.getElementById("panel-captions-words").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
    renderCaptionPreview();
  }

  function formatWordTime(t) {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, "0");
    return `${String(m).padStart(2, "0")}:${s}`;
  }

  async function commitWordEdit(word, newText) {
    const track = ensureCaptionTrack();
    if (!newText.trim()) {
      track.words = track.words.filter((w) => w.id !== word.id);
    } else {
      word.text = newText.trim();
    }
    await saveProject();
    renderCaptionPreview();
  }

  function renderWordsList() {
    const listEl = document.getElementById("caption-words-list");
    listEl.innerHTML = "";
    const track = ensureCaptionTrack();
    [...track.words].sort((a, b) => a.t_start - b.t_start).forEach((word) => {
      const li = document.createElement("li");
      li.className = "font-list-row";

      const timeEl = document.createElement("span");
      timeEl.className = "font-list-row-name";
      timeEl.textContent = formatWordTime(word.t_start);
      li.appendChild(timeEl);

      const input = document.createElement("input");
      input.type = "text";
      input.value = word.text;
      input.addEventListener("change", () => commitWordEdit(word, input.value).then(renderWordsList));
      li.appendChild(input);

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("caption-words-subpanel-header"), { title: "Caption words", onBack: closeWordsPanel });

  window.CaptionPanel.renderWords = function renderWords() {
    const track = ensureCaptionTrack();
    UI.settingsRow(document.getElementById("caption-words-row"), {
      label: "Caption words", value: String(track.words.length), onClick: openWordsPanel,
    });
  };
})();
```

- [ ] **Step 4: Manual verification**

With a project that has `project.captions.words` populated (once Task 9's Auto-caption button lands you can generate real ones; for now you can temporarily hand-edit a saved project JSON in `data/projects/` to add a couple of words, reload, and confirm), open the CAPTIONS panel, click "Caption words", confirm each word shows its start time and an editable text input, editing and blurring updates the word, and clearing a word's text removes it from the list on next open. Confirm `pytest -q` still green.

- [ ] **Step 5: Update CLAUDE.md, commit**

Add `static/caption-panel-words.js` to the file tree/Inventory.

```bash
git add static/index.html static/editor.js static/caption-panel-words.js CLAUDE.md
git commit -m "feat: CAPTIONS panel caption-words drill-down, inline editable"
```

---

### Task 8: `POST /api/projects/{pid}/transcribe` route

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_main.py` (create if it doesn't exist — check first; if `app/main.py` has no existing route tests, follow the `TestClient` pattern used elsewhere in the codebase, e.g. `tests/test_store.py`'s style adapted for HTTP)

**Interfaces:**
- Consumes: `ffmpeg_cmd.build_audio_cmd` (Task 3), `transcribe.transcribe_file` (Task 2), `media.run_export` (existing), `store.load_project`/`save_project` (existing).
- Produces: HTTP `POST /api/projects/{pid}/transcribe` → updated `Project` JSON with `captions` populated.

- [ ] **Step 1: Write the failing test**

Create `tests/test_transcribe_route.py`:

```python
# Tests for POST /api/projects/{pid}/transcribe: wiring only, mocks both ffmpeg and the model.
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app, DATA_DIR
from app.models import Project, CaptionWord, CaptionTrack, TextPreset
from app import store

client = TestClient(app)

def test_transcribe_creates_captions_and_preset(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[CaptionWord(text="hi", t_start=0.0, t_end=0.4)]):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    assert res.status_code == 200
    body = res.json()
    assert body["captions"]["words"][0]["text"] == "hi"
    preset_id = body["captions"]["preset_id"]
    assert preset_id in body["text_presets"]

def test_transcribe_overwrites_words_keeps_existing_preset_id(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    preset = TextPreset(name="Caption", size_px=50)
    p = Project(name="r", text_presets={preset.id: preset},
                captions=CaptionTrack(words=[CaptionWord(text="old", t_start=0, t_end=1)], preset_id=preset.id))
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[CaptionWord(text="new", t_start=0.0, t_end=0.4)]):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    body = res.json()
    assert [w["text"] for w in body["captions"]["words"]] == ["new"]
    assert body["captions"]["preset_id"] == preset.id
    assert body["text_presets"][preset.id]["size_px"] == 50
```

- [ ] **Step 2: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe_route.py -v`
Expected: FAIL — `404 Not Found` (route doesn't exist).

- [ ] **Step 3: Implement**

In `app/main.py`, add to the imports:

```python
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe
```

(extends the existing `from app.models import ...` and `from app import ...` lines with `CaptionTrack` and `transcribe`.)

Add the route (after the existing `/api/presets` routes, before `/media`):

```python
@app.post("/api/projects/{pid}/transcribe")
def transcribe_project(pid: str) -> Project:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_dir / f"{p.id[:8]}-audio.wav"

    media.run_export(ffmpeg_cmd.build_audio_cmd(p, str(wav_path)))
    words = transcribe.transcribe_file(str(wav_path))

    if p.captions:
        p.captions.words = words
    else:
        preset = TextPreset(name="Caption", size_px=72, x=540, y=1520, align="center",
                             highlight_color="#FFD400", highlight_mode="current_word", max_words_per_line=4)
        p.text_presets[preset.id] = preset
        p.captions = CaptionTrack(words=words, preset_id=preset.id)

    store.save_project(p, DATA_DIR)
    return p
```

- [ ] **Step 4: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

- [ ] **Step 5: Update CLAUDE.md**

Extend `app/main.py`'s Inventory bullet route list with `POST /api/projects/{pid}/transcribe` (added 2026-07-19).

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_transcribe_route.py CLAUDE.md
git commit -m "feat: transcribe route — audio export + faster-whisper, creates/refreshes captions"
```

---

### Task 9: "Auto-caption" button wiring

**Files:**
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: `ensureCaptionTrack()` (Task 5), `POST /api/projects/{pid}/transcribe` (Task 8).
- Produces: click handler on `#caption-auto-btn` (markup already added by Task 5).

- [ ] **Step 1: Add the button wiring**

In `static/editor.js`, add near the other top-level `document.getElementById(...).addEventListener(...)` wiring calls (e.g. near `document.getElementById("style-panel-collapse-toggle")`):

```js
document.getElementById("caption-auto-btn").addEventListener("click", async () => {
  ensureCaptionTrack();
  const btn = document.getElementById("caption-auto-btn");
  btn.disabled = true;
  btn.textContent = "Transcribing…";
  try {
    const res = await fetch(`/api/projects/${project.id}/transcribe`, { method: "POST" });
    project = await res.json();
    await renderCaptionPanel();
    renderTimeline();
  } finally {
    btn.disabled = false;
    btn.textContent = "Auto-caption";
  }
});
```

- [ ] **Step 2: Manual verification**

With a project containing at least one real clip with speech, install the `ml` extra (`.venv/Scripts/pip install -e .[ml]`) if not already installed, open CAPTIONS, click Auto-caption. Confirm the button shows "Transcribing…" and disables, then re-enables; confirm the empty-state message disappears and "Caption words" (Task 7) now lists real transcribed words; confirm the CAPTIONS row in the timeline strip (already wired, `Timeline.groupWords`) now shows blocks. Confirm re-clicking Auto-caption overwrites the words but preserves any style changes made in FONT/BOX/HIGHLIGHT. Run `pytest -q` — unchanged backend, still green.

- [ ] **Step 3: Commit**

```bash
git add static/editor.js
git commit -m "feat: wire Auto-caption button to the transcribe route"
```

---

### Task 10: Preview caption overlay + live highlight tick

**Files:**
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `project.captions.words`, the caption track's `TextPreset` (via `project.text_presets[project.captions.preset_id]`), `Preview.currentTimelineTime()` (existing).
- Produces: `window.Preview.renderCaptions(project, presets, timelineTime)`, called by `editor.js`'s `renderCaptionPreview()` (Task 5) and by every existing call site that currently calls `renderText`/`VideoBoxPreview.render` together (so captions render during playback, not just when the CAPTIONS panel is open).

- [ ] **Step 1: Add a client-side `groupWords` port and `renderCaptions`**

`Timeline.groupWords(words, max)` (in `static/timeline.js`) already implements the exact grouping algorithm needed — reuse it directly rather than duplicating it.

In `static/preview.js`, add (near `renderText`, reusing the module's existing `hexToRgba` helper):

```js
  function activeCaptionGroup(words, maxWords, timelineTime) {
    const groups = Timeline.groupWords(words, maxWords);
    return groups.find((g) => timelineTime >= g[0].t_start && timelineTime < g[g.length - 1].t_end) || null;
  }

  function renderCaptions(project, presets, timelineTime) {
    overlay.querySelectorAll(".caption-block").forEach((el) => el.remove());
    const track = project.captions;
    if (!track || !track.words.length) return;
    const preset = presets[track.preset_id];
    if (!preset) return;

    const group = activeCaptionGroup(track.words, preset.max_words_per_line, timelineTime);
    if (!group) return;

    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) stageH = stageW * 16 / 9;

    const div = document.createElement("div");
    div.className = `caption-block text-block--align-${preset.align}`;
    div.style.zIndex = String(track.z_index ?? 0);
    div.style.left = (preset.x / 1080 * stageW) + "px";
    div.style.top = (preset.y / 1920 * stageH) + "px";
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
    div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";
    div.style.pointerEvents = "none";

    group.forEach((word, i) => {
      const span = document.createElement("span");
      let isHighlighted;
      if (preset.highlight_mode === "progressive_fill") {
        isHighlighted = timelineTime >= word.t_start;
      } else {
        isHighlighted = timelineTime >= word.t_start && timelineTime < word.t_end;
      }
      span.style.color = isHighlighted ? preset.highlight_color : preset.color;
      span.textContent = word.text + (i < group.length - 1 ? " " : "");
      div.appendChild(span);
    });

    overlay.appendChild(div);
  }
```

Add `renderCaptions` to the module's returned object (the final `return { load, locate, ... }` statement at the bottom of the IIFE):

```js
  return { load, locate, sequenceDuration, seek, renderText, renderCaptions, currentTimelineTime: computeTimelineTime, play: doPlay, pause: doPause, restart: doRestart, isPaused, setSelectedTextBlock, setOnStageTextActivate };
```

- [ ] **Step 2: Call `renderCaptions` alongside every existing `renderText`/`VideoBoxPreview.render` pairing**

In `static/preview.js`, there are four call sites that currently call `renderText(...)` followed by `VideoBoxPreview.render(...)`: inside `virtualTick`, the `timeupdate` listener, `seek`, and the `ResizeObserver` callback. Add `renderCaptions(project, presets, <the same timelineTime variable>)` immediately after each `renderText(...)` call at those four sites — e.g. in the `timeupdate` listener:

```js
    if (textProject) renderText(textProject, textPresets, timelineTime);
    if (textProject) renderCaptions(textProject, textPresets, timelineTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], timelineTime);
```

(mirror the same three-line pattern at the other three call sites, substituting each site's own timeline-time variable: `virtualTime` in `virtualTick`, `virtualTime` in `seek`'s zero-clip branch, and `computeTimelineTime()` in the `ResizeObserver` callback.)

- [ ] **Step 3: Add a `.caption-block` CSS rule**

In `static/css/components/stage.css`, add (near the existing `.text-block` rule):

```css
.caption-block {
  position: absolute;
  white-space: pre;
  box-sizing: border-box;
}
```

- [ ] **Step 4: Manual verification**

With a project that has captions (Task 9), play the reel. Confirm the active caption line appears over the video at the styled position, switches to the next line as playback proceeds, and the highlight mode set in the HIGHLIGHT accordion visibly applies: **current_word** — only the word currently being spoken is colored; **progressive_fill** — every spoken word in the line stays colored, accumulating left to right. Toggle the mode live while playing and confirm the overlay updates on the next render. Confirm text block and video-box overlays still render correctly alongside captions (z-index unaffected). Run `pytest -q` — unchanged backend, still green.

- [ ] **Step 5: Update CLAUDE.md, commit**

Extend `static/preview.js`'s Inventory bullet to mention `Preview.renderCaptions()`.

```bash
git add static/preview.js static/css/components/stage.css CLAUDE.md
git commit -m "feat: caption overlay in preview with live current-word/progressive-fill highlight"
```

---

### Task 11: Captions burned into export

**Files:**
- Modify: `app/ffmpeg_cmd.py`, `app/main.py`
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `ass_render.render_caption_ass` (Task 4).
- Produces: `ffmpeg_cmd.build_export_cmd(..., caption_ass_path: str | None = None)` — chains one more `ass` filter as the final stage, on top of any existing bands/ass_path output, regardless of whether video boxes are present.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ffmpeg_cmd.py`:

```python
def test_caption_ass_path_chained_as_final_filter_no_bands():
    cmd = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass", caption_ass_path="C:/tmp/caps.ass")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[vo]ass='C\\:/tmp/caps.ass'" in fc
    assert cmd[cmd.index("-map") + 1] == "[vcap]"

def test_caption_ass_path_chained_after_bands():
    from app.models import VideoBoxLayer
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=3, start=0, width=200, height=200)
    bands = [{"kind": "video_box", "video_box": box}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands, caption_ass_path="C:/tmp/caps.ass")
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "ass='C\\:/tmp/caps.ass'" in fc
    assert cmd[cmd.index("-map") + 1] == "[vcap]"

def test_no_caption_ass_path_leaves_vmap_unchanged():
    cmd = build_export_cmd(proj(), "out.mp4")
    assert "vcap" not in cmd[cmd.index("-filter_complex") + 1]
```

- [ ] **Step 2: Run, verify FAIL**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: FAIL — `TypeError: build_export_cmd() got an unexpected keyword argument 'caption_ass_path'`.

- [ ] **Step 3: Implement**

In `app/ffmpeg_cmd.py`, change `build_export_cmd`'s signature and both its return paths:

```python
def build_export_cmd(p: Project, out_path: str, ass_path: str | None = None, bands: list[dict] | None = None, caption_ass_path: str | None = None) -> list[str]:
    clips = ordered(p.clips)
    cmd = ["ffmpeg", "-y"]
    parts = []
    for i, c in enumerate(clips):
        cmd += ["-i", c.file_path]
        parts.append(
            f"[{i}:v]trim=start={_num(c.in_point)}:end={_num(c.out_point)},setpts=PTS-STARTPTS,"
            f"scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
            f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={p.fps}[v{i}];"
            f"[{i}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS[a{i}];")
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"

    if bands is None:
        vmap = "[vc]"
        if ass_path:
            fc += f";[vc]ass='{escape_filter_path(ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vo]"
            vmap = "[vo]"
        if caption_ass_path:
            fc += f";{vmap}ass='{escape_filter_path(caption_ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vcap]"
            vmap = "[vcap]"
        cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", out_path]
        return cmd

    current = "[vc]"
    next_input_index = len(clips)
    for step, band in enumerate(bands):
        if band["kind"] == "ass":
            out_label = f"[ass{step}]"
            fc += f";{current}ass='{escape_filter_path(band['path'])}':fontsdir='{escape_filter_path('static/fonts')}'{out_label}"
            current = out_label
        else:
            v = band["video_box"]
            cmd += ["-i", v.file_path]
            end = v.start + (v.out_point - v.in_point)
            out_label = f"[ov{step}]"
            fc += (f";[{next_input_index}:v]trim=start={_num(v.in_point)}:end={_num(v.out_point)},"
                   f"setpts=PTS-STARTPTS+{_num(v.start)}/TB,scale={v.width}:{v.height}[box{step}]"
                   f";{current}[box{step}]overlay=x={v.x}:y={v.y}:"
                   f"enable='between(t\\,{_num(v.start)}\\,{_num(end)})'{out_label}")
            current = out_label
            next_input_index += 1

    if caption_ass_path:
        fc += f";{current}ass='{escape_filter_path(caption_ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vcap]"
        current = "[vcap]"

    cmd += ["-filter_complex", fc, "-map", current, "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", out_path]
    return cmd
```

- [ ] **Step 4: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS.

- [ ] **Step 5: Wire captions into the export route**

In `app/main.py`'s `export_project`, compute `caption_ass_path` once before the `if p.video_boxes:` branch, and pass it to both `build_export_cmd` calls:

```python
@app.post("/api/projects/{pid}/export")
def export_project(pid: str) -> dict:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{p.name}-{p.id[:8]}.mp4"

    caption_ass_path = None
    if p.captions and p.captions.words:
        caption_preset = p.text_presets.get(p.captions.preset_id) or TextPreset(name="Caption")
        cap_file = out_dir / f"{p.name}-{p.id[:8]}-captions.ass"
        cap_file.write_text(ass_render.render_caption_ass(p, caption_preset), encoding="utf-8")
        caption_ass_path = str(cap_file)

    if p.video_boxes:
        bands = []
        for i, band in enumerate(timeline.banded_layers(p)):
            if band["kind"] == "text":
                ass_file = out_dir / f"{p.name}-{p.id[:8]}-band{i}.ass"
                ass_file.write_text(
                    ass_render.render_ass(p, p.text_presets, text_blocks=band["text_blocks"]),
                    encoding="utf-8")
                bands.append({"kind": "ass", "path": str(ass_file)})
            else:
                bands.append({"kind": "video_box", "video_box": band["video_box"]})
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), bands=bands, caption_ass_path=caption_ass_path)
    else:
        ass_path = None
        if p.text_blocks:
            ass_file = out_dir / f"{p.name}-{p.id[:8]}.ass"
            ass_file.write_text(ass_render.render_ass(p, p.text_presets), encoding="utf-8")
            ass_path = str(ass_file)
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), ass_path, caption_ass_path=caption_ass_path)

    media.run_export(cmd)
    return {"out_path": str(out_path)}
```

- [ ] **Step 6: Run, verify PASS**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (route change has no dedicated new test — covered by `build_export_cmd`'s tests plus manual verification below).

- [ ] **Step 7: Manual verification**

Export a project with captions (with or without a text block/video box present). Play the resulting mp4 and confirm the karaoke captions burn in, matching the preview's highlight mode, position, and style.

- [ ] **Step 8: Update CLAUDE.md, commit**

Extend `app/ffmpeg_cmd.py`'s and `app/main.py`'s Inventory bullets to mention `caption_ass_path` chaining as the always-final filter stage.

```bash
git add app/ffmpeg_cmd.py app/main.py tests/test_ffmpeg_cmd.py CLAUDE.md
git commit -m "feat: burn karaoke captions into export, always on top of text/video-box bands"
```

---

### Task 12: Phase checkpoint — verification and finish branch

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all green.

- [ ] **Step 2: End-to-end manual walkthrough**

Start the dev server, open a project with real clips containing speech:
1. Open CAPTIONS panel on a fresh project — confirm Auto-caption button, empty state, and STYLE/FONT/BOX/HIGHLIGHT accordions with caption-appropriate defaults (72px, bottom-anchored) are all present *before* transcribing.
2. Click Auto-caption → confirm words appear timed to the audio, timeline CAPTIONS row populates.
3. Open Caption words, fix a wrong word, confirm it updates live in the preview overlay.
4. Toggle HIGHLIGHT mode between Current word and Progressive fill, confirm both render correctly during playback.
5. Adjust Max words per line, confirm line grouping changes in preview.
6. Style the caption track (font/box/position) independently of any text block, confirm no cross-contamination.
7. Re-run Auto-caption, confirm words refresh but style persists.
8. Export, confirm the mp4's karaoke captions match the preview (position, style, highlight mode).

- [ ] **Step 3: Run `superpowers:finishing-a-development-branch`**

Use the skill to decide merge/PR/cleanup for the branch(es) this phase's tasks were worked on.
