# Spotlight Per-Word Style Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the CAPTIONS panel's Spotlight subpage give the currently-active (karaoke) word its own Color, Outline, Shadow, and background Highlight, independent of the base caption style, with a new "Off" mode.

**Architecture:** Twelve new `spotlight_*` fields on `TextPreset` (backend + frontend defaults). `highlight_mode` gains `"off"` and drops `"background"` as a UI-selectable value (old data self-heals on load). The CAPTIONS Spotlight subpage reuses the four existing shared style-section files (Color/Outline/Shadow/Highlight) by parameterizing the field name(s) each one reads/writes, rather than writing new duplicate files. Export (`app/ass_render.py`) inlines per-word ASS override/revert tags for outline and shadow around the active word (current_word mode only), and generalizes the existing per-word rounded-rect drawing so it fires for either mode when `spotlight_highlight` is on.

**Tech Stack:** FastAPI + Pydantic (backend), vanilla JS with no build step (frontend), ASS subtitle format for export burn-in, pytest, `node --test`.

## Global Constraints

- No JS build step/bundler; every reusable JS component is one function per file, attached to `window.*`.
- No inline `style="..."` in `static/index.html`; JS-set inline styles on dynamically created elements (as `preview-captions.js` already does) are fine.
- Every new/edited `static/*.js` file keeps (or gains) a 2-3 line header comment.
- Every `TextPreset` field addition must be defaulted so existing saved projects load unchanged.
- Outline and Shadow controls only take visual effect in Current word mode (ASS's `\k` sweep can't carry a per-word outline/shadow the way it carries color) — both the UI and the export code must reflect this; Color and Highlight work in both Current word and Progressive fill.
- Run `.venv/Scripts/python -m pytest -q` before calling any task done that touches `app/`.

---

### Task 1: Data model — `spotlight_*` fields on `TextPreset`

