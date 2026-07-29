# Captions Marker Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give CAPTIONS the same always-on marker highlight (background color + border-radius behind all caption text) that TEXT already has, independent of the karaoke MODE (current word / progressive fill / background).

**Architecture:** Reuses the already-shared `TextPreset.highlight`/`highlight_color`/`highlight_border_radius` fields (no model change). Backend gets one new small ASS-rendering function; frontend gets one new toggle in the existing CAPTIONS HIGHLIGHT body, reusing its already-visible color/radius fields, plus a container-level CSS background in the live preview.

**Tech Stack:** FastAPI/Pydantic backend, vanilla-JS frontend (no build step), pytest.

## Global Constraints

- No new fields on `TextPreset` — `highlight`/`highlight_color`/`highlight_border_radius` already exist (added by the prior highlight-border-radius branch, now merged to main).
- No JS build step — follow existing patterns exactly.
- Every `static/*.js` file's header comment must stay current when its role changes.
- Tests must pass: `.venv/Scripts/python -m pytest -q`.
- When both `preset.highlight` (marker) and `preset.box_background` (the pre-existing caption box background/border feature) are enabled at once, the marker highlight's background/radius take precedence over the box background's on the same rendered element (last-write-wins is fine — no new layered-div system).
- `preset.highlight`'s marker background spans the caption track's whole active lifetime (first word's `t_start` to last word's `t_end`), not tied to any single word's timing — unlike the per-word karaoke MODE rendering.

---

### Task 1: Backend — always-on caption marker highlight in ASS export

