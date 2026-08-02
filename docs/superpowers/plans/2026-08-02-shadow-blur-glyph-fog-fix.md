# Shadow Blur Glyph Fog Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix exported text/captions rendering with foggy/blurred letters when a preset has Shadow ON and BLUR > 0, by isolating ASS's `\blur` tag to a separate shadow-only dialogue line instead of applying it to the whole glyph (fill+outline+shadow).

**Architecture:** For each of the three shadow-tag call sites in `app/ass_render.py` (`_block_dialogue`, `_karaoke_dialogue`, `_current_word_dialogues`), emit an extra "shadow layer" ASS `Dialogue` line — identical text, fill/outline forced transparent (`\1a&HFF&\3a&HFF&`), carrying the `\4c`/`\4a`/`\xshad`/`\yshad`/`\blur` tags — positioned *before* the main text line in event order (same layer, drawn underneath). The main text line drops those shadow tags entirely, so its fill/outline stay crisp. The shadow line is only emitted when shadow is actually on; the no-shadow case is byte-identical to today.

**Tech Stack:** Python (pydantic models unaffected), pytest.

## Global Constraints

- No change to `static/preview-text.js` / `static/preview-captions.js` (CSS preview already isolates blur to the shadow layer correctly).
- No change to `TextPreset` fields, UI controls, or field ranges.
- The no-shadow case (`p.shadow == False` and, for `_current_word_dialogues`, `p.spotlight_shadow == False` too) must produce byte-identical ASS output to today — verified by existing passing tests that must continue to pass unmodified.
- Shadow line uses the `Name` field (5th field in `Dialogue: Layer,Start,End,Style,Name,...`) set to the literal string `shadow` to distinguish it from the main line in tests; the `Style` field stays the real registered style name (`P{id[:8]}` or `Caption`) so the shadow copy renders with the correct font/size.

---

### Task 1: Isolate shadow blur to a separate ASS dialogue line

**Files:**
- Modify: `app/ass_render.py:220-321` (`_shadow_tag`, `_block_dialogue`, `_karaoke_dialogue`, `_current_word_dialogues`) and `app/ass_render.py:241-265, 411-439` (`render_ass`, `render_caption_ass` call sites)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: existing `TextPreset` fields `shadow`, `shadow_color`, `shadow_offset_x`, `shadow_offset_y`, `shadow_blur`, `spotlight_shadow`, `spotlight_shadow_color`, `spotlight_shadow_offset_x`, `spotlight_shadow_offset_y`, `spotlight_shadow_blur` (all pre-existing, unchanged).
- Produces: `_block_dialogue(b, p, weight=None) -> list[str]` (was `-> str`), `_karaoke_dialogue(page, p) -> list[str]` (was `-> str`), `_current_word_dialogues(page, p) -> list[str]` (unchanged return type, different line count when shadow is on). New private helper `_shadow_only_fx(p: TextPreset) -> str`.

- [ ] **Step 1: Write failing tests pinning the new two-line shadow structure for `_block_dialogue`**

Add to `tests/test_ass_render.py`, right after the existing `test_block_dialogue_shadow_on_emits_offset_blur_and_color_tags` (around line 55):

```python
def test_block_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur():
    pr = TextPreset(name="Pop", shadow=True, shadow_color="#FF00FF",
                     shadow_offset_x=6, shadow_offset_y=-3, shadow_blur=8)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    dialogue_lines = [l for l in out.splitlines() if l.startswith("Dialogue:") and "H" in l]
    assert len(dialogue_lines) == 2
    shadow_line, main_line = dialogue_lines
    # Name field (5th comma-separated field) marks the shadow line
    assert shadow_line.split(",")[4] == "shadow"
    assert main_line.split(",")[4] == ""
    # Shadow line hides fill/outline so only the blurred shadow copy is visible
    assert "\\1a&HFF&\\3a&HFF&" in shadow_line
    assert "\\blur8" in shadow_line
    # Main line must NOT carry any shadow/blur tags — this is the bug fix
    assert "\\blur" not in main_line
    assert "\\4c" not in main_line
    assert "\\xshad" not in main_line
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py::test_block_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur -v`
Expected: FAIL (today `_block_dialogue` returns one line, and that line's `\blur8` tag would make `assert "\\blur" not in main_line` fail since `main_line` — the second element via list unpacking — doesn't exist / IndexError, or the existing single line still carries `\blur`).

- [ ] **Step 3: Add `_shadow_only_fx` helper and rewrite `_block_dialogue`**

In `app/ass_render.py`, add this helper directly after `_shadow_tag` (currently ending at line 228):

