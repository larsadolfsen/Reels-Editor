# Absolute Pixel Coordinates for Text Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `TextPreset`'s anchor-grid + offset position model (`pos_row`/`pos_col`/`offset_x`/`offset_y`) with direct, align-aware absolute pixel coordinates (`x`/`y`), matching the design in [2026-07-19-absolute-pixel-coordinates-design.md](../specs/2026-07-19-absolute-pixel-coordinates-design.md).

**Architecture:** `preset.x` is the box's left/center/right edge (per `preset.align`); `preset.y` is always the box's top edge. Four layers change in lockstep: the Pydantic model (drop the anchor/offset fields), ASS export (align-driven `\an7/8/9` anchor codes), the live preview (align-driven CSS transform classes instead of a blanket `-50%/-50%`), and the editor UI (HORIZONTAL/VERTICAL fields edit `x`/`y` directly; the 3x3 grid becomes a stateless one-shot shortcut).

**Tech Stack:** Python 3 / FastAPI / Pydantic (backend, `app/`), vanilla JS + CSS, no build step (frontend, `static/`). Backend tests: pytest. Frontend: manual browser verification (no JS test runner in this repo).

## Global Constraints

- No migration for existing saved projects — old center-anchored `x`/`y` values are reinterpreted under the new semantics as-is (a one-time visual jump on load is accepted, per the design doc).
- `x`/`y` are 1-indexed pixel coordinates on the 1080x1920 canvas (pixel 1 = leftmost/topmost).
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup (per `CLAUDE.md`) — the align-dependent CSS transform goes into `stage.css` as modifier classes, not an inline `style.transform` write.
- `TextPreset.x`/`TextPreset.y` are Pydantic `int` fields — always round before assigning, or the PUT `/api/projects/{id}` save 422s.
- Run `.venv/Scripts/python -m pytest -q` after every backend change; it must stay green throughout.

---

### Task 1: Data model — drop the anchor/offset fields

**Files:**
- Modify: `app/models.py:22-51` (`TextPreset`)
- Modify: `tests/test_models.py:33-35` (`test_text_preset_position_grid_defaults`)

**Interfaces:**
- Produces: `TextPreset` with no `pos_row`/`pos_col`/`offset_x`/`offset_y` fields; `x: int = 540`, `y: int = 700` remain as the sole position fields (unchanged defaults, redefined meaning documented in code comments only — Pydantic has no runtime effect from the meaning change).

- [ ] **Step 1: Write the failing test**

Replace `test_text_preset_position_grid_defaults` in `tests/test_models.py:33-35`:

```python
def test_text_preset_position_grid_fields_removed():
    p = TextPreset.model_validate({"name": "Pop", "pos_row": "top", "pos_col": "left",
                                    "offset_x": 10, "offset_y": -5})
    assert not hasattr(p, "pos_row")
    assert not hasattr(p, "pos_col")
    assert not hasattr(p, "offset_x")
    assert not hasattr(p, "offset_y")
    assert (p.x, p.y) == (540, 700)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py::test_text_preset_position_grid_fields_removed -v`
Expected: PASS already (Pydantic's default `extra="ignore"` behavior means the old fields are silently dropped even before this change — this step just confirms the test itself is well-formed; the real signal is Step 4's full-suite run showing nothing broke). If it fails, re-check the assertions above for typos before proceeding.

- [ ] **Step 3: Remove the fields from `TextPreset`**

In `app/models.py`, delete these four lines from the `TextPreset` class (currently lines 47-50):

```python
    pos_row: str = "mid"           # top|mid|btm — UI position-grid anchor row, x/y derives from this + offset
    pos_col: str = "mid"           # left|mid|right
    offset_x: int = 0
    offset_y: int = 0
```

Update the comment on the `x`/`y` fields (currently `app/models.py:44-45`):

```python
    x: int = 540                   # horizontal px: left/center/right edge of the box, per `align`
    y: int = 700                   # vertical px: always the top edge of the box
```

- [ ] **Step 4: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All tests pass (the new test from Step 1 included).

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "$(cat <<'EOF'
refactor: drop TextPreset's anchor-grid/offset position fields