**Files:**
- Modify: `app/models.py:103-106` (TextPreset's highlight/highlight_mode block)
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `TextPreset.spotlight_color: str`, `.spotlight_outline: bool`, `.spotlight_outline_color: str`, `.spotlight_outline_px: int`, `.spotlight_shadow: bool`, `.spotlight_shadow_color: str`, `.spotlight_shadow_offset_x: int`, `.spotlight_shadow_offset_y: int`, `.spotlight_shadow_blur: int`, `.spotlight_highlight: bool`, `.spotlight_highlight_color: str`, `.spotlight_highlight_border_radius: int` — all consumed by Task 2 (export) and Task 6 (preview).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_text_preset_spotlight_fields_default():
    p = TextPreset(name="Cap")
    assert p.spotlight_color == "#FFD400"
    assert p.spotlight_outline is False
    assert p.spotlight_outline_color == "#000000"
    assert p.spotlight_outline_px == 4
    assert p.spotlight_shadow is False
    assert p.spotlight_shadow_color == "#000000"
    assert p.spotlight_shadow_offset_x == 4
    assert p.spotlight_shadow_offset_y == 4
    assert p.spotlight_shadow_blur == 0
    assert p.spotlight_highlight is False
    assert p.spotlight_highlight_color == "#FFD400"
    assert p.spotlight_highlight_border_radius == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py::test_text_preset_spotlight_fields_default -v`
Expected: FAIL with `AttributeError` (fields don't exist yet).

- [ ] **Step 3: Add the fields**

In `app/models.py`, replace lines 103-106 with:

```python
    highlight_color: str = "#FFD400"   # shared: caption karaoke highlight color AND rich-text highlight color
    highlight_mode: str = "current_word"   # off | current_word | progressive_fill (captions only); "background" is a legacy value self-healed on load by static/panel-captions.js's ensureCaptionPreset, never written going forward
    highlight: bool = False            # block-level highlight default (off); highlight_color above is shared with captions
    highlight_border_radius: int = 4   # px on the 1080x1920 canvas; shared by TEXT's marker-highlight rect and CAPTIONS' box-level highlight rect
    # Spotlight (CAPTIONS-only per-word karaoke styling): independent from highlight_color/highlight_border_radius above.
    # Outline/Shadow only render in highlight_mode == "current_word" (see app/ass_render.py's _current_word_dialogues) —
    # ASS's \k karaoke sweep used by "progressive_fill" can't carry a per-word outline/shadow toggle.
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

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py::test_text_preset_spotlight_fields_default -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add spotlight per-word style fields to TextPreset"
```

---

### Task 2: Export — per-word outline/shadow override + generalized highlight rect

**Files:**
- Modify: `app/ass_render.py:262-273` (`_caption_style`), `app/ass_render.py:285-302` (`_current_word_dialogues`), `app/ass_render.py:323-363` (`_background_word_dialogues` → generalized), `app/ass_render.py:394-422` (`render_caption_ass` dispatch)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.spotlight_*` fields (Task 1), existing `_line_word_offsets`, `_line_left_origin`, `_rounded_rect_path`, `_ass_override_color`, `_shadow_tag`, `hex_to_ass`.
- Produces: `_active_word_highlight_dialogues(page, p) -> list[str]` (renamed/generalized from `_background_word_dialogues`, now draws the rect for *whichever word is active*, callable regardless of mode) — consumed by both `_current_word_dialogues`'s dispatch and a new call alongside `_karaoke_dialogue`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py` (near the existing `_current_word_dialogues`/progressive_fill tests):

```python
def test_progressive_fill_style_uses_spotlight_color_as_primary():
    from app.ass_render import _caption_style
    pr = TextPreset(name="Caption", color="#FFFFFF", spotlight_color="#00FF00", highlight_mode="progressive_fill")
    style = _caption_style(pr, 400)
    # PrimaryColour is the 2nd comma field after Style name/Fontname/Fontsize... assert the ASS color for spotlight_color appears
    assert "&H0000FF00&".upper() not in style  # sanity: literal hex isn't emitted, ASS uses BGR
    assert hex_to_ass("#00FF00") in style

def test_current_word_dialogue_no_outline_or_shadow_override_when_off():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_outline=False, spotlight_shadow=False)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0)]
    dialogues = _current_word_dialogues([words], pr)
    assert not any("\\bord" in d and pr.spotlight_outline_color in d for d in dialogues)

def test_current_word_dialogue_outline_override_when_on():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_outline=True,
                     spotlight_outline_color="#00FF00", spotlight_outline_px=6)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0)]
    dialogues = _current_word_dialogues([words], pr)
    assert any(f"\\bord{pr.spotlight_outline_px}" in d and hex_to_ass(pr.spotlight_outline_color) in d for d in dialogues)
    # reverts to the base outline afterward
    assert any(f"\\bord{pr.outline_px}" in d for d in dialogues)

def test_current_word_dialogue_shadow_override_when_on():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_shadow=True,
                     spotlight_shadow_color="#0000FF", spotlight_shadow_offset_x=3,
                     spotlight_shadow_offset_y=2, spotlight_shadow_blur=1)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    dialogues = _current_word_dialogues([words], pr)
    assert any(f"\\xshad{pr.spotlight_shadow_offset_x}\\yshad{pr.spotlight_shadow_offset_y}\\blur{pr.spotlight_shadow_blur}" in d
               for d in dialogues)

def test_active_word_highlight_rect_emitted_for_current_word_when_spotlight_highlight_on():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_highlight=True, spotlight_highlight_color="#FF00FF")
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    dialogues = _active_word_highlight_dialogues([words], pr)
    assert any(hex_to_ass(pr.spotlight_highlight_color) or True for d in dialogues)  # rect drawn
    assert len(dialogues) == 1

def test_active_word_highlight_rect_empty_when_off():
    pr = TextPreset(name="Cap", highlight_mode="current_word", spotlight_highlight=False)
    words = [CaptionWord(text="hi", t_start=0.0, t_end=0.5)]
    assert _active_word_highlight_dialogues([words], pr) == []

def test_render_caption_ass_off_mode_has_no_current_word_or_karaoke_swap():
    project = Project(name="P", width=1080, height=1920)
    pr = TextPreset(name="Cap", highlight_mode="off")
    project.captions = CaptionTrack(preset_id=pr.id, words=[
        CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0),
    ])
    ass = render_caption_ass(project, pr)
    assert ass.count("Dialogue:") == 1  # one plain karaoke_dialogue-shaped line, not one-per-word

def test_render_caption_ass_progressive_fill_draws_rect_when_spotlight_highlight_on():
    project = Project(name="P", width=1080, height=1920)
    pr = TextPreset(name="Cap", highlight_mode="progressive_fill", spotlight_highlight=True)
    project.captions = CaptionTrack(preset_id=pr.id, words=[
        CaptionWord(text="hi", t_start=0.0, t_end=0.5), CaptionWord(text="there", t_start=0.5, t_end=1.0),
    ])
    ass = render_caption_ass(project, pr)
    # 1 karaoke dialogue + 1 rect per word = 3
    assert ass.count("Dialogue:") == 3
```

(Adjust imports at the top of `tests/test_ass_render.py` if `_active_word_highlight_dialogues`, `CaptionWord`, `CaptionTrack`, `Project`, `hex_to_ass`, `_current_word_dialogues` aren't already imported — check the existing import block first and add only what's missing.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "spotlight_color or current_word_dialogue_no_outline or current_word_dialogue_outline_override or current_word_dialogue_shadow_override or active_word_highlight or off_mode_has_no or progressive_fill_draws_rect" -v`
Expected: FAIL (missing function `_active_word_highlight_dialogues`, and current behavior doesn't emit outline/shadow overrides yet).

- [ ] **Step 3: Implement**

In `app/ass_render.py`:

3a. Update `_caption_style` (was lines 262-273) to use `spotlight_color` for the fill/sweep primary:

```python
def _caption_style(p: TextPreset, weight: int) -> str:
    fontname = f"{p.font} {WEIGHT_LABELS[weight]}"
    alignment = {"left": 7, "right": 9}.get(p.align, 8)
    if p.highlight_mode == "progressive_fill":
        primary, secondary = hex_to_ass(p.spotlight_color), hex_to_ass(p.color)
    else:
        primary, secondary = hex_to_ass(p.color), hex_to_ass(p.color)
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    return (f"Style: {CAPTION_STYLE_NAME},{fontname},{p.size_px},{primary},{secondary},"
            f"{hex_to_ass(p.outline_color)},&H00000000,"
            f"0,{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,{alignment},0,0,0,1")
```

3b. Replace `_current_word_dialogues` (was lines 285-302) with a version that adds optional inline outline/shadow override + revert around the active word's segment:

```python
def _current_word_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)
    highlight = _ass_override_color(p.spotlight_color)
    normal = _ass_override_color(p.color)
    outline_on = f"\\3c{_ass_override_color(p.spotlight_outline_color)}\\bord{p.spotlight_outline_px}" if p.spotlight_outline else ""
    outline_off = f"\\3c{_ass_override_color(p.outline_color)}\\bord{p.outline_px}" if p.spotlight_outline else ""
    shadow_on = (f"\\4c{_ass_override_color(p.spotlight_shadow_color)}\\4a00"
                 f"\\xshad{p.spotlight_shadow_offset_x}\\yshad{p.spotlight_shadow_offset_y}\\blur{p.spotlight_shadow_blur}"
                 if p.spotlight_shadow else "")
    shadow_off = ("\\4c" + _ass_override_color(p.shadow_color) + "\\4a00" +
                  f"\\xshad{p.shadow_offset_x}\\yshad{p.shadow_offset_y}\\blur{p.shadow_blur}"
                  if p.spotlight_shadow and p.shadow else
                  ("\\4a&HFF&" if p.spotlight_shadow else ""))
    flat = [word for line in page for word in line]
    dialogues = []
    for active in flat:
        line_bodies = []
        for line in page:
            segments = []
            for j, other in enumerate(line):
                seg = other.text + (" " if j < len(line) - 1 else "")
                if other is active:
                    segments.append(f"{{\\1c{highlight}{outline_on}{shadow_on}}}{seg}{{\\1c{normal}{outline_off}{shadow_off}}}")
                else:
                    segments.append(seg)
            line_bodies.append("".join(segments))
        body = "\\N".join(line_bodies)
        dialogues.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                          f"{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{body}")
    return dialogues
