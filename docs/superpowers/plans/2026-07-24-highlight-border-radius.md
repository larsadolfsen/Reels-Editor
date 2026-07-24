# Highlight Background + Border-Radius (TEXT/CAPTIONS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the existing (backend-only) TEXT-block marker highlight as a UI toggle with a configurable border-radius, and add a new "Background" caption highlight mode that draws a rounded box behind the active word instead of recoloring it.

**Architecture:** One new shared `TextPreset.highlight_border_radius` field drives both features. TEXT gets a new settings-row+subpanel file (`text-panel-highlight.js`) mirroring the existing Shadow panel. CAPTIONS extends its existing highlight mode button group with a third option and a conditional radius field. `app/ass_render.py` gains one new helper (`_background_word_dialogues`) and swaps a hardcoded constant for the new field.

**Tech Stack:** FastAPI/Pydantic backend, vanilla-JS frontend (no build step), pytest.

## Global Constraints

- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — all styling lives in `static/css/**` classes. (This plan only sets DOM `element.style.*` properties from JS at render time, which is the codebase's existing pattern for per-instance dynamic values — not a static HTML/JS-markup `style="..."` attribute, so it's compliant.)
- Every `static/*.js` file opens with a one-to-two-line header comment stating its purpose.
- No JS build step — copy existing patterns exactly (`UI.settingsRow`, `UI.buttonGroup`, `UI.colorSwatch`, `UI.numberField`).
- Tests must pass: `.venv/Scripts/python -m pytest -q`.
- `highlight_border_radius` default is `4` (preserves the current hardcoded ASS radius so existing highlighted runs render unchanged until edited).
- CLAUDE.md's codebase map/inventory must be updated in the same commit as any file add/move/rename/delete.

---

### Task 1: Add `highlight_border_radius` field to `TextPreset`

**Files:**
- Modify: `app/models.py:83-85`
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `TextPreset.highlight_border_radius: int` (default `4`), consumed by Task 2 (TEXT rendering) and Task 4 (CAPTIONS rendering).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py` (check the existing file first for its import style — it imports from `app.models`; add near other `TextPreset` field-default tests, or as a new standalone test if none exist yet):

```python
def test_text_preset_highlight_border_radius_defaults_to_four():
    from app.models import TextPreset
    pr = TextPreset(name="Pop")
    assert pr.highlight_border_radius == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py::test_text_preset_highlight_border_radius_defaults_to_four -v`
Expected: FAIL with `AttributeError` or a Pydantic validation-style error (field doesn't exist yet — Pydantic models raise `AttributeError` on unknown attribute access, not on extra kwargs unless `model_config` forbids them; if the model config allows extra fields silently, the failure will instead show up as the attribute simply not existing when asserted — either way this must fail before Step 3).

- [ ] **Step 3: Add the field**

In `app/models.py`, in the `TextPreset` class, right after the existing `highlight` field (currently `app/models.py:83-85`):

```python
    highlight_color: str = "#FFD400"   # shared: caption karaoke highlight color AND rich-text highlight color
    highlight_mode: str = "current_word"   # current_word | progressive_fill | background; unused by TextBlockLayer consumers except "background" mode's own rect radius
    highlight: bool = False            # block-level highlight default (off); highlight_color above is shared with captions
    highlight_border_radius: int = 4   # px on the 1080x1920 canvas; shared by TEXT's marker-highlight rect and CAPTIONS' "background" mode word rect
