# Text Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drop-shadow style option to `TextPreset` — usable on both text blocks and captions — with live-preview rendering and ASS export burn-in.

**Architecture:** 5 new fields on `TextPreset` (`shadow`, `shadow_color`, `shadow_offset_x`, `shadow_offset_y`, `shadow_blur`), a mirrored "Shadow" control row in the TEXT and CAPTIONS Design tabs, whole-block CSS `text-shadow` in the two preview renderers, and ASS override tags (`\4c\4a\xshad\yshad\blur`) prepended to each dialogue line's `fx` string in the export renderer.

**Tech Stack:** Python/Pydantic (`app/models.py`), Python ASS text generation (`app/ass_render.py`), vanilla JS/DOM (`static/*.js`), no build step.

## Global Constraints

- Shadow is a whole-`TextPreset` setting — no per-character-range (`FormatRun`) override.
- Defaults (`shadow=False`) must keep existing saved projects rendering byte-identical (both preview and ASS export) until a user explicitly turns shadow on.
- `shadow_offset_x`/`shadow_offset_y` range -40..40 px (canvas px, 1080×1920 space); `shadow_blur` range 0..40 px.
- No inline `style="..."` in `static/index.html` — new markup uses classes only; the shadow *value* itself is set via JS `el.style.*` at render time (same convention already used for `text-color-field` etc., which is JS-computed styling on dynamically rendered preview elements, not static markup).
- Follow the existing outline-field pattern exactly: same file locations, same `UI.colorSwatch`/`UI.numberField` components, same `saveProject()` + `render*Preview()` call sequence after every change.

---

### Task 1: Data model — add shadow fields to `TextPreset`

**Files:**
- Modify: `app/models.py:51-80` (the `TextPreset` class)
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `TextPreset.shadow: bool`, `TextPreset.shadow_color: str`, `TextPreset.shadow_offset_x: int`, `TextPreset.shadow_offset_y: int`, `TextPreset.shadow_blur: int` — consumed by Tasks 2-7.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_models.py` (after `test_text_preset_highlight_defaults_off`, around line 173):

```python
def test_text_preset_shadow_defaults_off():
    p = TextPreset(name="Pop")
    assert p.shadow is False
    assert p.shadow_color == "#000000"
    assert p.shadow_offset_x == 4
    assert p.shadow_offset_y == 4
    assert p.shadow_blur == 0

def test_text_preset_shadow_round_trip():
    p = TextPreset(name="Pop", shadow=True, shadow_color="#FF00FF",
                    shadow_offset_x=-10, shadow_offset_y=20, shadow_blur=8)
    loaded = TextPreset.model_validate_json(p.model_dump_json())
    assert loaded == p