```

3c. Rename `_background_word_dialogues` (was lines 323-363) to `_active_word_highlight_dialogues`, drop its old docstring's "background mode" framing, use `spotlight_highlight_color`/`spotlight_highlight_border_radius`, and keep everything else (it's already "draw a rect behind whichever word is active" — no mode-dependent behavior needed, since callers now decide *when* to call it):

```python
def _active_word_highlight_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    """Draws a rounded rect behind the currently-active word (no text-color swap). Callable
    regardless of highlight_mode — the caller (render_caption_ass) decides when to invoke it,
    gated on preset.spotlight_highlight. Same per-line x-offset/width math _caption_highlight_dialogues
    uses for TEXT-block marker highlights, and the same align-relative left-origin convention
    _caption_style's Alignment field expects (p.x is the line's left/right/center anchor depending
    on p.align). The rect is padded by HIGHLIGHT_PAD_EM on all 4 sides around the word's tight
    glyph box (size_px tall, not the looser size_px*LINE_HEIGHT line pitch), vertically centered
    within that line's pitch slot so the padding reads as equal on all sides rather than being
    swallowed by line-height leading."""
    if not p.spotlight_highlight or not page:
        return []
    weight = _resolved_weight(p)
    measure = pil_font_measurer(p.font, p.size_px, weight)
    fill = _ass_override_color(p.spotlight_highlight_color)
    pad = HIGHLIGHT_PAD_EM * p.size_px
    line_pitch = p.size_px * LINE_HEIGHT
    rect_height = p.size_px + 2 * pad

    line_layout = [_line_word_offsets(line, measure) for line in page]

    dialogues = []
    for line_i, line in enumerate(page):
        offsets, line_width = line_layout[line_i]
        left_origin = _line_left_origin(p, line_width)
        top = p.y + line_i * line_pitch + (line_pitch - rect_height) / 2
        for word_i, active in enumerate(line):
            word_x, word_w = offsets[word_i]
            left = left_origin + word_x - pad
            path = _rounded_rect_path(word_w + 2 * pad, rect_height, p.spotlight_highlight_border_radius)
            rect_fx = f"\\an7\\pos({left:.0f},{top:.0f})\\1a&H00&\\3a&HFF&\\1c{fill}\\p1"
            dialogues.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                              f"{CAPTION_STYLE_NAME},,0,0,0,,{{{rect_fx}}}{path}{{\\p0}}")
    return dialogues
```

Note: the old function also emitted a per-word *text* dialogue (it was its own standalone rendering mode). That text-dialogue emission is deleted — text rendering for `current_word`/`progressive_fill` is already handled by `_current_word_dialogues`/`_karaoke_dialogue`; `_active_word_highlight_dialogues` now draws *only* the rect, appended before those.

3d. Update `render_caption_ass`'s dispatch loop (was lines 411-419):

```python
    for page in pages:
        event_lines.extend(_caption_highlight_dialogues(page, preset))
        event_lines.extend(_active_word_highlight_dialogues(page, preset))
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(page, preset))
        else:
            event_lines.append(_karaoke_dialogue(page, preset))