```

(This replaces the three existing lines with four — the middle `highlight_mode` line's comment is updated to mention the new `"background"` value, and a new `highlight_border_radius` line is appended.)

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py::test_text_preset_highlight_border_radius_defaults_to_four -v`
Expected: PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all existing tests still PASS (this is a pure additive field with a default, so nothing else should break).

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add TextPreset.highlight_border_radius field"
```

---

### Task 2: Wire `highlight_border_radius` into the existing TEXT highlight rectangle (replace hardcoded constant)

**Files:**
- Modify: `app/ass_render.py:180,193-210` (the `HIGHLIGHT_RADIUS` constant and its one usage inside `_highlight_dialogues`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.highlight_border_radius` (Task 1).
- Produces: no new public interface — `_highlight_dialogues` behavior change only.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ass_render.py`, near the existing `test_highlighted_run_on_single_line_emits_one_rectangle` (around line 434):

```python
def test_highlighted_run_uses_preset_border_radius_not_hardcoded_constant():
    pr = TextPreset(name="Pop", x=100, y=200, size_px=50, box_width_mode="fit", highlight_border_radius=12)
    run = FormatRun(start=0, end=3, highlight=True, highlight_color="#00FF00")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG NEWS", preset_id=pr.id, start=0, end=2,
                                                        formatting_runs=[run])])
    out = render_ass(p, {pr.id: pr})
    highlight_line = next(l for l in out.splitlines() if "hl0" in l)
    # radius 12 -> k = 12 * 0.5523 ~= 6.63 -> _n() renders as "6.63"; hardcoded radius 4 would give "2.21"
    assert "6.63" in highlight_line
    assert "2.21" not in highlight_line
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py::test_highlighted_run_uses_preset_border_radius_not_hardcoded_constant -v`
Expected: FAIL — the rect is still drawn with the hardcoded `HIGHLIGHT_RADIUS = 4`, so `"6.63"` will not appear (radius stays 4 regardless of the preset's field).

- [ ] **Step 3: Replace the constant with the preset field**

In `app/ass_render.py`, delete line 180 (`HIGHLIGHT_RADIUS = 4`) entirely, and in `_highlight_dialogues` change line 210 from:

```python
            path = _rounded_rect_path(rect_width, rect_height, HIGHLIGHT_RADIUS)
```

to:

```python
            path = _rounded_rect_path(rect_width, rect_height, p.highlight_border_radius)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py::test_highlighted_run_uses_preset_border_radius_not_hardcoded_constant -v`
Expected: PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS, including the pre-existing `test_highlighted_run_on_single_line_emits_one_rectangle` and `test_highlighted_run_spanning_two_wrapped_lines_emits_two_rectangles` (these don't set `highlight_border_radius`, so they use the new default of `4` — identical numeric output to before).

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: TEXT highlight rectangle radius now configurable via TextPreset.highlight_border_radius"
```

---

### Task 3: `preview-text.js` — live CSS border-radius on highlighted spans

**Files:**
- Modify: `static/preview-text.js:140-141`

**Interfaces:**
- Consumes: `preset.highlight_border_radius` (Task 1). No test file — this is thin UI rendering, verified manually in Task 8.

- [ ] **Step 1: Add the CSS border-radius line**

In `static/preview-text.js`, right after the existing `span.style.backgroundColor` line (currently lines 140-141):

```javascript
        const highlighted = run && run.highlight != null ? run.highlight : preset.highlight;
        span.style.backgroundColor = highlighted ? ((run && run.highlight_color) || preset.highlight_color) : "transparent";
        span.style.borderRadius = highlighted ? ((preset.highlight_border_radius / 1920 * stageH) + "px") : "";
```