def test_text_preset_old_saved_json_without_shadow_fields_loads_with_defaults():
    import json
    old_json = json.dumps({"name": "Pop"})
    loaded = TextPreset.model_validate_json(old_json)
    assert loaded.shadow is False
    assert loaded.shadow_color == "#000000"
    assert (loaded.shadow_offset_x, loaded.shadow_offset_y, loaded.shadow_blur) == (4, 4, 0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k shadow -v`
Expected: FAIL — `AttributeError: 'TextPreset' object has no attribute 'shadow'`

- [ ] **Step 3: Add the fields**

In `app/models.py`, inside `class TextPreset(BaseModel):`, insert directly after the `outline_px: int = 4` line (line 58):

```python
    shadow: bool = False           # drop-shadow on/off
    shadow_color: str = "#000000"
    shadow_offset_x: int = 4       # px on the 1080x1920 canvas; UI clamps -40..40
    shadow_offset_y: int = 4       # px; UI clamps -40..40
    shadow_blur: int = 0           # px; UI clamps 0..40
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: all PASS (including the 3 new shadow tests and every pre-existing test in the file)

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add text shadow fields to TextPreset"
```

---

### Task 2: TEXT panel UI — Shadow control row

**Files:**
- Modify: `static/index.html` (inside `#text-font-body`, after the outline-px row, around line 554-557)
- Modify: `static/text-panel-font-style.js`

**Interfaces:**
- Consumes: `TextPreset.shadow/shadow_color/shadow_offset_x/shadow_offset_y/shadow_blur` (Task 1). Globals already available in this file's scope: `currentTextBlock()`, `ensureTextPreset(id)`, `saveProject()`, `renderTextPreview()` (all defined elsewhere in `panel-text.js`/`editor.js`, already used by the rest of this file).
- Produces: nothing consumed by later tasks — this is leaf UI wiring.

- [ ] **Step 1: Add markup to `static/index.html`**

In `static/index.html`, find this block (currently ends the `#text-font-body` div, around line 550-557):

```html
          <div class="style-group">
            <label id="text-color-field"></label>
          </div>

          <div class="style-group">
            <label id="text-outline-color-field"></label>
          </div>

          <div class="style-group">
            <label id="text-outline-px-field"></label>
          </div>
        </div>
```

Replace it with (adds a shadow toggle row + 3 new fields after the outline-px row, still inside `#text-font-body`):

```html
          <div class="style-group">
            <label id="text-color-field"></label>
          </div>

          <div class="style-group">
            <label id="text-outline-color-field"></label>
          </div>

          <div class="style-group">
            <label id="text-outline-px-field"></label>
          </div>

          <div class="style-group-label">SHADOW</div>
          <div class="style-group">
            <div id="text-shadow-toggle-group"></div>
          </div>

          <div class="style-group">
            <label id="text-shadow-color-field"></label>
          </div>

          <div class="style-group">
            <div class="style-row">
              <label id="text-shadow-offset-x-field"></label>
              <label id="text-shadow-offset-y-field"></label>
            </div>
          </div>

          <div class="style-group">
            <label id="text-shadow-blur-field"></label>
          </div>
        </div>
```

- [ ] **Step 2: Wire the controls in `static/text-panel-font-style.js`**

At the end of `window.TextPanel.renderFontStyle` (append right before the final closing `};` of the function, i.e. after the existing `text-outline-px-field` `UI.numberField(...)` call that ends around line 158):

```js
    const shadowFieldsHidden = !preset.shadow;
    document.getElementById("text-shadow-color-field").hidden = shadowFieldsHidden;
    document.getElementById("text-shadow-offset-x-field").hidden = shadowFieldsHidden;
    document.getElementById("text-shadow-offset-y-field").hidden = shadowFieldsHidden;
    document.getElementById("text-shadow-blur-field").hidden = shadowFieldsHidden;

    UI.buttonGroup(document.getElementById("text-shadow-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.shadow ? "on" : "off",
      (value) => {
        preset.shadow = value === "on";
        saveProject();
        renderTextPreview();
        window.TextPanel.renderFontStyle();
      });

    UI.colorSwatch(document.getElementById("text-shadow-color-field"),
      { label: "Shadow", value: preset.shadow_color, span: 8,
        onChange: (v) => { preset.shadow_color = v; saveProject(); renderTextPreview(); } });

    UI.numberField(document.getElementById("text-shadow-offset-x-field"),
      { label: "OFFSET X", unit: "PX", value: preset.shadow_offset_x, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_x = v; saveProject(); renderTextPreview(); } });

    UI.numberField(document.getElementById("text-shadow-offset-y-field"),
      { label: "OFFSET Y", unit: "PX", value: preset.shadow_offset_y, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_y = v; saveProject(); renderTextPreview(); } });

    UI.numberField(document.getElementById("text-shadow-blur-field"),
      { label: "BLUR", unit: "PX", value: preset.shadow_blur, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.shadow_blur = v; saveProject(); renderTextPreview(); } });
```

Note: `renderTextPreview()` in this codebase is the panel's own preview refresh helper (already called by every other control in this file) — it is distinct from `Preview.renderText`, which Task 4 modifies.

- [ ] **Step 3: Manual verification (no JS test framework in this project)**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

In the browser: open a project, select/create a text block, open the TEXT panel's Design tab. Confirm:
- A SHADOW OFF/ON toggle appears below Outline.
- Toggling to ON reveals a color swatch + OFFSET X/Y + BLUR fields; toggling OFF hides them again.
- Changing the fields doesn't throw console errors (shadow won't visually render yet — that's Task 4).

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/text-panel-font-style.js
git commit -m "feat: add Shadow control row to TEXT panel Design tab"
```

---

### Task 3: CAPTIONS panel UI — Shadow control row

**Files:**
- Modify: `static/index.html` (inside the captions Design body, after the outline-px row, around line 265-271)
- Modify: `static/caption-panel-font-style.js`

**Interfaces:**
- Consumes: `TextPreset.shadow/shadow_color/shadow_offset_x/shadow_offset_y/shadow_blur` (Task 1). Globals already used elsewhere in this file: `ensureCaptionPreset(id)`, `ensureCaptionTrack()`, `saveProject()`, `renderCaptionPreview()`.
- Produces: nothing consumed by later tasks — leaf UI wiring, independent of Task 2.

- [ ] **Step 1: Add markup to `static/index.html`**

Find this block (the end of the captions font-style group, around line 261-272):

```html
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
```

Replace it with:

```html
            <div class="style-group">
              <label id="caption-color-field"></label>
            </div>

            <div class="style-group">
              <label id="caption-outline-color-field"></label>
            </div>

            <div class="style-group">
              <label id="caption-outline-px-field"></label>
            </div>

            <div class="style-group-label">SHADOW</div>
            <div class="style-group">
              <div id="caption-shadow-toggle-group"></div>
            </div>

            <div class="style-group">
              <label id="caption-shadow-color-field"></label>
            </div>

            <div class="style-group">
              <div class="style-row">
                <label id="caption-shadow-offset-x-field"></label>
                <label id="caption-shadow-offset-y-field"></label>
              </div>
            </div>

            <div class="style-group">
              <label id="caption-shadow-blur-field"></label>
            </div>
          </div>
```

- [ ] **Step 2: Wire the controls in `static/caption-panel-font-style.js`**

At the end of `window.CaptionPanel.renderFontStyle` (append right before the function's closing `};`, after the existing `caption-outline-px-field` call around line 71):

```js
    const shadowFieldsHidden = !preset.shadow;
    document.getElementById("caption-shadow-color-field").hidden = shadowFieldsHidden;
    document.getElementById("caption-shadow-offset-x-field").hidden = shadowFieldsHidden;
    document.getElementById("caption-shadow-offset-y-field").hidden = shadowFieldsHidden;
    document.getElementById("caption-shadow-blur-field").hidden = shadowFieldsHidden;

    UI.buttonGroup(document.getElementById("caption-shadow-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.shadow ? "on" : "off",
      (value) => {
        preset.shadow = value === "on";
        saveProject();
        renderCaptionPreview();
        window.CaptionPanel.renderFontStyle();
      });

    UI.colorSwatch(document.getElementById("caption-shadow-color-field"),
      { label: "Shadow", value: preset.shadow_color, span: 8,
        onChange: (v) => { preset.shadow_color = v; saveProject(); renderCaptionPreview(); } });

    UI.numberField(document.getElementById("caption-shadow-offset-x-field"),
      { label: "OFFSET X", unit: "PX", value: preset.shadow_offset_x, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_x = v; saveProject(); renderCaptionPreview(); } });

    UI.numberField(document.getElementById("caption-shadow-offset-y-field"),
      { label: "OFFSET Y", unit: "PX", value: preset.shadow_offset_y, min: -40, max: 40, span: 4,
        onChange: (v) => { preset.shadow_offset_y = v; saveProject(); renderCaptionPreview(); } });

    UI.numberField(document.getElementById("caption-shadow-blur-field"),
      { label: "BLUR", unit: "PX", value: preset.shadow_blur, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.shadow_blur = v; saveProject(); renderCaptionPreview(); } });
