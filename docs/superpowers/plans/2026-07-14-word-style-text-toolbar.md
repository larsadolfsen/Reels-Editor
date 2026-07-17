# Word-style TEXT panel toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TEXT panel's single-line heading input and bare SIZE slider with a multiline heading field plus a Word-style formatting toolbar (font family, size with grow/shrink, Bold/Italic/Underline, font color).

**Architecture:** Add `bold`/`italic`/`underline` booleans to `TextPreset` (whole-block formatting, matching the existing one-style-per-block model). Wire a `<textarea>` and new toolbar controls in the TEXT panel, reusing existing `UI.numberField`/`UI.colorSwatch` components and the `.icon-btn` toggle-button pattern already used elsewhere. Extend ASS export and the live preview to honor the new flags and multiline text.

**Tech Stack:** FastAPI + Pydantic (backend), vanilla JS + custom CSS components (frontend), pytest.

## Global Constraints

- Formatting is whole-block only — no per-character rich text (spec: "Formatting is whole-block").
- Font family limited to the two vendored families: `"JetBrains Mono"`, `"Public Sans"` (spec: "Font choices").
- No highlight/highlight-color feature (spec: "Highlight scope" — dropped entirely).
- CAPTIONS panel is untouched — this plan is TEXT panel only (spec: "Scope").
- `heading` stays a plain `str`; multiline is literal `\n` characters, no schema change (spec: "Data model").

---

### Task 1: TextPreset model gains bold/italic/underline

**Files:**
- Modify: `app/models.py:16-29` (`TextPreset` class)
- Test: `tests/test_models.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TextPreset.bold: bool`, `TextPreset.italic: bool`, `TextPreset.underline: bool` (all default `False`), `TextPreset.font` default changed from `"Arial"` to `"Public Sans"`. Later tasks (ASS export, editor.js) read these three booleans and the `font` string.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_text_preset_style_flags_default_false():
    p = TextPreset(name="Pop")
    assert (p.bold, p.italic, p.underline) == (False, False, False)
    assert p.font == "Public Sans"