```

(`_active_word_highlight_dialogues` returns `[]` when `spotlight_highlight` is off or mode isn't current_word/progressive_fill — for `"off"` mode there's no active-word concept, but since nothing sets `spotlight_highlight` meaningfully without an active mode in the UI, and the function only checks `p.spotlight_highlight`, guard it: skip the call entirely when `preset.highlight_mode == "off"`, since with no word ever "active" the rect would otherwise be drawn for every word for its full duration, which is wrong. Adjust the dispatch to:

```python
    for page in pages:
        event_lines.extend(_caption_highlight_dialogues(page, preset))
        if preset.highlight_mode != "off":
            event_lines.extend(_active_word_highlight_dialogues(page, preset))
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(page, preset))
        else:
            event_lines.append(_karaoke_dialogue(page, preset))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: PASS (all tests, including the pre-existing ones — check the old `test_render_caption_ass_background_mode_routes_to_background_dialogues` and `test_background_word_dialogues_*` tests: rename/update them to use `highlight_mode="progressive_fill", spotlight_highlight=True` and call `_active_word_highlight_dialogues` instead of `_background_word_dialogues`, since the old "background" mode's dedicated function/tests no longer exist as such).

- [ ] **Step 5: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: export per-word spotlight color/outline/shadow/highlight overrides"
```

---

### Task 3: Frontend self-heal — `defaultCaptionPreset`/`ensureCaptionPreset` migration

**Files:**
- Modify: `static/panel-captions.js:8-36`

**Interfaces:**
- Produces: `defaultCaptionPreset(id)` now includes all 12 `spotlight_*` defaults (mirroring Task 1's Python defaults exactly); `ensureCaptionPreset(id)` self-heals `highlight_mode === "background"` on load.

- [ ] **Step 1: Update `defaultCaptionPreset`**

In `static/panel-captions.js`, change line 18 from:

```js
    highlight: false, highlight_color: "#FFD400", highlight_mode: "current_word", highlight_border_radius: 4,
```

to:

```js
    highlight: false, highlight_color: "#FFD400", highlight_mode: "current_word", highlight_border_radius: 4,
    spotlight_color: "#FFD400",
    spotlight_outline: false, spotlight_outline_color: "#000000", spotlight_outline_px: 4,
    spotlight_shadow: false, spotlight_shadow_color: "#000000", spotlight_shadow_offset_x: 4, spotlight_shadow_offset_y: 4, spotlight_shadow_blur: 0,
    spotlight_highlight: false, spotlight_highlight_color: "#FFD400", spotlight_highlight_border_radius: 4,
```

- [ ] **Step 2: Add the "background" mode self-heal**

In `ensureCaptionPreset` (lines 22-36), add after the existing box-size self-heal block, before `return preset;`:

```js
  // Self-heal presets saved before "Background" mode was folded into the spotlight_highlight
  // toggle (2026-07-30, spotlight per-word styles) — see docs/superpowers/specs/2026-07-30-spotlight-word-styles-design.md.
  if (preset.highlight_mode === "background") {
    preset.highlight_mode = "current_word";
    preset.spotlight_highlight = true;
    preset.spotlight_highlight_color = preset.highlight_color;
  }
```

- [ ] **Step 3: Manual verification**

This is DOM-free JS wiring with no dedicated unit test file (the project's stated pattern for thin UI wiring — logic here is a straight field copy, verified in the browser during Task 5's manual check). Confirm by reading the diff that both edits land in the right functions.

- [ ] **Step 4: Commit**

```bash
git add static/panel-captions.js
git commit -m "feat: self-heal legacy caption Background spotlight mode on load"
```

---

### Task 4: Parameterize the four shared style-section files

**Files:**
- Modify: `static/style-section-color.js`, `static/style-section-outline.js`, `static/style-section-shadow.js`, `static/style-section-highlight.js`
- Test: `node --test "tests/js/**/*.test.js"` (regression only — no existing test touches these files directly; this task must not change behavior for any existing caller)

**Interfaces:**
- Produces: `StyleSection.color(container, target, {host, field})` (field default `"color"`), `StyleSection.outline(container, target, {host, colorField, widthField})` (defaults `"outline_color"`/`"outline_px"`), `StyleSection.shadow(container, target, {host, fields})` (fields default `{toggle: "shadow", color: "shadow_color", offsetX: "shadow_offset_x", offsetY: "shadow_offset_y", blur: "shadow_blur"}`), `StyleSection.highlight(container, target, {host, fields})` (fields default `{toggle: "highlight", color: "highlight_color", radius: "highlight_border_radius"}`) — consumed by Task 5.

- [ ] **Step 1: Parameterize `style-section-color.js`**

Replace the file's content with:

```js
// Shared Color control for the TEXT and CAPTIONS Design tabs: a settings row showing the current
// colour as a swatch + hex, opening a drill-down subpage that holds the colour picker itself.
// Builds its own markup; colour is FormatRun-capable, so it writes through target.setField.
// options.field (default "color") lets a caller point this at a different preset field — e.g.
// the CAPTIONS Spotlight subpage reuses this file for "spotlight_color" instead of a new file.
window.StyleSection = window.StyleSection || {};

window.StyleSection.color = function color(container, target, options) {
  const field = options.field || "color";

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  const page = options.host.page("Color", (body) => {
    const bodyGroup = document.createElement("div");
    bodyGroup.className = "style-group";
    const swatchEl = document.createElement("label");
    bodyGroup.appendChild(swatchEl);
    body.appendChild(bodyGroup);

    UI.colorSwatch(swatchEl, {
      label: "Color", value: target.getFieldValue(field), span: 8,
      onChange: (v) => {
        target.setField(field, v);
        setRowValue(v, null, v);
      },
    });
  });

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Color",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  return {
    render() {
      const v = target.getFieldValue(field);
      setRowValue(v, null, v);
    },
  };
};
```

- [ ] **Step 2: Parameterize `style-section-outline.js`**

Replace the file's content with (same structure, field names via `options.colorField`/`options.widthField`):

```js
// Shared Outline style section for the TEXT and CAPTIONS Design tabs: a settings row
// (colour swatch + "Npx") in the panel's main view plus a drill-down subpage holding the
// outline colour and width fields. Both fields are FormatRun-capable, so they write via
// target.setField and display via target.getFieldValue. options.colorField/widthField (defaults
// "outline_color"/"outline_px") let a caller point this at different preset fields — e.g. the
// CAPTIONS Spotlight subpage reuses this file for "spotlight_outline_color"/"spotlight_outline_px".
window.StyleSection = window.StyleSection || {};