x/y become the sole position source of truth (see
docs/superpowers/specs/2026-07-19-absolute-pixel-coordinates-design.md);
pos_row/pos_col/offset_x/offset_y are removed, not migrated.
EOF
)"
```

---

### Task 2: ASS export — align-driven anchor codes

**Files:**
- Modify: `app/ass_render.py` (`_style`, `_box_dialogue`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.align` (`"left"|"center"|"right"`, from Task 1's unchanged field), `TextPreset.x`/`TextPreset.y` (Task 1).
- Produces: `_style(name, p)` now emits ASS Alignment column `7`/`8`/`9` instead of hardcoded `5`. `_box_dialogue(b, p)`'s `left` computation is now align-aware. No signature changes to either function.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py`:

```python
def test_style_alignment_reflects_text_align():
    left = TextPreset(name="L", align="left")
    center = TextPreset(name="C", align="center")
    right = TextPreset(name="R", align="right")
    for pr, expected in [(left, "7"), (center, "8"), (right, "9")]:
        p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
        out = render_ass(p, {pr.id: pr})
        line = next(l for l in out.splitlines() if l.startswith("Style:"))
        assert line.split(",")[18] == expected, f"align={pr.align} expected alignment {expected}"

def test_box_dialogue_left_edge_for_align_left():
    pr = TextPreset(name="L", align="left", x=100, y=200, box_background=True,
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\pos(100,200)" in line

def test_box_dialogue_left_edge_for_align_right():
    pr = TextPreset(name="R", align="right", x=900, y=200, box_background=True,
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\pos(600,200)" in line   # left = x - width = 900 - 300

def test_box_dialogue_left_edge_for_align_center_unchanged():
    pr = TextPreset(name="C", align="center", x=540, y=200, box_background=True,
                     box_width_mode="fixed", box_width=300, box_height_mode="fixed", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)
    line = _box_dialogue(b, pr)
    assert "\\pos(390,200)" in line   # left = x - width/2 = 540 - 150
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "align" -v`
Expected: `test_style_alignment_reflects_text_align` FAILs (Alignment column is always `5`); `test_box_dialogue_left_edge_for_align_left`/`_right` FAIL (left is always computed as center-based); `test_box_dialogue_left_edge_for_align_center_unchanged` PASSes already (center math is unchanged).

- [ ] **Step 3: Update `_style()`**

Replace `app/ass_render.py:43-49`:

```python
def _style(name: str, p: TextPreset) -> str:
    bold = -1 if p.bold else 0
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    alignment = {"left": 7, "right": 9}.get(p.align, 8)   # ASS numpad: 7/8/9 = top-left/top-center/top-right;
    return (f"Style: {name},{p.font},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"          # also drives multi-line text justification, matching `align`
            f"{hex_to_ass(p.outline_color)},{hex_to_ass('#000000')},"
            f"{bold},{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,{alignment},0,0,0,1")
```

- [ ] **Step 4: Update `_box_dialogue()`'s left computation**

Replace `app/ass_render.py:64-69`:

```python
def _box_dialogue(b, p: TextPreset) -> str | None:
    if not p.box_background and p.box_border_width <= 0:
        return None
    _, width, height = _wrapped_lines_and_size(b, p)
    if p.align == "left":
        left = p.x
    elif p.align == "right":
        left = p.x - width
    else:
        left = p.x - width / 2
    top = p.y
```

(The rest of the function — `path`, `fill_color`, `fx`, return — is unchanged; `left`/`top` are already the variable names it uses.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All tests pass, including the four new ones. Watch specifically for the pre-existing tests that assert center-anchored positions with default `align="center"` (`test_text_block_dialogue`, `test_box_dialogue_pos_is_anchored_top_left`) — they must still pass unchanged, since center math is untouched.

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "$(cat <<'EOF'
feat: align-driven ASS anchor codes for text position export

Style's Alignment column now picks \an7/\an8/\an9 from TextPreset.align
instead of a hardcoded center anchor (5) — also fixes multi-line text
justification, which previously ignored `align` entirely in export.
_box_dialogue()'s left-edge math is now align-aware to match.
EOF
)"
```

---

### Task 3: Preview rendering — align-driven CSS transform

**Files:**
- Modify: `static/css/components/stage.css:31-37` (`.text-block`)
- Modify: `static/preview.js:154-157` (`renderText`)

**Interfaces:**
- Consumes: `preset.align` (`"left"|"center"|"right"`), `preset.x`/`preset.y` (unchanged field names, new meaning per Task 1/2).
- Produces: `.text-block--align-left`/`--align-center`/`--align-right` CSS classes in `stage.css`; `renderText()` sets `div.className` to include the matching modifier instead of relying on the old blanket `transform: translate(-50%, -50%)`.

- [ ] **Step 1: Update `stage.css`**

Replace `static/css/components/stage.css:31-37`:

```css
.text-block {
  position: absolute;
  font-family: Arial, Helvetica, sans-serif;
  line-height: 1.15;
  white-space: pre;
}

.text-block--align-left { transform: translate(0, 0); }
.text-block--align-center { transform: translate(-50%, 0); }
.text-block--align-right { transform: translate(-100%, 0); }
```

- [ ] **Step 2: Update `preview.js`'s `renderText()`**

In `static/preview.js`, replace line 155 (`div.className = "text-block";`) with:

```js
      div.className = `text-block text-block--align-${preset.align}`;
```

- [ ] **Step 3: Start the dev server and verify visually**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload` (background), then open `http://127.0.0.1:8000` in a browser.

- Open the TEXT panel, type a heading, and cycle TEXT ALIGN through LEFT/CENTER/RIGHT while watching the stage.
- Confirm: at `align="center"` (the default), the box visually sits exactly where it did before this change (center-anchored on `x`) — this is the regression check, since center math didn't change on the Python side and shouldn't change visually either.
- Confirm: at `align="left"`, the box's left edge tracks `x` (increasing HORIZONTAL moves the box's left edge right, box grows rightward from a fixed left edge as you type more text). At `align="right"`, the box's right edge tracks `x`.
- Confirm no console errors (`read_console_messages` or the browser devtools console).