def test_text_preset_style_flags_round_trip():
    p = TextPreset(name="Pop", bold=True, italic=True, underline=True, font="JetBrains Mono")
    assert TextPreset.model_validate_json(p.model_dump_json()) == p
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k style_flags -v`
Expected: FAIL — `AttributeError` or `TypeError` (no `bold`/`italic`/`underline` fields yet, `font` still defaults to `"Arial"`).

- [ ] **Step 3: Write minimal implementation**

In `app/models.py`, replace the `TextPreset` class:

```python
class TextPreset(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    font: str = "Public Sans"
    size_px: int = 96
    color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_px: int = 4
    bold: bool = False
    italic: bool = False
    underline: bool = False
    box: bool = False
    box_color: str = "#000000"
    align: str = "center"          # left|center|right
    x: int = 540                   # anchor on 1080x1920 canvas
    y: int = 700
    entrance: str = "fade_pop"     # fade_pop|none
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: PASS (all tests in the file, including pre-existing ones — `font` default change doesn't break `test_json_round_trip` since it doesn't assert on `font`).

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add bold/italic/underline to TextPreset, default font to Public Sans"
```

---

### Task 2: ASS export honors bold/italic/underline and multiline headings

**Files:**
- Modify: `app/ass_render.py:14-24` (`_style`, `_block_dialogue`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.bold/italic/underline` (Task 1), `TextBlockLayer.heading` (may contain `\n`).
- Produces: `render_ass()` output where the `[V4+ Styles]` Bold/Italic/Underline columns reflect the preset, and `\n` in headings becomes ASS's `\N` hard line break in `[Events]` dialogue text.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ass_render.py`:

```python
def test_style_line_reflects_bold_italic_underline():
    pr = TextPreset(name="Pop", bold=True, italic=True, underline=True)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    # Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
    #         Bold,Italic,Underline,StrikeOut,...
    assert fields[7:10] == ["-1", "-1", "-1"]

def test_style_line_defaults_no_bold_italic_underline():
    pr = TextPreset(name="Plain")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[7:10] == ["0", "0", "0"]

def test_multiline_heading_becomes_ass_hard_break():
    pr = TextPreset(name="Pop")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="LINE ONE\nLINE TWO", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Dialogue:"))
    assert "LINE ONE\\NLINE TWO" in line
    assert "\n" not in line.split("}}")[-1] if "}}" in line else True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k "bold_italic_underline or hard_break" -v`
Expected: FAIL — bold/italic/underline tests fail because the style line always emits `-1,0,0`; multiline test fails because the literal `\n` stays in the dialogue text (and would actually break ASS's one-line-per-Dialogue-event format).

- [ ] **Step 3: Write minimal implementation**

In `app/ass_render.py`, replace `_style` and `_block_dialogue`:

```python
def _style(name: str, p: TextPreset) -> str:
    border = 3 if p.box else 1
    bold = -1 if p.bold else 0
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    return (f"Style: {name},{p.font},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"
            f"{hex_to_ass(p.outline_color if not p.box else p.box_color)},{hex_to_ass(p.box_color)},"
            f"{bold},{italic},{underline},0,100,100,0,0,{border},{p.outline_px},0,5,0,0,0,1")

def _block_dialogue(b, p: TextPreset) -> str:
    fx = f"\\pos({p.x},{p.y})"
    if p.entrance == "fade_pop":
        fx += "\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)"
    text = b.heading.replace("\n", "\\N")
    return f"Dialogue: 0,{ass_time(b.start)},{ass_time(b.end)},P{p.id[:8]},,0,0,0,,{{{fx}}}{text}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: PASS (all tests, including the three pre-existing ones — `test_text_block_dialogue` still matches since default preset has `bold=False` now but that test doesn't assert on the Bold field).

- [ ] **Step 5: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: bold/italic/underline and multiline headings in ASS export"
```

---

### Task 3: TEXT panel markup — multiline heading + toolbar controls

**Files:**
- Modify: `static/index.html:119-139` (`#panel-text` heading + STYLE section)
- Modify: `static/css/components/style-panel.css` (`#text-heading` rule, add `.style-field select` rule, remove now-unused `.style-field input[type="range"]` rule)
- Modify: `static/css/components/button-group.css` (add `.icon-btn[aria-pressed="true"]` rule)

**Interfaces:**
- Consumes: none (markup/CSS only — this task doesn't wire behavior).
- Produces: DOM elements `#text-heading` (now a `<textarea>`), `#text-font` (`<select>`), `#text-size-field` (empty `<label>` for `UI.numberField`, replaces the old `#text-size` range input), `#text-bold`/`#text-italic`/`#text-underline` (`.icon-btn` buttons with `aria-pressed`). Task 4 wires all of these in `editor.js`.

This task has no automated test (pure markup/CSS) — it's verified visually via the dev server in Task 4's manual step, per the spec's testing section ("Manual: verify in browser").

- [ ] **Step 1: Replace the heading input and STYLE section markup**

In `static/index.html`, replace lines 119–139 (from `<div id="panel-text"` through the closing of the old SIZE `style-group`, i.e. up to but not including the `<div class="style-group">` that holds `#text-color-field`) with:

```html
      <div id="panel-text" class="context-panel" hidden>
        <div class="style-panel-header">TEXT OVERLAY &middot; STYLE</div>

        <div class="style-group">
          <textarea id="text-heading" placeholder="Heading" rows="3"></textarea>
        </div>

        <div class="style-group-label">TIME</div>
        <div class="style-group">
          <div class="style-row">
            <label id="text-start-field"></label>
            <label id="text-end-field"></label>
          </div>
        </div>

        <div class="style-divider"></div>

        <div class="style-group-label">STYLE</div>
        <div class="style-group">
          <div class="style-row">
            <label class="style-field" id="text-font-field">
              FONT
              <select id="text-font">
                <option value="Public Sans">Public Sans</option>
                <option value="JetBrains Mono">JetBrains Mono</option>
              </select>
            </label>
            <label id="text-size-field"></label>
          </div>
        </div>

        <div class="style-group">
          <div class="style-row">
            <button class="icon-btn" id="text-bold" type="button" aria-pressed="false" title="Bold"><b>B</b></button>
            <button class="icon-btn" id="text-italic" type="button" aria-pressed="false" title="Italic"><i>I</i></button>
            <button class="icon-btn" id="text-underline" type="button" aria-pressed="false" title="Underline"><u>U</u></button>
          </div>
        </div>
```

Everything from the original `<div class="style-group">` containing `#text-color-field` (originally line 141) through the end of the file is unchanged.

- [ ] **Step 2: Update `#text-heading` CSS for the textarea, add select styling**

In `static/css/components/style-panel.css`, replace:

```css
#text-heading { width: 100%; height: 32px; font-size: 14px; margin-bottom: var(--space-2); }
```

with:

```css
#text-heading {
  width: 100%;
  height: 64px;
  padding: 8px 10px;
  font-family: var(--font-content);
  font-size: 14px;
  resize: none;
  margin-bottom: var(--space-2);
}

.style-field select {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  font-size: 14px;
  border-radius: 6px;
}
```

Then remove the now-unused range-input rule:

```css
.style-field input[type="range"] { padding: 0; }
```

(This was the only consumer of `input[type="range"]` in the panel; the SIZE control is now a number field.)

- [ ] **Step 3: Add pressed-state styling for `.icon-btn` toggle buttons**

In `static/css/components/button-group.css`, add after the existing `.icon-btn:disabled:hover` rule:

```css
.icon-btn[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--text);
  background: rgba(108, 135, 163, 0.12);
}
```

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/css/components/style-panel.css static/css/components/button-group.css
git commit -m "feat: TEXT panel markup for multiline heading + Word-style toolbar"
```

---

### Task 4: Wire the toolbar in editor.js, apply formatting in preview.js

**Files:**
- Modify: `static/editor.js:20-130` (`defaultTextPreset`, `updateTextStyle`, `renderTextPanel`, event listener wiring)
- Modify: `static/preview.js:57-90` (`renderText`)

**Interfaces:**
- Consumes: `TextPreset.bold/italic/underline/font` (Task 1), DOM elements from Task 3 (`#text-heading` textarea, `#text-font`, `#text-size-field`, `#text-bold`/`#text-italic`/`#text-underline`).
- Produces: live preview reflects font family/size/bold/italic/underline and multiline headings; `saveTextPreset()`/`saveProject()` persist the new fields exactly as existing fields already do (no new persistence mechanism).

- [ ] **Step 1: Update `defaultTextPreset()` with the new fields**

In `static/editor.js`, replace `defaultTextPreset`:

```javascript
function defaultTextPreset() {
  return {
    id: crypto.randomUUID().replaceAll("-", ""),
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, bold: false, italic: false, underline: false,
    box: false, box_color: "#000000",
    align: "center", x: 540, y: 700, entrance: "fade_pop",
    posRow: "mid", posCol: "mid", offsetX: 0, offsetY: 0,
  };
}
```

(`loadTextPreset` already merges `{ ...defaultTextPreset(), ...JSON.parse(raw) }`, so existing `localStorage` presets from before this change automatically pick up `font: "Public Sans"`, `bold/italic/underline: false` — no migration code needed.)

- [ ] **Step 2: Simplify `updateTextStyle` (size moves to a numberField, handled separately)**

Replace:

```javascript
async function updateTextStyle() {
  textPreset.size_px = parseInt(document.getElementById("text-size").value, 10);
  textPreset.box = document.getElementById("text-box").checked;
  saveTextPreset();
  renderTextPreview();
}
```

with:

```javascript
async function updateTextStyle() {
  textPreset.box = document.getElementById("text-box").checked;
  saveTextPreset();
  renderTextPreview();
}
```

- [ ] **Step 3: Add SIZE numberField, FONT select, and B/I/U wiring to `renderTextPanel`**

In `renderTextPanel`, replace:

```javascript
  document.getElementById("text-heading").value = block.heading;
  document.getElementById("text-size").value = textPreset.size_px;
  document.getElementById("text-box").checked = textPreset.box;
```

with:

```javascript
  document.getElementById("text-heading").value = block.heading;
  document.getElementById("text-font").value = textPreset.font;
  document.getElementById("text-box").checked = textPreset.box;
  document.getElementById("text-bold").setAttribute("aria-pressed", String(textPreset.bold));
  document.getElementById("text-italic").setAttribute("aria-pressed", String(textPreset.italic));
  document.getElementById("text-underline").setAttribute("aria-pressed", String(textPreset.underline));

  UI.numberField(document.getElementById("text-size-field"),
    { label: "SIZE", unit: "PX", value: textPreset.size_px, min: 24, max: 200,
      onChange: (v) => { textPreset.size_px = v; saveTextPreset(); renderTextPreview(); } });
```

(Leave the rest of `renderTextPanel` — color swatches, outline/box fields, TEXT ALIGN, POSITION — unchanged.)

- [ ] **Step 4: Replace the event listener wiring block**

Replace:

```javascript
document.getElementById("text-heading").addEventListener("input", updateTextBlock);
["text-size", "text-box"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateTextStyle);
});
```

with:

```javascript
document.getElementById("text-heading").addEventListener("input", updateTextBlock);
document.getElementById("text-box").addEventListener("input", updateTextStyle);

document.getElementById("text-font").addEventListener("change", () => {
  textPreset.font = document.getElementById("text-font").value;
  saveTextPreset();
  renderTextPreview();
});

function wireTextStyleToggle(id, prop) {
  const btn = document.getElementById(id);
  btn.addEventListener("click", () => {
    textPreset[prop] = !textPreset[prop];
    btn.setAttribute("aria-pressed", String(textPreset[prop]));
    saveTextPreset();
    renderTextPreview();
  });
}
wireTextStyleToggle("text-bold", "bold");
wireTextStyleToggle("text-italic", "italic");
wireTextStyleToggle("text-underline", "underline");
```

- [ ] **Step 5: Apply font/weight/style/decoration in the preview overlay**

In `static/preview.js`, in `renderText`, after the line `div.style.textAlign = preset.align;`, add:

```javascript
      div.style.fontFamily = `"${preset.font}", sans-serif`;
      div.style.fontWeight = preset.bold ? "700" : "400";
      div.style.fontStyle = preset.italic ? "italic" : "normal";
      div.style.textDecoration = preset.underline ? "underline" : "none";
```

(No change needed for multiline: `.text-block` already has `white-space: pre` in `static/css/components/stage.css`, which preserves literal `\n` characters as line breaks — confirmed by inspection, the textarea's newlines will render correctly with the existing CSS.)

- [ ] **Step 6: Start the dev server and verify manually**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload` (then open http://127.0.0.1:8000)

In the browser:
1. Click a clip's timeline TEXT block (or the heading area) to open the TEXT panel.
2. Type a two-line heading using Enter — confirm the stage overlay shows two lines.
3. Change FONT between Public Sans / JetBrains Mono — confirm the overlay font changes.
4. Adjust SIZE via the numberField's +/- stepper and by typing — confirm the overlay text resizes.
5. Click Bold, Italic, Underline — confirm each toggles its `aria-pressed` highlight and the overlay text updates (bold weight, italic slant, underline).
6. Reload the page — confirm all the above persists (font/size/bold/italic/underline and the multiline heading survive a reload, since they're saved via `saveTextPreset`/`saveProject`).

- [ ] **Step 7: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, all tests (this confirms Tasks 1–2's backend changes still pass after the frontend wiring, and nothing else broke).

- [ ] **Step 8: Commit**

```bash
git add static/editor.js static/preview.js
git commit -m "feat: wire Word-style TEXT toolbar (font, size, bold/italic/underline)"
```

- [ ] **Step 9: Run `superpowers:finishing-a-development-branch`** to decide merge/PR/cleanup for the branch.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1) ✓, UI layout (Task 3) ✓, rendering — preview (Task 4 step 5) ✓ and export (Task 2) ✓, testing — model/ASS unit tests (Tasks 1–2) ✓ and manual browser check (Task 4 step 6) ✓.
- **Deviation from spec:** the spec's Rendering section says preview needs `white-space: pre-wrap`. Investigation during planning (Task 4 step 5) found `.text-block` already uses `white-space: pre`, which already preserves `\n` as line breaks — no CSS change needed there. Noted inline rather than silently dropped.
- **Type/name consistency:** `TextPreset.bold/italic/underline` (Task 1) match the names read in `app/ass_render.py` (Task 2), `static/editor.js` (Task 4), and `static/preview.js` (Task 4). DOM ids introduced in Task 3 (`text-font`, `text-size-field`, `text-bold`, `text-italic`, `text-underline`) match exactly what Task 4 queries via `document.getElementById`.