```python
def _shadow_only_fx(p: TextPreset) -> str:
    """Override tags for a shadow-ONLY render: fill and outline forced fully transparent so only
    the offset, blurred back-copy (the shadow) is visible. Isolates \\blur to this layer, since
    libass's \\blur otherwise softens the whole composited glyph (fill+outline+shadow) when
    applied in the same override block as the main text — the cause of "foggy" export letters
    when a preset has Shadow on with BLUR > 0, even though the CSS preview only blurs the
    shadow layer. Caller must guard on p.shadow being true before emitting a line with this."""
    return "\\1a&HFF&\\3a&HFF&" + _shadow_tag(p)
```

Replace `_block_dialogue` (current lines 230-239):

```python
def _block_dialogue(b, p: TextPreset, weight: int | None = None) -> list[str]:
    pos_fx = f"\\pos({p.x},{p.y})"
    entrance_fx = ""
    if p.entrance == "fade_pop":
        entrance_fx = "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    text, _, _, _ = _wrapped_lines_and_size(b, p, weight)
    if b.formatting_runs:
        body = _tagged_text(b, p, text)
    else:
        body = text.replace("\n", "\\N")
    lines = []
    if p.shadow:
        shadow_fx = pos_fx + _shadow_only_fx(p) + entrance_fx
        lines.append(f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},shadow,0,0,0,,{{{shadow_fx}}}{body}")
    fx = pos_fx + entrance_fx
    lines.append(f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{body}")
    return lines
```

In `render_ass` (currently `event_lines.append(_block_dialogue(b, p, weight))` around line 262), change to:

```python
        event_lines.extend(_block_dialogue(b, p, weight))
```

- [ ] **Step 4: Run the test to verify it passes, and run the full existing shadow-related block tests**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "block_dialogue or text_block or entrance or render_ass_two_blocks or style_line or highlighted_run or block_text_case or no_highlight_runs" -v`
Expected: all PASS, including the new test and every pre-existing test in this filter (no regressions — the no-shadow path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "fix: isolate shadow blur to its own ASS layer for text blocks"
```

- [ ] **Step 6: Write failing test pinning the same fix for `_karaoke_dialogue`**

Add to `tests/test_ass_render.py`, right after `test_karaoke_dialogue_shadow_on_emits_tags` (around line 497):

```python
def test_karaoke_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill",
                     shadow=True, shadow_color="#00FFFF", shadow_offset_x=2, shadow_offset_y=5, shadow_blur=3)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogue_lines = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogue_lines) == 2
    shadow_line, main_line = dialogue_lines
    assert shadow_line.split(",")[4] == "shadow"
    assert main_line.split(",")[4] == ""
    assert "\\blur3" in shadow_line
    assert "\\blur" not in main_line and "\\4c" not in main_line
```

- [ ] **Step 7: Run the new test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py::test_karaoke_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur -v`
Expected: FAIL (today one dialogue line carries both fill and `\blur3`).

- [ ] **Step 8: Rewrite `_karaoke_dialogue`**

Replace the current `_karaoke_dialogue` (lines 282-290):

```python
def _karaoke_dialogue(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    line_bodies = []
    for line in page:
        body = "".join(f"{{\\k{max(1, round((w.t_end - w.t_start) * 100))}}}{w.text} " for w in line).rstrip()
        line_bodies.append(body)
    body = "\\N".join(line_bodies)
    start, end = page[0][0].t_start, page[-1][-1].t_end
    lines = []
    if p.shadow:
        shadow_fx = f"\\pos({p.x},{p.y})" + _shadow_only_fx(p)
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},shadow,0,0,0,,{{{shadow_fx}}}{body}")
    fx = f"\\pos({p.x},{p.y})"
    lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}")
    return lines
```

In `render_caption_ass` (currently `event_lines.append(_karaoke_dialogue(page, preset))` around line 436), change to:

```python
        else:
            event_lines.extend(_karaoke_dialogue(page, preset))
```

- [ ] **Step 9: Run the test to verify it passes, and run the full karaoke/progressive-fill test set**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "karaoke or progressive_fill or render_caption_ass" -v`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "fix: isolate shadow blur to its own ASS layer for karaoke captions"
```

- [ ] **Step 11: Write failing tests pinning the same fix for `_current_word_dialogues`**

Add to `tests/test_ass_render.py`, right after `test_current_word_dialogue_shadow_on_emits_tags` (around line 514):

```python
def test_current_word_dialogue_shadow_on_shadow_line_precedes_main_and_main_has_no_blur():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="current_word",
                     shadow=True, shadow_color="#0000FF", shadow_offset_x=4, shadow_offset_y=-2, shadow_blur=1)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogue_lines = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogue_lines) == 2  # 1 word * (shadow line + main line)
    shadow_line, main_line = dialogue_lines
    assert shadow_line.split(",")[4] == "shadow"
    assert main_line.split(",")[4] == ""
    assert "\\blur1" in shadow_line
    assert "\\blur" not in main_line and "\\4c" not in main_line