```

- [ ] **Step 3: Manual verification**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

In the browser: transcribe or otherwise create captions, open the CAPTIONS panel's Design tab. Confirm the same SHADOW OFF/ON toggle + fields appear/hide correctly, mirroring Task 2's text-panel behavior, no console errors.

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/caption-panel-font-style.js
git commit -m "feat: add Shadow control row to CAPTIONS panel Design tab"
```

---

### Task 4: Live preview — text blocks

**Files:**
- Modify: `static/preview-text.js`

**Interfaces:**
- Consumes: `TextPreset.shadow/shadow_color/shadow_offset_x/shadow_offset_y/shadow_blur` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the shadow style to the block div**

In `static/preview-text.js`, inside `renderText`, find this line (currently sets border color, around line 102):

```js
      div.style.borderColor = preset.box_border_color;
```

Directly after it (still before the `borderRadius`/box-sizing lines that follow), add:

```js
      div.style.textShadow = preset.shadow
        ? `${preset.shadow_offset_x / 1920 * stageH}px ${preset.shadow_offset_y / 1920 * stageH}px ${preset.shadow_blur / 1920 * stageH}px ${preset.shadow_color}`
        : "none";
```

This sets `text-shadow` on the parent `.text-block` div — it's a whole-preset setting (Task 1's constraint), and CSS `text-shadow` is inherited, so it applies to the rich-text `<span class="text-run">` children built later in the same function without any per-span changes.