window.StyleSection.outline = function outlineSection(container, target, options) {
  const host = options.host;
  const colorField = options.colorField || "outline_color";
  const widthField = options.widthField || "outline_px";

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  function widthText() { return `${target.getFieldValue(widthField)}px`; }
  function colorValue() { return target.getFieldValue(colorField); }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Outline",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  function refreshRow() {
    if (!target.exists()) return;
    setRowValue(widthText(), null, colorValue());
  }

  const page = host.page("Outline", (bodyEl) => {
    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField_ = document.createElement("label");
    colorGroup.appendChild(colorField_);

    const widthGroup = document.createElement("div");
    widthGroup.className = "style-group";
    const widthField_ = document.createElement("label");
    widthGroup.appendChild(widthField_);

    bodyEl.append(colorGroup, widthGroup);

    UI.colorSwatch(colorField_, {
      label: "Outline", value: colorValue(), span: 8,
      onChange: (v) => target.setField(colorField, v),
    });

    UI.numberField(widthField_, {
      label: "WIDTH", unit: "PX", value: target.getFieldValue(widthField),
      min: 0, max: 20, span: 8,
      onChange: (v) => target.setField(widthField, v),
    });
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
```

- [ ] **Step 3: Parameterize `style-section-shadow.js`**

Replace the file's content, introducing `const f = options.fields || { toggle: "shadow", color: "shadow_color", offsetX: "shadow_offset_x", offsetY: "shadow_offset_y", blur: "shadow_blur" };` at the top of the factory, and replace every hardcoded `"shadow"`/`"shadow_color"`/`"shadow_offset_x"`/`"shadow_offset_y"`/`"shadow_blur"` literal (both the `target.setPresetField(...)` calls and the `preset.shadow*` reads) with `f.toggle`/`f.color`/`f.offsetX`/`f.offsetY`/`f.blur`:

```js
// Shared Shadow style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the on/off toggle and the colour,
// offset-x, offset-y and blur fields. FormatRun has no shadow fields, so every control here
// writes the whole preset via target.setPresetField — never target.setField. options.fields
// (default {toggle:"shadow", color:"shadow_color", offsetX:"shadow_offset_x",
// offsetY:"shadow_offset_y", blur:"shadow_blur"}) lets a caller point this at different preset
// fields — e.g. the CAPTIONS Spotlight subpage reuses this file for the spotlight_shadow* fields.
window.StyleSection = window.StyleSection || {};

window.StyleSection.shadow = function shadowSection(container, target, options) {
  const host = options.host;
  const f = options.fields || { toggle: "shadow", color: "shadow_color", offsetX: "shadow_offset_x", offsetY: "shadow_offset_y", blur: "shadow_blur" };

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  function isOn() { return !!target.getPreset()[f.toggle]; }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Shadow",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  function refreshRow() {
    if (!target.exists()) return;
    setRowValue(isOn() ? "ON" : "OFF", null, isOn() ? target.getPreset()[f.color] : null);
  }

  const page = host.page("Shadow", (bodyEl) => {
    const preset = target.getPreset();

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const offsetGroup = document.createElement("div");
    offsetGroup.className = "style-group";
    const offsetRow = document.createElement("div");
    offsetRow.className = "style-row";
    const offsetXField = document.createElement("label");
    const offsetYField = document.createElement("label");
    offsetRow.append(offsetXField, offsetYField);
    offsetGroup.appendChild(offsetRow);

    const blurGroup = document.createElement("div");
    blurGroup.className = "style-group";
    const blurField = document.createElement("label");
    blurGroup.appendChild(blurField);

    bodyEl.append(toggleGroup, colorGroup, offsetGroup, blurGroup);

    function syncFields() {
      const hidden = !isOn();
      colorField.hidden = hidden;
      offsetXField.hidden = hidden;
      offsetYField.hidden = hidden;
      blurField.hidden = hidden;
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      isOn() ? "on" : "off",
      (value) => {
        target.setPresetField(f.toggle, value === "on");
        syncFields();
        refreshRow();
      });

    UI.colorSwatch(colorField, {
      label: "Shadow", value: preset[f.color], span: 8,
      onChange: (v) => { target.setPresetField(f.color, v); refreshRow(); },
    });

    UI.numberField(offsetXField, {
      label: "OFFSET X", unit: "PX", value: preset[f.offsetX], min: -40, max: 40, span: 4,
      onChange: (v) => target.setPresetField(f.offsetX, v),
    });

    UI.numberField(offsetYField, {
      label: "OFFSET Y", unit: "PX", value: preset[f.offsetY], min: -40, max: 40, span: 4,
      onChange: (v) => target.setPresetField(f.offsetY, v),
    });

    UI.numberField(blurField, {
      label: "BLUR", unit: "PX", value: preset[f.blur], min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField(f.blur, v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
```

- [ ] **Step 4: Parameterize `style-section-highlight.js`**

Same technique — introduce `const f = options.fields || { toggle: "highlight", color: "highlight_color", radius: "highlight_border_radius" };`, replace every `"highlight"`/`"highlight_color"`/`"highlight_border_radius"` literal (both `target.getFieldValue(...)`/`target.setField(...)` calls for toggle/color, which stay FormatRun-capable via `getFieldValue`/`setField` exactly as today, and `target.setPresetField("highlight_border_radius", ...)`/`preset.highlight_border_radius` for radius, which stays preset-only) with `f.toggle`/`f.color`/`f.radius`:

```js
// Shared Highlight style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the on/off toggle, the colour and the
// corner radius. Identical for both panels — an always-on background rect drawn behind the whole
// block/caption box (_highlight_dialogues for TEXT, _caption_highlight_dialogue for CAPTIONS),
// independent of CAPTIONS' separate per-word karaoke feature (see style-section-spotlight.js).
// options.fields (default {toggle:"highlight", color:"highlight_color", radius:"highlight_border_radius"})
// lets a caller point this at different preset fields — e.g. the CAPTIONS Spotlight subpage
// reuses this file for the spotlight_highlight* fields instead of a new file.
window.StyleSection = window.StyleSection || {};

window.StyleSection.highlight = function highlightSection(container, target, options) {
  const host = options.host;
  const f = options.fields || { toggle: "highlight", color: "highlight_color", radius: "highlight_border_radius" };

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  function isOn() { return !!target.getFieldValue(f.toggle); }
  function colorValue() { return target.getFieldValue(f.color); }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Highlight",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  function refreshRow() {
    if (!target.exists()) return;
    setRowValue(isOn() ? "ON" : "OFF", null, isOn() ? colorValue() : null);
  }

  const page = host.page("Highlight", (bodyEl) => {
    const preset = target.getPreset();

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);
    bodyEl.appendChild(toggleGroup);

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const radiusGroup = document.createElement("div");
    radiusGroup.className = "style-group";
    const radiusField = document.createElement("label");
    radiusGroup.appendChild(radiusField);

    bodyEl.append(colorGroup, radiusGroup);

    function syncFields() {
      colorField.hidden = !isOn();
      radiusField.hidden = !isOn();
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      isOn() ? "on" : "off",
      (value) => {
        target.setField(f.toggle, value === "on");
        syncFields();
        refreshRow();
      });

    UI.colorSwatch(colorField, {
      label: "Highlight", value: colorValue(), span: 8,
      onChange: (v) => { target.setField(f.color, v); refreshRow(); },
    });

    UI.numberField(radiusField, {
      label: "RADIUS", unit: "PX", value: preset[f.radius],
      min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField(f.radius, v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
```

- [ ] **Step 5: Run the JS test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (these files aren't unit-tested directly, but this confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add static/style-section-color.js static/style-section-outline.js static/style-section-shadow.js static/style-section-highlight.js
git commit -m "refactor: parameterize field names in shared style sections for reuse by Spotlight"
```

---

### Task 5: Rewrite `style-section-spotlight.js` — Off mode + reused sections

**Files:**
- Modify: `static/style-section-spotlight.js`

**Interfaces:**
- Consumes: `StyleSection.color/outline/shadow/highlight` (Task 4), `window.StylePanelHost` (`static/style-panel-host.js`, unchanged), `target.getPreset()`/`target.setPresetField()` (`static/style-target-caption.js`, unchanged).
- Produces: `StyleSection.spotlight(container, target, options)` — same call signature `style-tab-design.js:35` already uses, no change needed there.

- [ ] **Step 1: Replace the file**

```js
// CAPTIONS-only Design-tab section: "Spotlight", the per-word karaoke highlight (off / current
// word / progressive fill). A mode is either off or always one of the other two — this row is
// never "None" the way Highlight/Outline/Shadow can be. Distinct from TEXT/CAPTIONS' shared
// static-box Highlight (style-section-highlight.js) — see that file's header. The active word's
// own Color/Outline/Shadow/Highlight are built by reusing the four shared style sections
// (style-section-color.js/outline.js/shadow.js/highlight.js) pointed at the preset's spotlight_*
// fields via each section's field-name options (added 2026-07-30) — a second, nested
// StylePanelHost scoped to this subpage's own body gives them their own chevron drill-downs,
// matching the reference mockup, without changing StylePanelHost itself. Outline and Shadow only
// render in "current_word" mode (see app/ass_render.py's _current_word_dialogues header for why
// ASS can't carry them through "progressive_fill"'s \k sweep) — their rows hide in that mode and
// when the mode is "off"; Color and Highlight hide only when "off".
window.StyleSection = window.StyleSection || {};

window.StyleSection.spotlight = function spotlightSection(container, target, options) {
  const host = options.host;

  const MODE_LABELS = {
    off: "Off",
    current_word: "Current word",
    progressive_fill: "Progressive fill",
  };

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Spotlight",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  function refreshRow() {
    if (!target.exists()) return;
    const preset = target.getPreset();
    setRowValue(MODE_LABELS[preset.highlight_mode] || preset.highlight_mode, null,
      preset.highlight_mode === "off" ? null : preset.spotlight_color);
  }

  const page = host.page("Spotlight", (bodyEl) => {
    const modeGroup = document.createElement("div");
    modeGroup.className = "style-group";
    const modeEl = document.createElement("div");
    modeGroup.appendChild(modeEl);
    bodyEl.appendChild(modeGroup);

    // A nested StylePanelHost scoped to this subpage: mainEl is this subpage's own body (already
    // holding the mode group above it), drillEl is a sibling appended to the subpage's outer
    // element so the four reused sections' subpages don't get wiped when this body rebuilds.
    const pageEl = bodyEl.parentElement;
    const nestedDrillEl = document.createElement("div");
    pageEl.appendChild(nestedDrillEl);
    const nestedHost = StylePanelHost(bodyEl, nestedDrillEl);

    // Each wrapper uses the existing .style-section convention (style-panel.css) — the same one
    // style-tab-design.js's sectionWrapper() uses — so the reused sections' own .style-group
    // margin math (the :last-child rule that strips a trailing section's bottom margin) works
    // correctly with four of them side by side, instead of every one of them (each being the only
    // child of its own bare wrapper) incorrectly matching :last-child and losing its margin.
    function sectionWrapper() {
      const div = document.createElement("div");
      div.className = "style-section";
      bodyEl.appendChild(div);
      return div;
    }
    const colorWrap = sectionWrapper();
    const outlineWrap = sectionWrapper();
    const shadowWrap = sectionWrapper();
    const highlightWrap = sectionWrapper();

    const colorSection = StyleSection.color(colorWrap, target, { host: nestedHost, field: "spotlight_color" });
    const outlineSection = StyleSection.outline(outlineWrap, target,
      { host: nestedHost, colorField: "spotlight_outline_color", widthField: "spotlight_outline_px" });
    const shadowSection = StyleSection.shadow(shadowWrap, target,
      { host: nestedHost, fields: { toggle: "spotlight_shadow", color: "spotlight_shadow_color", offsetX: "spotlight_shadow_offset_x", offsetY: "spotlight_shadow_offset_y", blur: "spotlight_shadow_blur" } });
    const highlightSection = StyleSection.highlight(highlightWrap, target,
      { host: nestedHost, fields: { toggle: "spotlight_highlight", color: "spotlight_highlight_color", radius: "spotlight_highlight_border_radius" } });

    // .style-section is `display: contents` (style-panel.css) — toggling `hidden` on the wrapper
    // itself is unreliable since an author rule and the UA [hidden] default have equal
    // specificity. Instead toggle `hidden` on each wrapper's actual `.style-group` child (the one
    // thing each reused section appends into its container) — `.style-group[hidden] { display:
    // none; }` already exists in style-panel.css for exactly this.
    function syncVisibility() {
      const mode = target.getPreset().highlight_mode;
      colorWrap.firstElementChild.hidden = mode === "off";
      outlineWrap.firstElementChild.hidden = mode !== "current_word";
      shadowWrap.firstElementChild.hidden = mode !== "current_word";
      highlightWrap.firstElementChild.hidden = mode === "off";
    }

    UI.buttonGroup(modeEl,
      [{ value: "off", label: "Off", span: 8 },
       { value: "current_word", label: "Current word", span: 4 },
       { value: "progressive_fill", label: "Progressive fill", span: 4 }],
      target.getPreset().highlight_mode,
      (value) => {
        target.setPresetField("highlight_mode", value);
        syncVisibility();
        refreshRow();
      });

    colorSection.render();
    outlineSection.render();
    shadowSection.render();
    highlightSection.render();
    syncVisibility();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
```

- [ ] **Step 2: Manual verification (CAPTIONS panel — Spotlight subpage)**

Start the server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open a throwaway project (per your standing rule: never test on real project data), add a transcribed/manual caption track, open CAPTIONS → Design → Spotlight. Confirm:
- Mode group shows Off / Current word / Progressive fill (no "Background").
- Off: none of Color/Outline/Shadow/Highlight rows show.
- Current word: all four rows show, each opens its own chevron drill-down, edits persist (reload the page and reopen the subpage to confirm the values stuck).
- Progressive fill: Color and Highlight show; Outline and Shadow are hidden.

- [ ] **Step 3: Commit**

```bash
git add static/style-section-spotlight.js
git commit -m "feat: rebuild Spotlight subpage on reused style sections with Off mode"
```

---

### Task 6: Preview — active-word rendering for the new fields

**Files:**
- Modify: `static/preview-captions.js:98-136` (the per-line/per-word rendering loop inside `renderCaptions`)

**Interfaces:**
- Consumes: `TextPreset.spotlight_*` (Task 1/3).

- [ ] **Step 1: Replace the per-line/per-word loop**

In `static/preview-captions.js`, replace the `page.forEach((line) => { ... })` block (lines 98-136) with:

```js
    page.forEach((line) => {
      const lineDiv = document.createElement("div");
      lineDiv.className = "caption-line";
      const lineContentWrap = document.createElement("span");
      lineContentWrap.style.lineHeight = "1";
      line.forEach((word, i) => {
        const span = document.createElement("span");
        const isActive = preset.highlight_mode === "progressive_fill"
          ? timelineTime >= word.t_start
          : timelineTime >= word.t_start && timelineTime < word.t_end;
        const spotlightOn = isActive && preset.highlight_mode !== "off";
        span.style.color = spotlightOn ? preset.spotlight_color : preset.color;
        span.style.webkitTextStroke = (spotlightOn && preset.highlight_mode === "current_word" && preset.spotlight_outline)
          ? `${preset.spotlight_outline_px / 1920 * stageH}px ${preset.spotlight_outline_color}`
          : "";
        span.style.textShadow = (spotlightOn && preset.highlight_mode === "current_word" && preset.spotlight_shadow)
          ? `${preset.spotlight_shadow_offset_x / 1920 * stageH}px ${preset.spotlight_shadow_offset_y / 1920 * stageH}px ${preset.spotlight_shadow_blur / 1920 * stageH}px ${preset.spotlight_shadow_color}`
          : "none";
        if (spotlightOn && preset.spotlight_highlight) {
          span.style.backgroundColor = preset.spotlight_highlight_color;
          span.style.borderRadius = (preset.spotlight_highlight_border_radius / 1920 * stageH) + "px";
          span.style.padding = `${highlightPadPx}px`;
          span.style.lineHeight = "1";
        } else {
          span.style.backgroundColor = "transparent";
          span.style.borderRadius = "0";
          span.style.padding = "0";
        }
        span.textContent = word.text + (i < line.length - 1 ? " " : "");
        lineContentWrap.appendChild(span);
      });
      if (preset.highlight) {
        lineContentWrap.style.backgroundColor = preset.highlight_color;
        lineContentWrap.style.borderRadius = highlightRadiusPx;
        lineContentWrap.style.padding = `${highlightPadPx}px`;
        lineContentWrap.style.display = "inline-block";
      }
      lineDiv.appendChild(lineContentWrap);
      div.appendChild(lineDiv);
    });
```

Note: `highlightRadiusPx` (line 96, still used by the `preset.highlight` block-level rect above) stays computed from `preset.highlight_border_radius` — unrelated to spotlight, unchanged.

- [ ] **Step 2: Update the file's header comment**

Replace the file's header comment (lines 1-15) — specifically the line referencing `highlight_mode "background"` — with:

```js
// Stage caption overlay rendering: paginates project.captions.words via CaptionLayout.paginateWords
// (word-wrap by the caption box's fixed width, line-pagination by its fixed height), finds the
// page active at a given timelineTime, and renders it as one .caption-block div containing one
// .caption-line div per line. preset.highlight (an always-on background behind visible text) and
// the active word's own spotlight_color/spotlight_outline*/spotlight_shadow*/spotlight_highlight*
// (per-word karaoke styling, off in highlight_mode "off", outline/shadow only in "current_word")
// both paint per-line/per-word tight backgrounds — equal HIGHLIGHT_PAD_EM padding on all 4 sides
// around a line-height:1 wrapper, hugging the actual rendered text rather than the caption's fixed
// box, mirroring app/ass_render.py's _caption_highlight_dialogues/_active_word_highlight_dialogues.
// Memoizes the paginated pages per (words, box size, font) so a full re-measure only happens when
// something relevant actually changed — mirrors preview-text.js's fitCache pattern. Case styling
// (preset.text_case): displayed via CSS text-transform, paginated using a measurer wrapped through
// TextCase.apply so line-wrapping matches what CSS actually draws.
// getBoxSizeCanvasPx() reads the caption block's live on-stage rendered size (in 1080x1920 canvas
// px) for the POSITION single-row icon anchor shortcut. Exposes window.PreviewCaptions.
// {renderCaptions(project, presets, timelineTime), getBoxSizeCanvasPx}.
```

- [ ] **Step 3: Manual verification**

In the same browser session as Task 5's check, scrub the timeline playhead across a caption's words in each mode (Off/Current word/Progressive fill) and confirm the active word visually reflects Color/Outline/Shadow/Highlight as configured, matching what Task 5 set.

- [ ] **Step 4: Commit**

```bash
git add static/preview-captions.js
git commit -m "feat: render spotlight color/outline/shadow/highlight on the active caption word"
```

---

### Task 7: Update codebase map

**Files:**
- Modify: `CLAUDE.md` (project-level, root of the repo)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the CAPTIONS/Spotlight entries**

In `CLAUDE.md`'s File structure tree and Inventory sections:
- Update `static/style-section-spotlight.js`'s entry to describe the Off mode, the nested `StylePanelHost`, and its reuse of the four shared sections instead of the old flat Mode+Color+Radius description.
- Update `static/style-section-color.js`/`outline.js`/`shadow.js`/`highlight.js`'s entries to mention the new field-name parameterization options.
- Update `app/models.py`'s `TextPreset` entry to list the new `spotlight_*` fields and the `highlight_mode` value change (`off | current_word | progressive_fill`, "background" now legacy-only).
- Update `app/ass_render.py`'s entry: `_background_word_dialogues` is renamed `_active_word_highlight_dialogues` and is no longer mode-exclusive.
- Update `static/panel-captions.js`'s entry to mention the new self-heal.
- Update `static/preview-captions.js`'s entry per its new header comment (Task 6, Step 2).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for spotlight per-word style overrides"
```

---

### Task 8: Final full-suite verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full backend suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all green.

- [ ] **Step 2: Run the full JS suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: all green.

- [ ] **Step 3: Manual smoke test — export**

In the browser (throwaway project), with a Spotlight-styled caption track (Current word mode, Outline+Shadow+Highlight all on, non-default colors), run an export and confirm the exported mp4's captions visually match the preview's active-word styling. Repeat once with Progressive fill mode (Outline/Shadow won't apply — confirm Color/Highlight still do).