- [ ] **Step 4: Run the backend test suite (unaffected, but confirm nothing broke)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All tests pass (this task touches no Python files).

- [ ] **Step 5: Commit**

```bash
git add static/css/components/stage.css static/preview.js
git commit -m "$(cat <<'EOF'
feat: align-driven text-block anchor transform in preview

Replaces the blanket -50%/-50% transform with three CSS modifier
classes (text-block--align-left/center/right) so the live preview's
anchor point matches ass_render.py's new align-aware \pos semantics.
EOF
)"
```

---

### Task 4: Editor UI — direct x/y editing, stateless grid shortcut

**Files:**
- Modify: `static/editor.js` (`defaultTextPreset`, `computeXY`, `nearestAnchorKey`, `rebaseAnchorFromXY`, `handleBoxMove`, `handleBoxMoveEnd`)
- Modify: `static/text-panel-position.js` (`TextPanel.renderPosition`)
- Modify: `static/text-panel-style.js` (`styleFieldsOf`)
- Modify: `CLAUDE.md:98` (doc comment for `editor.js`'s position-related functions)

**Interfaces:**
- Consumes: `POSITION_ANCHORS_X`/`POSITION_ANCHORS_Y` (existing constants in `static/editor.js:20-21`, unchanged values, now applied directly instead of composed with an offset).
- Produces: `handleBoxMove(preset, {dx, dy})`/`handleBoxMoveEnd(preset, {dx, dy})` write straight to `preset.x`/`preset.y` (same call signature as before — `preview.js`'s callback wiring in `renderTextPanel()` is unaffected). `TextPanel.renderPosition()` still populates `#text-offset-x-field`/`#text-offset-y-field`/`#position-row-group`/`#position-col-group` (same DOM ids), now editing `x`/`y` directly with no derived-offset step.

- [ ] **Step 1: Update `defaultTextPreset()` in `static/editor.js`**

Replace `static/editor.js:23-34`:

```js
function defaultTextPreset(id) {
  return {
    id,
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, bold: false, italic: false, underline: false,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000", box_background_opacity: 100,
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: 700, entrance: "fade_pop",
  };
}
```

- [ ] **Step 2: Remove `computeXY()` from `static/editor.js`**

Delete `static/editor.js:36-39`:

```js
function computeXY(preset) {
  preset.x = POSITION_ANCHORS_X[preset.pos_col] + preset.offset_x;
  preset.y = POSITION_ANCHORS_Y[preset.pos_row] + preset.offset_y;
}
```

- [ ] **Step 3: Remove `nearestAnchorKey()` and `rebaseAnchorFromXY()` from `static/editor.js`**

Delete `static/editor.js:163-176`:

```js
function nearestAnchorKey(value, anchors) {
  return Object.keys(anchors).reduce((best, key) =>
    Math.abs(value - anchors[key]) < Math.abs(value - anchors[best]) ? key : best);
}

// Recomputes pos_row/pos_col from the preset's current x/y (after a free-pixel drag), then
// rebases offset_x/offset_y to the remaining distance from that anchor cell — keeps the
// anchor-grid model meaningful after a drag that isn't itself snapped.
function rebaseAnchorFromXY(preset) {
  preset.pos_row = nearestAnchorKey(preset.y, POSITION_ANCHORS_Y);
  preset.pos_col = nearestAnchorKey(preset.x, POSITION_ANCHORS_X);
  preset.offset_x = preset.x - POSITION_ANCHORS_X[preset.pos_col];
  preset.offset_y = preset.y - POSITION_ANCHORS_Y[preset.pos_row];
}
```

- [ ] **Step 4: Rewrite `handleBoxMove()` and `handleBoxMoveEnd()` in `static/editor.js`**

Replace `static/editor.js:178-196`:

```js
function handleBoxMove(preset, { dx, dy }) {
  const scale = stageScale();
  const previewPreset = { ...preset, x: preset.x + dx * scale, y: preset.y + dy * scale };
  const previewPresets = { ...project.text_presets, [preset.id]: previewPreset };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
}

async function handleBoxMoveEnd(preset, { dx, dy }) {
  const scale = stageScale();
  // TextPreset.x/y are int fields (app/models.py) — round before persisting,
  // else the PUT /api/projects/{id} save fails Pydantic validation (422) and the drag is lost.
  preset.x += Math.round(dx * scale);
  preset.y += Math.round(dy * scale);
  await saveProject();
  renderTextPanel();
}
```

- [ ] **Step 5: Rewrite `TextPanel.renderPosition()` in `static/text-panel-position.js`**

Replace the whole file body (keep the header comment, update it):

```js
// TEXT panel POSITION accordion: absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) +
// a stateless 3x3 anchor-grid shortcut. Exposes window.TextPanel.renderPosition(). Reaches into
// editor.js's globals (ensureTextBlock, ensureTextPreset, saveProject, renderTextPreview,
// renderTextPanel, POSITION_ANCHORS_X, POSITION_ANCHORS_Y).
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderPosition = function renderPosition() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "HORIZONTAL", unit: "PX", value: preset.x, step: 1, min: 1, max: 1080,
      onChange: (v) => { preset.x = Math.round(v); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "VERTICAL", unit: "PX", value: preset.y, step: 1, min: 1, max: 1920,
      onChange: (v) => { preset.y = Math.round(v); saveProject(); renderTextPreview(); } });

  // Stateless shortcut — no persisted anchor selection, so no button stays "active"; clicking
  // a cell just writes a computed absolute pixel value straight into x/y and re-renders the
  // panel so the HORIZONTAL/VERTICAL fields above reflect the new value.
  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP" }, { value: "mid", label: "MID" }, { value: "btm", label: "BTM" }],
    null, (value) => { preset.y = POSITION_ANCHORS_Y[value]; saveProject(); renderTextPanel(); });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT" }, { value: "mid", label: "MID" }, { value: "right", label: "RIGHT" }],
    null, (value) => { preset.x = POSITION_ANCHORS_X[value]; saveProject(); renderTextPanel(); });
};
```

- [ ] **Step 6: Update `styleFieldsOf()` in `static/text-panel-style.js`**

Replace `static/text-panel-style.js:10-22`:

```js
  // Fields copied when saving/applying a saved style — everything TextPreset holds except
  // identity (id/name) and usage stats. Position (x/y) is included, matching the pre-existing
  // behavior of saved styles carrying a position.
  function styleFieldsOf(preset) {
    const { font, size_px, color, outline_color, outline_px, bold, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      x, y } = preset;
    return { font, size_px, color, outline_color, outline_px, bold, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      x, y };
  }
```

- [ ] **Step 7: Update `CLAUDE.md`'s description of `editor.js`'s position handling**

In `CLAUDE.md:98`, find this sentence inside the `static/editor.js` inventory entry:

> `handleBoxMove()`/`handleBoxMoveEnd()`/`nearestAnchorKey()`/`rebaseAnchorFromXY()` (stage drag-to-move callbacks, added 2026-07-18: free-pixel-drag preview via `handleBoxMove`, then on release `handleBoxMoveEnd` rebases `offset_x`/`offset_y` to the nearest anchor cell via `rebaseAnchorFromXY` — rounds `dx`/`dy` before adding to the preset's int-typed `offset_x`/`offset_y`, since `TextPreset`'s position fields are Pydantic `int`s and an unrounded float 422s on save).

Replace it with:

> `handleBoxMove()`/`handleBoxMoveEnd()` (stage drag-to-move callbacks, added 2026-07-18, rewritten 2026-07-19 for absolute-pixel position: free-pixel-drag preview via `handleBoxMove`, then on release `handleBoxMoveEnd` rounds `dx`/`dy` and adds them straight onto the preset's int-typed `x`/`y`, since `TextPreset`'s position fields are Pydantic `int`s and an unrounded float 422s on save).

And find this sentence later in the same entry:

> Position is a `posRow`/`posCol` anchor grid (thirds of the 1080x1920 canvas, `POSITION_ANCHORS_X/Y`) plus an `offsetX`/`offsetY` pixel nudge; `computeXY()` derives `TextPreset.x/y` from those — the anchor/offset split is UI-only, not part of the persisted model.

Replace it with:

> Position is `TextPreset.x`/`y` directly — absolute pixel coordinates (align-aware horizontal edge, always-top vertical edge, see [2026-07-19-absolute-pixel-coordinates-design.md](docs/superpowers/specs/2026-07-19-absolute-pixel-coordinates-design.md)); the POSITION accordion's 3x3 grid (`POSITION_ANCHORS_X/Y`) is a stateless one-shot shortcut that writes computed values straight into `x`/`y`, not a persisted anchor selection.

- [ ] **Step 8: Start the dev server and verify visually end-to-end**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload` (background), open `http://127.0.0.1:8000`.

- Open TEXT panel > POSITION. Confirm HORIZONTAL/VERTICAL fields show the current `x`/`y` values (540/700 for a fresh block).
- Type a new HORIZONTAL value; confirm the box moves and the value persists across a page reload.
- Click each of the 9 grid buttons (TOP/MID/BTM x LEFT/MID/RIGHT); confirm each click moves the box to the expected canvas position and updates the HORIZONTAL/VERTICAL fields to match.
- Drag the box directly on the stage; confirm it moves smoothly, and after releasing, the HORIZONTAL/VERTICAL fields reflect the new absolute position.
- Repeat the grid-click and drag checks at `align="left"` and `align="right"` (TEXT ALIGN in FONT or STYLE accordion) — confirm the box's edge (not center) tracks the clicked/dragged position, matching Task 3's preview verification.
- Save a style via STYLE > "+ Save current style", apply it to a different block, confirm the saved position (`x`/`y`) is applied along with font/box/align.
- Confirm no console errors.

- [ ] **Step 9: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All tests pass (this task touches no Python files, but confirms nothing else broke).

- [ ] **Step 10: Commit**

```bash
git add static/editor.js static/text-panel-position.js static/text-panel-style.js CLAUDE.md
git commit -m "$(cat <<'EOF'
feat: edit TextPreset.x/y directly in the POSITION accordion

Drops the anchor-grid+offset derivation (computeXY/rebaseAnchorFromXY/
nearestAnchorKey) now that x/y are the model's sole position fields
(see Task 1). HORIZONTAL/VERTICAL fields edit x/y directly; the 3x3
grid becomes a stateless one-shot shortcut with no persisted selection.
EOF
)"
```

---

### Task 5: Finish the branch

- [ ] Run `superpowers:finishing-a-development-branch` to decide how to integrate this work (merge to main, open a PR, or discard), following its structured menu of options.