(The third line is new. `stageH` is already in scope in this function — it's used two lines above for `span.style.fontSize`.)

- [ ] **Step 2: Commit**

```bash
git add static/preview-text.js
git commit -m "feat: apply highlight_border_radius to the live TEXT-block highlight preview"
```

---

### Task 4: TEXT panel — Highlight settings row + subpanel (`text-panel-highlight.js`)

**Files:**
- Create: `static/text-panel-highlight.js`
- Modify: `static/index.html` (add `#text-highlight-row` markup, `#panel-text-highlight` subpanel markup, and a new `<script>` tag)
- Modify: `static/panel-text.js:169-170` (wire `TextPanel.renderHighlight()` into the orchestrator)

**Interfaces:**
- Consumes: `currentTextBlock()`, `ensureTextPreset(presetId)`, `saveProject()`, `renderTextPreview()` — all existing globals from `editor.js`/`panel-text.js`, same as `text-panel-shadow.js` already consumes.
- Produces: `window.TextPanel.renderHighlight()`, called by `panel-text.js`'s `renderTextPanel()`.

- [ ] **Step 1: Add the settings-row + subpanel markup to `static/index.html`**

In the Design tab body (`#text-font-body`), immediately after the existing Shadow row block (currently `static/index.html:635-637`):

```html
          <div class="style-group">
            <div id="text-shadow-row" class="col-8"></div>
          </div>

          <div class="style-group">
            <div id="text-highlight-row" class="col-8"></div>
          </div>
        </div>
```

(This inserts a new `.style-group` block for `#text-highlight-row` right before the existing closing `</div>` of `#text-font-body`.)

Then, immediately after the existing `#panel-text-shadow` subpanel block (currently `static/index.html:745-762`), add a new subpanel:

```html
        <div id="panel-text-highlight" hidden>
          <div id="text-highlight-subpanel-header"></div>
          <div class="style-group">
            <div id="text-highlight-toggle-group"></div>
          </div>
          <div class="style-group">
            <label id="text-highlight-color-field"></label>
          </div>
          <div class="style-group">
            <label id="text-highlight-radius-field"></label>
          </div>
        </div>
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, near the existing `<script src="/static/text-panel-shadow.js"></script>` tag (currently line 830), add immediately after it:

```html
<script src="/static/text-panel-shadow.js"></script>
<script src="/static/text-panel-highlight.js"></script>
```

- [ ] **Step 3: Create `static/text-panel-highlight.js`**

```javascript
// TEXT panel Design tab: Highlight row + drill-down subpanel (on/off toggle + color + border
// radius), same row+subpanel pattern as text-panel-shadow.js. Whole-preset setting only — no
// per-range FormatRun override. Exposes window.TextPanel.renderHighlight().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview).
window.TextPanel = window.TextPanel || {};

(() => {
  let highlightRowSetValue = null;

  function openHighlightPanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-highlight").hidden = false;
  }

  function closeHighlightPanel() {
    document.getElementById("panel-text-highlight").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("text-highlight-subpanel-header"), { title: "Highlight", onBack: closeHighlightPanel });

  window.TextPanel.renderHighlight = function renderHighlight() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    if (highlightRowSetValue) {
      highlightRowSetValue(preset.highlight ? "ON" : "OFF", null, preset.highlight ? preset.highlight_color : null);
    } else {
      highlightRowSetValue = UI.settingsRow(document.getElementById("text-highlight-row"), {
        label: "Highlight", value: preset.highlight ? "ON" : "OFF", swatchColor: preset.highlight ? preset.highlight_color : null,
        onClick: openHighlightPanel,
      });
    }

    const highlightFieldsHidden = !preset.highlight;
    document.getElementById("text-highlight-color-field").hidden = highlightFieldsHidden;
    document.getElementById("text-highlight-radius-field").hidden = highlightFieldsHidden;

    UI.buttonGroup(document.getElementById("text-highlight-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.highlight ? "on" : "off",
      (value) => {
        preset.highlight = value === "on";
        saveProject();
        renderTextPreview();
        renderHighlight();
      });

    UI.colorSwatch(document.getElementById("text-highlight-color-field"),
      { label: "Highlight", value: preset.highlight_color, span: 8,
        onChange: (v) => { preset.highlight_color = v; saveProject(); renderTextPreview(); renderHighlight(); } });

    UI.numberField(document.getElementById("text-highlight-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.highlight_border_radius, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.highlight_border_radius = v; saveProject(); renderTextPreview(); } });
  };
})();
```

- [ ] **Step 4: Wire `renderHighlight()` into the panel orchestrator**

In `static/panel-text.js`, change lines 169-170 from:

```javascript
  TextPanel.renderOutline();
  TextPanel.renderShadow();
```

to:

```javascript
  TextPanel.renderOutline();
  TextPanel.renderShadow();
  TextPanel.renderHighlight();
```

- [ ] **Step 5: Commit**

```bash
git add static/text-panel-highlight.js static/index.html static/panel-text.js
git commit -m "feat: TEXT panel Highlight settings row + subpanel (toggle, color, border radius)"
```

---

### Task 5: `_background_word_dialogues` — new CAPTIONS "background" highlight mode (ASS export)

**Files:**
- Modify: `app/ass_render.py` (add `_background_word_dialogues` near `_current_word_dialogues`, currently `app/ass_render.py:288-305`; update `render_caption_ass`'s branching, currently `app/ass_render.py:325-329`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.highlight_border_radius` (Task 1), `_rounded_rect_path` (existing), `_ass_override_color` (existing), `_shadow_tag` (existing), `pil_font_measurer` (existing import), `CAPTION_STYLE_NAME` (existing), `ass_time` (existing).
- Produces: `_background_word_dialogues(page, p) -> list[str]`, consumed by `render_caption_ass`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py`, near the existing `test_current_word_dialogues_highlight_word_on_any_line` (around line 273):

```python
def test_background_word_dialogues_emit_rect_before_text_per_active_word():
    from app.ass_render import _background_word_dialogues
    pr = TextPreset(name="Cap", x=540, y=700, size_px=48, highlight_color="#FFD400", highlight_border_radius=8)
    page = [[w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)]]
    dialogues = _background_word_dialogues(page, pr)
    assert len(dialogues) == 4  # 2 words * (rect + text)
    # First pair covers "Hello"'s window; the rect line comes before the text line.
    first_window = [d for d in dialogues if d.startswith("Dialogue: 0,0:00:00.00,0:00:00.50")]
    assert len(first_window) == 2
    assert "\\p1" in first_window[0]          # rect first
    assert "\\p1" not in first_window[1]      # text second
    assert "Hello" in first_window[1] and "world" in first_window[1]  # full page text, not just the active word

def test_background_word_dialogues_use_preset_radius():
    from app.ass_render import _background_word_dialogues
    pr = TextPreset(name="Cap", x=540, y=700, size_px=48, highlight_border_radius=12)
    page = [[w("Hi", 0.0, 0.5)]]
    dialogues = _background_word_dialogues(page, pr)
    rect_line = next(d for d in dialogues if "\\p1" in d)
    assert "6.63" in rect_line  # 12 * 0.5523 rounded to 2 decimals, same _n() convention as Task 2's test

def test_render_caption_ass_background_mode_routes_to_background_dialogues():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight_mode="background", highlight_border_radius=6)
    p = Project(name="r", captions=CaptionTrack(words=[w("Hi", 0.0, 0.5), w("there", 0.5, 1.0)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 4  # 2 words * (rect + text), same shape as _background_word_dialogues alone
    assert any("\\p1" in d for d in dialogues)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k background_word_dialogues -v`
Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py::test_render_caption_ass_background_mode_routes_to_background_dialogues -v`
Expected: FAIL — `_background_word_dialogues` doesn't exist yet (`ImportError`), and `render_caption_ass` with `highlight_mode="background"` currently falls through to the `else` branch (`_karaoke_dialogue`), producing 1 dialogue instead of 4.

- [ ] **Step 3: Implement `_background_word_dialogues`**

In `app/ass_render.py`, add this function immediately after `_current_word_dialogues` (currently ends at line 305, right before `def render_caption_ass`):

```python
def _background_word_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]:
    """CAPTIONS 'background' highlight mode: draws a rounded rect behind the currently-active
    word (no text-color swap, unlike _current_word_dialogues), following the same per-line
    x-offset/width math _highlight_dialogues uses for TEXT-block marker highlights, and the same
    align-relative left-origin convention _caption_style's Alignment field expects (p.x is the
    line's left/right/center anchor depending on p.align). One rect+text dialogue pair is emitted
    per active word, with the rect appended first so it renders underneath the text."""
    weight = _resolved_weight(p)
    measure = pil_font_measurer(p.font, p.size_px, weight)
    fill = _ass_override_color(p.highlight_color)
    rect_height = p.size_px * LINE_HEIGHT
    text_fx = f"\\pos({p.x},{p.y})" + _shadow_tag(p)

    line_layout = []  # per line: (list of (word_x_offset, word_width), line_total_width)
    for line in page:
        offsets = []
        x = 0.0
        for j, word in enumerate(line):
            seg = word.text + (" " if j < len(line) - 1 else "")
            offsets.append((x, measure(word.text)))
            x += measure(seg)
        line_layout.append((offsets, x))

    line_bodies = []
    for line in page:
        line_bodies.append("".join(word.text + (" " if j < len(line) - 1 else "") for j, word in enumerate(line)))
    text_body = "\\N".join(line_bodies)

    dialogues = []
    for line_i, line in enumerate(page):
        offsets, line_width = line_layout[line_i]
        if p.align == "left":
            left_origin = p.x
        elif p.align == "right":
            left_origin = p.x - line_width
        else:
            left_origin = p.x - line_width / 2
        for word_i, active in enumerate(line):
            word_x, word_w = offsets[word_i]
            left = left_origin + word_x
            top = p.y + line_i * rect_height
            path = _rounded_rect_path(word_w, rect_height, p.highlight_border_radius)
            rect_fx = f"\\an7\\pos({left:.0f},{top:.0f})\\1a&H00&\\3a&HFF&\\1c{fill}\\p1"
            dialogues.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                              f"{CAPTION_STYLE_NAME},,0,0,0,,{{{rect_fx}}}{path}{{\\p0}}")
            dialogues.append(f"Dialogue: 0,{ass_time(active.t_start)},{ass_time(active.t_end)},"
                              f"{CAPTION_STYLE_NAME},,0,0,0,,{{{text_fx}}}{text_body}")
    return dialogues
```

- [ ] **Step 4: Wire the new branch into `render_caption_ass`**

In `app/ass_render.py`, change the branching block (currently lines 325-329) from:

```python
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(page, preset))
        else:
            event_lines.append(_karaoke_dialogue(page, preset))
```

to:

```python
        if preset.highlight_mode == "current_word":
            event_lines.extend(_current_word_dialogues(page, preset))
        elif preset.highlight_mode == "background":
            event_lines.extend(_background_word_dialogues(page, preset))
        else:
            event_lines.append(_karaoke_dialogue(page, preset))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "background_word_dialogues or background_mode_routes" -v`
Expected: PASS

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS — `current_word` and `progressive_fill` branches are untouched, only a new `elif` was inserted.

- [ ] **Step 7: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: add CAPTIONS 'background' highlight mode (rounded box behind active word)"
```

---

### Task 6: CAPTIONS panel — "Background" mode option + radius field (`caption-panel-highlight.js`)

**Files:**
- Modify: `static/caption-panel-highlight.js`
- Modify: `static/index.html` (add `#caption-highlight-border-radius-field` markup)

**Interfaces:**
- Consumes: `ensureCaptionPreset(ensureCaptionTrack().preset_id)`, `saveProject()`, `renderCaptionPreview()` — all existing globals already used by this file.
- Produces: no new exported function — `window.CaptionPanel.renderHighlight()` is extended in place (already wired into `panel-captions.js`'s orchestrator at line 74, no change needed there).

- [ ] **Step 1: Add the radius field markup to `static/index.html`**

In `#caption-highlight-body` (currently `static/index.html:322-330`), add a new field row after the existing color field:

```html
          <div id="caption-highlight-body">
            <div class="style-group-label">MODE</div>
            <div class="style-group">
              <div id="caption-highlight-mode-group"></div>
            </div>
            <div class="style-group">
              <div id="caption-highlight-color-field"></div>
            </div>
            <div class="style-group">
              <label id="caption-highlight-border-radius-field"></label>
            </div>
          </div>
```

- [ ] **Step 2: Extend the mode button group and add the radius field in `static/caption-panel-highlight.js`**

Replace the full file content with:

```javascript
// CAPTIONS panel Design tab (HIGHLIGHT group): karaoke mode toggle (current word / progressive
// fill / background) + highlight color + border radius (radius only applies to Background mode,
// hidden otherwise) — captions-only controls with no TEXT-panel equivalent (TEXT's highlight is
// its own text-panel-highlight.js). Word/line counts are automatic via the Box tab's fixed
// WIDTH/HEIGHT + app/caption_layout.py's paginate_words. Exposes window.CaptionPanel.renderHighlight().
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderHighlight = function renderHighlight() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.buttonGroup(document.getElementById("caption-highlight-mode-group"),
    [{ value: "current_word", label: "Current word", span: 4 },
     { value: "progressive_fill", label: "Progressive fill", span: 4 },
     { value: "background", label: "Background", span: 8 }],
    preset.highlight_mode,
    (value) => { preset.highlight_mode = value; saveProject(); renderCaptionPreview(); renderHighlight(); });

  UI.colorSwatch(document.getElementById("caption-highlight-color-field"),
    { label: "Highlight color", value: preset.highlight_color, span: 8,
      onChange: (v) => { preset.highlight_color = v; saveProject(); renderCaptionPreview(); } });

  document.getElementById("caption-highlight-border-radius-field").hidden = preset.highlight_mode !== "background";

  UI.numberField(document.getElementById("caption-highlight-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.highlight_border_radius, min: 0, max: 40, span: 8,
      onChange: (v) => { preset.highlight_border_radius = v; saveProject(); renderCaptionPreview(); } });
};
```

- [ ] **Step 3: Commit**

```bash
git add static/caption-panel-highlight.js static/index.html
git commit -m "feat: CAPTIONS panel Background highlight mode + border radius field"
```

---

### Task 7: `preview-captions.js` — live CSS rendering for "background" mode

**Files:**
- Modify: `static/preview-captions.js:93-104` (the per-word span rendering loop inside `renderCaptions`)

**Interfaces:**
- Consumes: `preset.highlight_mode`, `preset.highlight_color`, `preset.highlight_border_radius` (Task 1), `stageH` (already in scope in `renderCaptions`).

- [ ] **Step 1: Replace the per-word rendering loop**

In `static/preview-captions.js`, change the `page.forEach` block (currently lines 90-106) from:

```javascript
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
```

to:

```javascript
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
        if (preset.highlight_mode === "background") {
          span.style.color = preset.color;
          span.style.backgroundColor = isHighlighted ? preset.highlight_color : "transparent";
          span.style.borderRadius = isHighlighted ? ((preset.highlight_border_radius / 1920 * stageH) + "px") : "0";
        } else {
          span.style.color = isHighlighted ? preset.highlight_color : preset.color;
          span.style.backgroundColor = "transparent";
          span.style.borderRadius = "0";
        }
        span.textContent = word.text + (i < line.length - 1 ? " " : "");
        lineDiv.appendChild(span);
      });
      div.appendChild(lineDiv);
    });
```

- [ ] **Step 2: Commit**

```bash
git add static/preview-captions.js
git commit -m "feat: live CAPTIONS preview renders Background highlight mode"
```

---

### Task 8: Codebase map update + manual live verification

**Files:**
- Modify: `CLAUDE.md` (codebase map: `TextPreset` field list, `app/ass_render.py` inventory entry, `static/preview-text.js`/`static/preview-captions.js` inventory entries, new `static/text-panel-highlight.js` entry, `static/caption-panel-highlight.js` inventory entry, `static/index.html` inventory entry)

**No automated test for this task** — per this project's CLAUDE.md, thin UI wiring (settings-row plumbing, DOM markup) is acceptable to leave manually verified rather than automated-test-covered, since the logic underneath it (`_background_word_dialogues`, the `highlight_border_radius` field, the CSS-vs-ASS radius math) is already covered by Tasks 1, 2, and 5. This task's job is to actually run the app and look at it.

- [ ] **Step 1: Update `CLAUDE.md`'s codebase map**

Update the following inventory entries (find each by its current text and edit in place — see the current CLAUDE.md content for exact current wording to match against):

1. In the "Data model & persistence" or "Text blocks & rich-text formatting" section's `TextPreset` field list, add a mention of `highlight_border_radius: int = 4` (shared by TEXT marker-highlight and the new CAPTIONS "background" mode) and update the `highlight_mode` description to list `"background"` as a third value.
2. In `app/ass_render.py`'s inventory line, mention `_background_word_dialogues` alongside `_current_word_dialogues`/`_karaoke_dialogue`.
3. In `static/preview-text.js`'s inventory line, note the highlight span now also sets `border-radius` from `highlight_border_radius`.
4. In `static/preview-captions.js`'s inventory line, note the new `"background"` highlight-mode branch (background-color + border-radius instead of a text-color swap).
5. In the "Text blocks & rich-text formatting" section's file list, add a new bullet/mention for `static/text-panel-highlight.js` (Highlight settings row + subpanel, same row+subpanel pattern as Outline/Shadow).
6. In `static/caption-panel-highlight.js`'s inventory line, note the third "Background" mode option and the conditional border-radius field.
7. In `static/index.html`'s inventory paragraph, note the new `#text-highlight-row`/`#panel-text-highlight` markup and the third CAPTIONS highlight-mode button + radius field.

- [ ] **Step 2: Commit the map update**

```bash
git add CLAUDE.md
git commit -m "docs: map entries for highlight background + border-radius feature"
```

- [ ] **Step 3: Manual live verification — TEXT highlight**

Start the server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` on a **throwaway project** (per this repo's standing convention — never test on real project data, since the app's unload-keepalive-save flushes in-memory mutations to disk). Add a text block, open the TEXT panel's Design tab, scroll to the new Highlight row below Shadow, toggle it ON, confirm the stage preview shows a colored background behind the text immediately. Change the highlight color and the radius field; confirm both update live on the stage. Toggle OFF; confirm the background disappears.

- [ ] **Step 4: Manual live verification — CAPTIONS background mode**

On the same throwaway project, open/create a caption track, go to the Design tab's HIGHLIGHT group, select "Background" mode. Confirm a new RADIUS field appears (and disappears when switching back to Current word/Progressive fill). Play the clip; confirm the active word shows a rounded highlight box that tracks playback, moving from word to word, and that the box's corners visibly round more/less as you change the radius field.

- [ ] **Step 5: Spot-check export**

With both a highlighted TEXT block and a Background-mode caption track in the same throwaway project, run a short export (FILENAME/QUALITY as usual via the EXPORT panel) and open the resulting mp4. Confirm the TEXT highlight background and the CAPTIONS background-mode box both appear burned in, with rounded corners matching what the preview showed.

- [ ] **Step 6: Report status**

If all manual checks pass, tell the user the feature is fully implemented and verified, and that the branch is ready to merge — per this repo's session-habits convention, wait for their explicit go-ahead before merging/pushing.