**Files:**
- Modify: `app/ass_render.py` (add `_caption_highlight_dialogue`, wire into `render_caption_ass`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.highlight`/`highlight_color`/`highlight_border_radius` (already exist), `_rounded_rect_path`, `_ass_override_color`, `CAPTION_STYLE_NAME`, `ass_time` (all existing).
- Produces: `_caption_highlight_dialogue(p: TextPreset, words: list[CaptionWord], box_width: float, box_height: float) -> str | None`, consumed by `render_caption_ass`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py`, near the existing `test_render_caption_ass_falls_back_to_default_box_when_not_fixed` (search for that name to find the right neighborhood — these tests all use the `w(text, start, end)` helper already defined at the top of the file):

```python
def test_caption_highlight_dialogue_emits_rect_spanning_full_word_range():
    from app.ass_render import _caption_highlight_dialogue
    pr = TextPreset(name="Cap", x=540, y=700, highlight=True, highlight_color="#00FF00", highlight_border_radius=10)
    words = [w("Hello", 1.0, 1.5), w("world", 1.5, 2.2)]
    line = _caption_highlight_dialogue(pr, words, 900, 350)
    assert line is not None
    assert line.startswith("Dialogue: 0,0:00:01.00,0:00:02.20")
    assert "\\p1" in line

def test_caption_highlight_dialogue_none_when_highlight_off():
    from app.ass_render import _caption_highlight_dialogue
    pr = TextPreset(name="Cap", highlight=False)
    words = [w("Hello", 1.0, 1.5)]
    assert _caption_highlight_dialogue(pr, words, 900, 350) is None

def test_caption_highlight_dialogue_none_when_no_words():
    from app.ass_render import _caption_highlight_dialogue
    pr = TextPreset(name="Cap", highlight=True)
    assert _caption_highlight_dialogue(pr, [], 900, 350) is None

def test_render_caption_ass_includes_highlight_rect_before_karaoke_dialogue():
    from app.ass_render import render_caption_ass
    pr = TextPreset(name="Cap", highlight=True, highlight_color="#00FF00", highlight_mode="progressive_fill")
    p = Project(name="r", captions=CaptionTrack(words=[w("hi", 1.0, 1.5)], preset_id=pr.id))
    out = render_caption_ass(p, pr)
    dialogues = [l for l in out.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 2
    assert "\\p1" in dialogues[0]  # the rect
    assert "hi" in dialogues[1]     # the karaoke text, after the rect
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k caption_highlight_dialogue -v`
Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py::test_render_caption_ass_includes_highlight_rect_before_karaoke_dialogue -v`
Expected: FAIL — `_caption_highlight_dialogue` doesn't exist yet (`ImportError`), and the last test currently produces only 1 dialogue line, not 2.

- [ ] **Step 3: Implement `_caption_highlight_dialogue`**

In `app/ass_render.py`, add this function immediately after `_background_word_dialogues` (search for `def render_caption_ass` — add this right before it):

```python
def _caption_highlight_dialogue(p: TextPreset, words: list[CaptionWord], box_width: float, box_height: float) -> str | None:
    """CAPTIONS always-on marker highlight (preset.highlight): a rounded rect drawn behind the
    whole caption box for as long as any caption word is on screen, independent of highlight_mode's
    per-word karaoke rendering (current_word/progressive_fill/background). Spans the caption
    track's full active lifetime (first word's t_start to last word's t_end), not any single
    word's window. Same _rounded_rect_path construction as _box_dialogue, sized to the caption
    box instead of a text block."""
    if not p.highlight or not words:
        return None
    if p.align == "left":
        left = p.x
    elif p.align == "right":
        left = p.x - box_width
    else:
        left = p.x - box_width / 2
    top = p.y
    path = _rounded_rect_path(box_width, box_height, p.highlight_border_radius)
    fill = _ass_override_color(p.highlight_color)
    fx = f"\\an7\\pos({left:.0f},{top:.0f})\\1a&H00&\\3a&HFF&\\1c{fill}\\p1"
    start, end = words[0].t_start, words[-1].t_end
    return f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{CAPTION_STYLE_NAME},,0,0,0,,{{{fx}}}{path}{{\\p0}}"
```

- [ ] **Step 4: Wire it into `render_caption_ass`**

In `app/ass_render.py`, `render_caption_ass` currently reads (find this exact block):

```python
    pages = paginate_words(words, measure, max(1, box_width - pad_x), max(1, box_height - pad_y), preset.size_px, LINE_HEIGHT)
    event_lines = []
    for page in pages:
```

Change to:

```python
    pages = paginate_words(words, measure, max(1, box_width - pad_x), max(1, box_height - pad_y), preset.size_px, LINE_HEIGHT)
    event_lines = []
    highlight_line = _caption_highlight_dialogue(preset, words, box_width, box_height)
    if highlight_line:
        event_lines.append(highlight_line)
    for page in pages:
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "caption_highlight_dialogue or includes_highlight_rect" -v`
Expected: PASS

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS (this is purely additive — `preset.highlight` defaults to `False`, so every existing caption test that doesn't set it explicitly is unaffected).

- [ ] **Step 7: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: add always-on CAPTIONS marker highlight to ASS export"
```

---

### Task 2: Frontend — CAPTIONS marker highlight toggle + live preview

**Files:**
- Modify: `static/index.html` (add MARKER toggle markup to `#caption-highlight-body`)
- Modify: `static/caption-panel-highlight.js` (add the toggle, adjust radius-field visibility)
- Modify: `static/preview-captions.js` (container-level background/radius in `renderCaptions()`)

**Interfaces:**
- Consumes: `ensureCaptionPreset(ensureCaptionTrack().preset_id)`, `saveProject()`, `renderCaptionPreview()` (all existing globals already used by `caption-panel-highlight.js`).
- Produces: no new exported function — `window.CaptionPanel.renderHighlight()` is extended in place.

- [ ] **Step 1: Add the MARKER toggle markup to `static/index.html`**

Find `#caption-highlight-body` (search for `caption-highlight-mode-group` — the MARKER group goes immediately before the existing `MODE` label/group):

```html
          <div id="caption-highlight-body">
            <div class="style-group-label">MODE</div>
            <div class="style-group">
              <div id="caption-highlight-mode-group"></div>
            </div>
```

Change to:

```html
          <div id="caption-highlight-body">
            <div class="style-group-label">MARKER</div>
            <div class="style-group">
              <div id="caption-highlight-marker-group"></div>
            </div>
            <div class="style-group-label">MODE</div>
            <div class="style-group">
              <div id="caption-highlight-mode-group"></div>
            </div>
```

(The existing `#caption-highlight-color-field` and `#caption-highlight-border-radius-field` rows further down in this same `#caption-highlight-body` block are untouched — they're reused as-is by the new toggle, not duplicated.)

- [ ] **Step 2: Replace `static/caption-panel-highlight.js` with this full content**

```javascript
// CAPTIONS panel Design tab (HIGHLIGHT group): an always-on MARKER toggle (background color +
// border radius behind all caption text, added 2026-07-25 for parity with TEXT's
// text-panel-highlight.js) plus the karaoke MODE toggle (current word / progressive fill /
// background). MARKER and MODE's "Background" option share the same highlight_color/
// highlight_border_radius fields (rendered once, below both groups) — captions-only controls
// with no TEXT-panel equivalent beyond that field sharing. Word/line counts are automatic via
// the Box tab's fixed WIDTH/HEIGHT + app/caption_layout.py's paginate_words.
// Exposes window.CaptionPanel.renderHighlight().
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderHighlight = function renderHighlight() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

  UI.buttonGroup(document.getElementById("caption-highlight-marker-group"),
    [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
    preset.highlight ? "on" : "off",
    (value) => { preset.highlight = value === "on"; saveProject(); renderCaptionPreview(); renderHighlight(); });

  UI.buttonGroup(document.getElementById("caption-highlight-mode-group"),
    [{ value: "current_word", label: "Current word", span: 4 },
     { value: "progressive_fill", label: "Progressive fill", span: 4 },
     { value: "background", label: "Background", span: 8 }],
    preset.highlight_mode,
    (value) => { preset.highlight_mode = value; saveProject(); renderCaptionPreview(); renderHighlight(); });

  UI.colorSwatch(document.getElementById("caption-highlight-color-field"),
    { label: "Highlight color", value: preset.highlight_color, span: 8,
      onChange: (v) => { preset.highlight_color = v; saveProject(); renderCaptionPreview(); } });

  document.getElementById("caption-highlight-border-radius-field").hidden =
    preset.highlight_mode !== "background" && !preset.highlight;

  UI.numberField(document.getElementById("caption-highlight-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.highlight_border_radius, min: 0, max: 40, span: 8,
      onChange: (v) => { preset.highlight_border_radius = v; saveProject(); renderCaptionPreview(); } });
};
```

- [ ] **Step 3: Add container-level background/radius to `static/preview-captions.js`**

Find the line setting `div.style.borderRadius` from `box_border_radius` in `renderCaptions()` (it's right before `div.style.pointerEvents = "none";`):

```javascript
    div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";
    div.style.pointerEvents = "none";
```

Change to:

```javascript
    div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";
    if (preset.highlight) {
      div.style.backgroundColor = preset.highlight_color;
      div.style.borderRadius = (preset.highlight_border_radius / 1080 * stageW) + "px";
    }
    div.style.pointerEvents = "none";
```

(This intentionally overrides the box-background styling set two lines above when `preset.highlight` is on, per this plan's stated precedence rule — last-write-wins, no new layered element.)

- [ ] **Step 4: Sanity-check the JS files**

Run `node --check static/caption-panel-highlight.js && node --check static/preview-captions.js` if node is available; otherwise re-read both edited regions carefully to confirm correctness.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/caption-panel-highlight.js static/preview-captions.js
git commit -m "feat: CAPTIONS panel MARKER highlight toggle + live preview background"
```

---

### Task 3: Codebase map update + manual live verification

**Files:**
- Modify: `CLAUDE.md` (update the `caption-panel-highlight.js` inventory line, `app/ass_render.py`'s inventory line, `static/preview-captions.js`'s inventory line)

**No automated test for this task** — thin UI wiring and docs, verified manually.

- [ ] **Step 1: Update `CLAUDE.md`**

Update these existing inventory lines (find each by its current wording):
1. `static/caption-panel-highlight.js`'s inventory line — mention the new always-on MARKER toggle alongside the existing MODE description.
2. `app/ass_render.py`'s inventory line (Captions section) — mention `_caption_highlight_dialogue`.
3. `static/preview-captions.js`'s inventory line — mention the container-level background/radius from `preset.highlight`, and its precedence over `box_background` when both are set.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: map entries for CAPTIONS marker highlight"
```

- [ ] **Step 3: Manual live verification**

Start the server (`(.venv/Scripts/python -m uvicorn app.main:app --reload`) on a throwaway project (never real project data). Create a caption track with a couple of test words (or transcribe a real clip if one's handy). Open the CAPTIONS panel's Design tab, find the new MARKER toggle above MODE, turn it ON, confirm the whole caption box shows a colored background live on stage. Change the color and radius fields, confirm both update live. Turn MARKER OFF, confirm the background disappears while any karaoke MODE styling (current word/progressive fill/background) still works independently. Turn MARKER back ON alongside MODE="background" and confirm both render without erroring (the per-word active box drawn on top of the always-on background — some visual overlap is expected and acceptable per this plan's design).

- [ ] **Step 4: Report status**

If manual checks pass, tell the user the feature is implemented and verified, and the branch is ready to merge — wait for explicit go-ahead before merging/pushing, per this repo's session-habits convention.