def test_current_word_dialogue_no_shadow_line_when_both_shadow_flags_off():
    pr = TextPreset(name="Cap", highlight_mode="current_word", shadow=False, spotlight_shadow=False)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0)]
    dialogues = _current_word_dialogues([words], pr)
    assert len(dialogues) == 2  # one main line per active word, no shadow lines
    assert all(d.split(",")[4] == "" for d in dialogues)

def test_current_word_dialogue_spotlight_shadow_only_still_emits_shadow_line():
    # p.shadow is off but spotlight_shadow (the active word's own override) is on — a shadow
    # line must still appear for the active word, since something is visible to blur.
    pr = TextPreset(name="Cap", highlight_mode="current_word", shadow=False, spotlight_shadow=True,
                     spotlight_shadow_blur=2)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    dialogues = _current_word_dialogues([words], pr)
    assert len(dialogues) == 2  # shadow line + main line for the one active word
    assert any(d.split(",")[4] == "shadow" and "\\blur2" in d for d in dialogues)
```

- [ ] **Step 12: Run the new tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "current_word_dialogue_shadow_on_shadow_line or current_word_dialogue_no_shadow_line or current_word_dialogue_spotlight_shadow_only" -v`
Expected: FAIL — today `_current_word_dialogues` emits exactly one line per active word regardless of shadow config, and that line carries `\blur` alongside the fill color.

- [ ] **Step 13: Rewrite `_current_word_dialogues`**

Replace the current `_current_word_dialogues` (lines 292-321):

```python
def _current_word_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    fx = f"\\pos({p.x},{p.y})"
    highlight = _ass_override_color(p.spotlight_color)
    normal = _ass_override_color(p.color)
    outline_on = f"\\3c{_ass_override_color(p.spotlight_outline_color)}\\bord{p.spotlight_outline_px}" if p.spotlight_outline_px > 0 else ""
    outline_off = f"\\3c{_ass_override_color(p.outline_color)}\\bord{p.outline_px}" if p.spotlight_outline_px > 0 else ""
    shadow_on = (f"\\4c{_ass_override_color(p.spotlight_shadow_color)}\\4a00"
                 f"\\xshad{p.spotlight_shadow_offset_x}\\yshad{p.spotlight_shadow_offset_y}\\blur{p.spotlight_shadow_blur}"
                 if p.spotlight_shadow else "")
    shadow_off = ("\\4c" + _ass_override_color(p.shadow_color) + "\\4a00" +
                  f"\\xshad{p.shadow_offset_x}\\yshad{p.shadow_offset_y}\\blur{p.shadow_blur}"
                  if p.spotlight_shadow and p.shadow else
                  ("\\4a&HFF&" if p.spotlight_shadow else ""))
    has_any_shadow = p.shadow or p.spotlight_shadow
    shadow_fx = fx + "\\1a&HFF&\\3a&HFF&" + _shadow_tag(p)
    flat = [word for line in page for word in line]
    dialogues = []
    for active in flat:
        main_bodies = []
        shadow_bodies = []
        for line in page:
            main_segments = []
            shadow_segments = []
            for j, other in enumerate(line):
                seg = other.text + (" " if j < len(line) - 1 else "")
                if other is active:
                    main_segments.append(f"{{\\1c{highlight}{outline_on}}}{seg}{{\\1c{normal}{outline_off}}}")
                    shadow_segments.append(f"{{{shadow_on}}}{seg}{{{shadow_off}}}")
                else:
                    main_segments.append(seg)
                    shadow_segments.append(seg)
            main_bodies.append("".join(main_segments))
            shadow_bodies.append("".join(shadow_segments))
        main_body = "\\N".join(main_bodies)
        shadow_body = "\\N".join(shadow_bodies)
        start, end = ass_time(active.t_start), ass_time(active.t_end)
        if has_any_shadow:
            dialogues.append(f"Dialogue: 0,{start},{end},{CAPTION_STYLE_NAME},shadow,0,0,0,,{{{shadow_fx}}}{shadow_body}")
        dialogues.append(f"Dialogue: 0,{start},{end},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{main_body}")
    return dialogues
```

No caller changes needed here — `render_caption_ass` already does `event_lines.extend(_current_word_dialogues(page, preset))`.

- [ ] **Step 14: Run the test to verify it passes, and run the full current_word/captions test set**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "current_word or render_caption_ass or active_word_highlight" -v`
Expected: all PASS.

- [ ] **Step 15: Run the entire test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS, no regressions anywhere (export smoke test, ffmpeg_cmd tests, etc. are unaffected by this module but must still pass).

- [ ] **Step 16: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "fix: isolate shadow blur to its own ASS layer for current-word captions"
```

---

## Manual verification (not automated — requires ffmpeg)

Since this fixes a visual export artifact, after all automated tests pass:
1. On a throwaway project (per project convention — never test on real project data), create a TEXT block, turn Shadow ON with BLUR set to e.g. 10px.
2. Export the project.
3. Confirm the exported mp4's letters are crisp (not foggy) while the shadow itself is visibly soft — matching what the editor preview already showed before this fix.