- [ ] **Step 2: Manual verification**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

In the browser: select a text block, turn Shadow ON (Task 2's toggle) with default offset/blur values, confirm a visible drop shadow appears on the stage text immediately. Try a large offset and a blur value, confirm they visibly change the shadow. Turn Shadow OFF, confirm it disappears.

- [ ] **Step 3: Commit**

```bash
git add static/preview-text.js
git commit -m "feat: render text-block shadow in the live preview"
```

---

### Task 5: Live preview — captions

**Files:**
- Modify: `static/preview-captions.js`

**Interfaces:**
- Consumes: `TextPreset.shadow/shadow_color/shadow_offset_x/shadow_offset_y/shadow_blur` (Task 1). Independent of Task 4 (different file, same pattern).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the shadow style to the caption div**

In `static/preview-captions.js`, inside `renderCaptions`, find this line (currently sets border color, around line 49):

```js
    div.style.borderColor = preset.box_border_color;
```

Directly after it, add:

```js
    div.style.textShadow = preset.shadow
      ? `${preset.shadow_offset_x / 1920 * stageH}px ${preset.shadow_offset_y / 1920 * stageH}px ${preset.shadow_blur / 1920 * stageH}px ${preset.shadow_color}`
      : "none";
```

- [ ] **Step 2: Manual verification**

In the browser: with captions present, turn Shadow ON in the CAPTIONS panel, confirm the drop shadow renders on the karaoke caption text on the stage during playback/scrub. Turn it OFF, confirm it disappears.

- [ ] **Step 3: Commit**

```bash
git add static/preview-captions.js
git commit -m "feat: render caption shadow in the live preview"
```

---

### Task 6: ASS export — text-block shadow

**Files:**
- Modify: `app/ass_render.py:212-221` (`_block_dialogue`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.shadow/shadow_color/shadow_offset_x/shadow_offset_y/shadow_blur` (Task 1), `hex_to_ass`/`_ass_override_color` (already defined in this file, lines 17-23).
- Produces: nothing consumed by later tasks (Task 7 touches different functions in the same file — no shared new code between them, safe to do in either order).

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py` (after `test_entrance_none_has_no_fad`, around line 34):

```python
def test_block_dialogue_shadow_off_emits_no_shadow_tags():
    pr = TextPreset(name="Pop", shadow=False)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "H" in l)
    assert "\\xshad" not in line and "\\yshad" not in line and "\\blur" not in line

def test_block_dialogue_shadow_on_emits_offset_blur_and_color_tags():
    pr = TextPreset(name="Pop", shadow=True, shadow_color="#FF00FF",
                     shadow_offset_x=6, shadow_offset_y=-3, shadow_blur=8)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:") and "H" in l)
    assert "\\xshad6" in line
    assert "\\yshad-3" in line
    assert "\\blur8" in line
    assert "\\4c&HFF00FF&" in line  # #FF00FF -> b=FF,g=00,r=FF, same &HBBGGRR& shape _ass_override_color already uses elsewhere in this file
    assert "\\4a00" in line
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k block_dialogue_shadow -v`
Expected: FAIL — assertion errors, no `\xshad`/`\yshad`/`\blur`/`\4c` in the dialogue line yet.

- [ ] **Step 3: Implement the shadow tag in `_block_dialogue`**

In `app/ass_render.py`, find `_block_dialogue` (lines 212-221):

```python
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

Replace with:

```python
def _shadow_tag(p: TextPreset) -> str:
    """ASS override tags for a whole-preset drop shadow: \\4c/\\4a set the shadow (back) color
    to opaque, \\xshad/\\yshad set independent offsets (overriding the style line's uniform
    Shadow distance, which stays 0), \\blur softens edges. Note ASS has no shadow-only blur
    primitive — \\blur softens both outline and shadow together."""
    if not p.shadow:
        return ""
    color = _ass_override_color(p.shadow_color)
    return f"\\4c{color}\\4a00\\xshad{p.shadow_offset_x}\\yshad{p.shadow_offset_y}\\blur{p.shadow_blur}"

def _block_dialogue(b, p: TextPreset, weight: int | None = None) -> str:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
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
Expected: all PASS (including the 2 new shadow tests and every pre-existing test in the file — in particular `test_text_block_dialogue` and `test_entrance_none_has_no_fad`, which use `shadow=False` implicitly via `TextPreset`'s default and must see byte-identical `fx` strings to before).

- [ ] **Step 5: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: burn in text-block shadow via ASS override tags"
```

---

### Task 7: ASS export — caption shadow

**Files:**
- Modify: `app/ass_render.py:265-284` (`_karaoke_dialogue`, `_current_word_dialogues`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.shadow/shadow_color/shadow_offset_x/shadow_offset_y/shadow_blur` (Task 1), the `_shadow_tag(p)` helper added by Task 6 (same file — if Task 7 runs before Task 6 in a parallel/subagent execution, add `_shadow_tag` here instead and Task 6 must then reuse it; as planned, Task 6 defines it first).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py` (near the other caption tests, after `test_current_word_emits_one_dialogue_per_word_with_inline_override` around line 306):

```python
def test_karaoke_dialogue_shadow_on_emits_tags():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill",
                     shadow=True, shadow_color="#00FFFF", shadow_offset_x=2, shadow_offset_y=5, shadow_blur=3)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\xshad2" in line and "\\yshad5" in line and "\\blur3" in line

def test_current_word_dialogue_shadow_off_emits_no_tags():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="current_word", shadow=False)
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 0.0, 0.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "\\xshad" not in line and "\\blur" not in line
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "karaoke_dialogue_shadow or current_word_dialogue_shadow" -v`
Expected: FAIL — no shadow tags present yet.

- [ ] **Step 3: Implement the shadow tag in both caption dialogue builders**

In `app/ass_render.py`, find `_karaoke_dialogue` and `_current_word_dialogues` (lines 265-284):

```python
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
```

Replace with:

```python
def _karaoke_dialogue(group: list[CaptionWord], p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
    body = "".join(f"{{\\k{max(1, round((w.t_end - w.t_start) * 100))}}}{w.text} " for w in group).rstrip()
    start, end = group[0].t_start, group[-1].t_end
    return f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}"

def _current_word_dialogues(group: list[CaptionWord], p: TextPreset) -> list[str]:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: all PASS.

Run the full suite to confirm nothing else regressed:
Run: `.venv/Scripts/python -m pytest -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: burn in caption shadow via ASS override tags"
```

---

### Task 8: Update codebase map

**Files:**
- Modify: `CLAUDE.md` (project-level, in the Inventory's "Text blocks & rich-text formatting" and "Captions & transcription" sections)

**Interfaces:**
- Consumes: nothing — documentation only, runs last after all code changes land.

- [ ] **Step 1: Update the `TextPreset` field list note**

In `CLAUDE.md`, in the "Data model & persistence" section's `app/models.py` bullet, extend the `TextPreset` field-detail pointer sentence to mention shadow fields are documented under Text blocks (mirrors how `outline_color`/`outline_px` are handled — no dedicated top-level model bullet needed, they're covered in the feature section below).

In the "Text blocks & rich-text formatting" section, in the `TextPreset` bullet, add after the `highlight: bool = False` clause:

```
; `shadow: bool = False` + `shadow_color`/`shadow_offset_x`/`shadow_offset_y`/`shadow_blur` (added 2026-07-22, text shadow feature): whole-preset drop shadow, shared with captions (same `TextPreset`), rendered live via CSS `text-shadow` (`static/preview-text.js`/`static/preview-captions.js`) and burned into export via ASS `\4c\4a\xshad\yshad\blur` override tags (`app/ass_render.py`'s `_shadow_tag` helper, applied in `_block_dialogue`/`_karaoke_dialogue`/`_current_word_dialogues`)
```

Add to the `static/text-panel-font-style.js` bullet: note it also wires a Shadow OFF/ON toggle + color/offset-x/offset-y/blur fields (2026-07-22).

Add to the `static/caption-panel-font-style.js` bullet: note it mirrors the same Shadow controls against the caption track's preset (2026-07-22).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for text shadow feature"
```
