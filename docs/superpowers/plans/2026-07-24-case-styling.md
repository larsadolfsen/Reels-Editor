# Case Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-way case-style control (lowercase / UPPERCASE / As-typed default) on the TEXT and CAPTIONS Design tabs, applied in stage preview and ASS export without mutating stored text.

**Architecture:** One new `TextPreset.text_case` field (`"none"` default). Python transforms actual strings at the ASS boundary (`app/text_case.py` helper + `model_copy` substitutions in `app/ass_render.py`). Frontend displays via CSS `text-transform` (DOM text stays as-typed so contentEditable editing can't corrupt stored text) and transforms only measurement inputs (`static/text-case.js` helper). Spec: `docs/superpowers/specs/2026-07-24-case-styling-design.md`.

**Tech Stack:** FastAPI/Pydantic backend, framework-free classic-script frontend, pytest.

## Global Constraints

- Test command: `.venv/Scripts/python -m pytest -q` (subagents scope to the files they touch, e.g. `-q tests/test_ass_render.py`).
- Field values: `text_case` is exactly `"none" | "upper" | "lower"`, default `"none"`. JS treats missing/undefined as `"none"`.
- Every new `static/*.js` file opens with a 1–2 line purpose comment; no inline `style="..."` in markup (JS `el.style.X =` assignments are fine — existing convention).
- Icon SVGs hand-inlined with wrapper `<svg ... viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` (Lucide).
- Stored text (`block.heading`, `CaptionWord.text`) is never mutated by this feature.
- Commit after every task; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Python helper + model field

**Files:**
- Create: `app/text_case.py`
- Modify: `app/models.py` (TextPreset, after the `underline` field at ~line 66)
- Test: `tests/test_text_case.py` (create)

**Interfaces:**
- Produces: `app.text_case.apply_text_case(text: str, text_case: str) -> str`; `TextPreset.text_case: str = "none"`. Task 2 imports both.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_text_case.py`:

```python
# Tests for app.text_case: the pure "none"/"upper"/"lower" text transform.
from app.text_case import apply_text_case
from app.models import TextPreset

def test_none_passes_through():
    assert apply_text_case("MiXeD Case", "none") == "MiXeD Case"

def test_upper():
    assert apply_text_case("Hej med øh dig", "upper") == "HEJ MED ØH DIG"

def test_lower():
    assert apply_text_case("BIG News Æble", "lower") == "big news æble"

def test_unknown_value_passes_through():
    assert apply_text_case("AbC", "sponge") == "AbC"

def test_preset_defaults_to_none():
    assert TextPreset(name="x").text_case == "none"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest -q tests/test_text_case.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.text_case'`

- [ ] **Step 3: Implement**

Create `app/text_case.py`:

```python
# Pure text-case transform shared by ASS rendering (text blocks + captions):
# apply_text_case maps "upper"/"lower" to str.upper()/str.lower(), anything else passes through.
def apply_text_case(text: str, text_case: str) -> str:
    if text_case == "upper":
        return text.upper()
    if text_case == "lower":
        return text.lower()
    return text
```

In `app/models.py`, directly after `underline: bool = False` in `TextPreset`, add:

```python
    text_case: str = "none"        # "none" | "upper" | "lower" — display/export transform, stored text stays as typed
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest -q tests/test_text_case.py`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add app/text_case.py app/models.py tests/test_text_case.py
git commit -m "feat: add text_case preset field + apply_text_case helper"
```

---

### Task 2: ASS export applies text_case (blocks + captions)

**Files:**
- Modify: `app/ass_render.py` (imports ~line 5; `render_ass` block loop ~line 246; `render_caption_ass` words line ~line 303)
- Test: `tests/test_ass_render.py` (append)

**Interfaces:**
- Consumes: `apply_text_case` from Task 1.
- Produces: nothing new — behavior change only.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_ass_render.py` (its imports already include `Project`, `TextBlockLayer`, `TextPreset`, `CaptionTrack`, `CaptionWord`, `render_ass`; add `render_caption_ass` to the `from app.ass_render import ...` line; the `w(t, a, b)` CaptionWord helper exists at top of file):

```python
def test_block_text_case_upper_transforms_dialogue_not_model():
    pr = TextPreset(name="Pop", text_case="upper")
    b = TextBlockLayer(heading="Big news", preset_id=pr.id, start=0, end=2)
    p = Project(name="r", text_blocks=[b])
    out = render_ass(p, {pr.id: pr})
    assert "BIG NEWS" in out and "Big news" not in out
    assert b.heading == "Big news"   # stored text untouched

def test_block_text_case_lower():
    pr = TextPreset(name="Pop", text_case="lower")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="BIG News", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    assert "big news" in out and "BIG News" not in out

def test_block_text_case_none_is_byte_identical_to_default():
    pr = TextPreset(name="Pop")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="MiXeD", preset_id=pr.id, start=0, end=2)])
    assert render_ass(p, {pr.id: pr}) == render_ass(p, {pr.id: TextPreset(**{**pr.model_dump(), "text_case": "none"})})

def test_caption_text_case_upper_transforms_dialogues_not_words():
    pr = TextPreset(name="Cap", text_case="upper", box_width_mode="fixed", box_height_mode="fixed",
                    box_width=900, box_height=350)
    words = [w("Hello", 0.0, 0.5), w("there", 0.5, 1.0)]
    p = Project(name="r", captions=CaptionTrack(words=words, preset_id=pr.id))
    out = render_caption_ass(p, pr)
    assert "HELLO" in out and "THERE" in out
    assert "Hello" not in out
    assert words[0].text == "Hello"   # stored words untouched
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest -q tests/test_ass_render.py`
Expected: the four new tests FAIL (transform not applied); all pre-existing tests still pass.

- [ ] **Step 3: Implement**

In `app/ass_render.py`:

1. Add import after the existing `from app.caption_layout import paginate_words`:

```python
from app.text_case import apply_text_case
```

2. In `render_ass`'s event loop, transform the block before any measurement/dialogue call. Change:

```python
    for b in blocks:
        p = presets[b.preset_id]
        weight = _resolved_weight(p)
```

to:

```python
    for b in blocks:
        p = presets[b.preset_id]
        if p.text_case != "none":
            # Substitute a transformed copy so measurement, wrapping, run tagging, and highlight
            # dialogues all see the same string; the caller's model stays as typed.
            b = b.model_copy(update={"heading": apply_text_case(b.heading, p.text_case)})
        weight = _resolved_weight(p)
```

3. In `render_caption_ass`, change:

```python
    words = project.captions.words if project.captions else []
```

to:

```python
    words = project.captions.words if project.captions else []
    if preset.text_case != "none":
        words = [w.model_copy(update={"text": apply_text_case(w.text, preset.text_case)}) for w in words]
```

4. Update the file's 2-line header comment to mention the case transform (e.g. append "; both apply TextPreset.text_case via app.text_case before measuring/emitting").

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest -q tests/test_ass_render.py tests/test_text_case.py`
Expected: all pass, zero failures.

- [ ] **Step 5: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: apply text_case in ASS export for text blocks and captions"
```

---

### Task 3: JS helper + preview integration

**Files:**
- Create: `static/text-case.js`
- Modify: `static/preview-text.js` (fitCacheKey ~line 29, maybeRefitFillText ~line 43, renderText div styling ~line 97)
- Modify: `static/preview-captions.js` (paginationKey ~line 20, getPaginatedPages ~line 30, renderCaptions div styling ~line 73)
- Modify: `static/index.html` (script tags ~line 797)

**Interfaces:**
- Consumes: `TextPreset.text_case` values from Task 1.
- Produces: `window.TextCase.apply(text, textCase) -> string` and `window.TextCase.cssValue(textCase) -> "uppercase" | "lowercase" | "none"`. Task 4/5 rely on the field only, not on TextCase.

- [ ] **Step 1: Create the helper**

Create `static/text-case.js`:

```js
// Pure text-case helpers for TextPreset.text_case ("none" | "upper" | "lower"): apply() transforms
// a string for measurement paths; cssValue() maps to a CSS text-transform value for display paths.
// Missing/unknown values behave as "none". Consumed by preview-text.js and preview-captions.js.
window.TextCase = {
  apply(text, textCase) {
    if (textCase === "upper") return text.toUpperCase();
    if (textCase === "lower") return text.toLowerCase();
    return text;
  },
  cssValue(textCase) {
    if (textCase === "upper") return "uppercase";
    if (textCase === "lower") return "lowercase";
    return "none";
  },
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, insert immediately before the `<script src="/static/caption-panel-style.js"></script>` line:

```html
<script src="/static/text-case.js"></script>
```

- [ ] **Step 3: Wire preview-text.js**

Three edits:

1. `fitCacheKey` — add `preset.text_case` to the key array:

```js
  function fitCacheKey(preset, heading) {
    return JSON.stringify([heading, preset.box_width, preset.box_height, preset.font, preset.weight, preset.italic, preset.text_case]);
  }
```

2. `maybeRefitFillText` — measure the transformed string (matches the glyphs CSS will draw):

```js
    const { size } = FontFit.fitFontSize(TextCase.apply(block.heading || "", preset.text_case), measurerFactory, preset.box_width, preset.box_height);
```

3. In `renderText`, next to the existing `div.style.textAlign = preset.align;` line, add:

```js
      div.style.textTransform = TextCase.cssValue(preset.text_case);
```

(Display-only: the DOM keeps the as-typed string so contentEditable editing, selection offsets, and FormatRun offsets are untouched.)

- [ ] **Step 4: Wire preview-captions.js**

Three edits:

1. `paginationKey` — add `preset.text_case` to the key array (after `preset.italic`):

```js
      preset.box_width, preset.box_height, preset.size_px, preset.font, preset.weight, preset.italic, preset.text_case,
```

2. `getPaginatedPages` — wrap the measurer so pagination measures what CSS will display:

```js
    const rawMeasure = FontFit.canvasMeasurer(preset.font, preset.size_px, { weight: preset.weight, italic: preset.italic });
    const measure = (s) => rawMeasure(TextCase.apply(s, preset.text_case));
```

(`measure` is then passed to `CaptionLayout.paginateWords` exactly where the old single-variable measurer was.)

3. In `renderCaptions`, next to the existing `div.style.textAlign = preset.align;` line, add:

```js
    div.style.textTransform = TextCase.cssValue(preset.text_case);
```

- [ ] **Step 5: Update both files' header comments**

Add a line noting case handling, e.g. preview-text.js: "Case styling (preset.text_case): displayed via CSS text-transform, measured via TextCase.apply so BOX FILL sizing matches." — similar for preview-captions.js's pagination measurer.

- [ ] **Step 6: Sanity-run the Python suite (nothing should change)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass (JS-only task; this catches accidental backend edits).

- [ ] **Step 7: Commit**

```bash
git add static/text-case.js static/preview-text.js static/preview-captions.js static/index.html
git commit -m "feat: render text_case in stage preview (CSS display + transformed measurement)"
```

---

### Task 4: TEXT panel case control

**Files:**
- Create: `static/text-panel-case.js`
- Modify: `static/index.html` (Design tab markup after the italic/underline `.style-group` ending ~line 616; script tag after `text-panel-align.js` ~line 822)
- Modify: `static/panel-text.js` (`renderTextPanel`'s Design-tab render calls ~line 170; `defaultTextPreset` ~line 42)
- Modify: `static/text-panel-style.js` (`styleFieldsOf` ~lines 19–27)

**Interfaces:**
- Consumes: `preset.text_case` (Task 1), preview re-render via existing global `renderTextPreview()`.
- Produces: `window.TextPanel.renderCase()` — called by `panel-text.js`.

- [ ] **Step 1: Add the container to index.html**

Immediately after the `.style-group` that closes the `#text-italic`/`#text-underline` row (the `</div>` at ~line 616), add:

```html
          <div class="style-group">
            <div id="text-case-group"></div>
          </div>
```

- [ ] **Step 2: Create text-panel-case.js**

```js
// TEXT panel Design tab: case-style button group (lowercase / UPPERCASE / As-typed) writing
// preset.text_case. Exposes window.TextPanel.renderCase(). Same pattern as text-panel-align.js.
window.TextPanel = window.TextPanel || {};

(() => {
  const CASE_OPTIONS = [
    {
      value: "lower", label: "LOWERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3" /><path d="M10 9v6" /><circle cx="17" cy="12" r="3" /><path d="M14 7v8" /></svg>',
    },
    {
      value: "upper", label: "UPPERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><path d="M15 11h4.5a2 2 0 0 1 0 4H15V7h4a2 2 0 0 1 0 4" /></svg>',
    },
    {
      value: "none", label: "AS TYPED", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><circle cx="18" cy="12" r="3" /><path d="M21 9v6" /></svg>',
    },
  ];
  window.TextPanel.renderCase = function renderCase() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    UI.buttonGroup(document.getElementById("text-case-group"), CASE_OPTIONS,
      preset.text_case || "none",
      (value) => { preset.text_case = value; saveProject(); renderTextPreview(); });
  };
})();
```

(The three icons are Lucide `case-lower`, `case-upper`, `case-sensitive`.)

- [ ] **Step 3: Add the script tag**

In `static/index.html`, immediately after `<script src="/static/text-panel-align.js"></script>`:

```html
<script src="/static/text-panel-case.js"></script>
```

- [ ] **Step 4: Wire the orchestrator + defaults + saved styles**

1. `static/panel-text.js` — in `renderTextPanel`, after the `TextPanel.renderShadow();` line, add:

```js
  TextPanel.renderCase();
```

2. `static/panel-text.js` — in `defaultTextPreset`, after the line containing `outline_color: ... italic: false, underline: false,`, add to the object:

```js
    text_case: "none",
```

3. `static/text-panel-style.js` — in `styleFieldsOf`, add `text_case` to BOTH the destructuring list and the returned object (alongside `italic, underline`):

```js
    const { font, size_px, color, outline_color, outline_px, weight, italic, underline, text_case,
```
```js
    return { font, size_px, color, outline_color, outline_px, weight, italic, underline, text_case,
```

- [ ] **Step 5: Sanity-run the Python suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add static/text-panel-case.js static/index.html static/panel-text.js static/text-panel-style.js
git commit -m "feat: TEXT panel case-style button group"
```

---

### Task 5: CAPTIONS panel case control

**Files:**
- Create: `static/caption-panel-case.js`
- Modify: `static/index.html` (Design tab markup after the caption italic/underline `.style-group` ending ~line 251; script tag after `caption-panel-highlight.js` ~line 805)
- Modify: `static/panel-captions.js` (`renderCaptionPanel`'s render calls ~line 70; `defaultCaptionPreset` ~line 10)
- Modify: `static/caption-panel-style.js` (`styleFieldsOf` ~lines 16–24)

**Interfaces:**
- Consumes: caption globals `ensureCaptionTrack()`/`ensureCaptionPreset()`/`renderCaptionPreview()` (panel-captions.js). Fully independent of Task 4 — the codebase's convention (see `caption-panel-box.js` vs `text-panel-align.js`) is each panel duplicates its own literal button-group option list rather than sharing a global, so this task defines its own icons inline.
- Produces: `window.CaptionPanel.renderCase()` — called by `panel-captions.js`.

- [ ] **Step 1: Add the container to index.html**

Immediately after the `.style-group` that closes the `#caption-italic`/`#caption-underline` row (the `</div>` at ~line 251), add:

```html
            <div class="style-group">
              <div id="caption-case-group"></div>
            </div>
```

- [ ] **Step 2: Create caption-panel-case.js**

```js
// CAPTIONS panel Design tab: case-style button group (lowercase / UPPERCASE / As-typed) writing
// the caption track preset's text_case. Mirrors text-panel-case.js's UI, targets the caption
// track's preset instead of a text block's.
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderCase = function renderCase() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
  UI.buttonGroup(document.getElementById("caption-case-group"),
    [
      {
        value: "lower", label: "LOWERCASE", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3" /><path d="M10 9v6" /><circle cx="17" cy="12" r="3" /><path d="M14 7v8" /></svg>',
      },
      {
        value: "upper", label: "UPPERCASE", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><path d="M15 11h4.5a2 2 0 0 1 0 4H15V7h4a2 2 0 0 1 0 4" /></svg>',
      },
      {
        value: "none", label: "AS TYPED", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><circle cx="18" cy="12" r="3" /><path d="M21 9v6" /></svg>',
      },
    ],
    preset.text_case || "none",
    (value) => { preset.text_case = value; saveProject(); renderCaptionPreview(); });
};
```

- [ ] **Step 3: Add the script tag**

In `static/index.html`, immediately after `<script src="/static/caption-panel-highlight.js"></script>`:

```html
<script src="/static/caption-panel-case.js"></script>
```

- [ ] **Step 4: Wire the orchestrator + defaults + saved styles**

1. `static/panel-captions.js` — in `renderCaptionPanel`, after the `CaptionPanel.renderShadow();` line, add:

```js
  CaptionPanel.renderCase();
```

2. `static/panel-captions.js` — in `defaultCaptionPreset`, after the line containing `outline_color: ... italic: false, underline: false,`, add to the object:

```js
    text_case: "none",
```

3. `static/caption-panel-style.js` — in `styleFieldsOf`, add `text_case` to BOTH the destructuring list and the returned object (alongside `italic, underline`), exactly as in text-panel-style.js.

- [ ] **Step 5: Sanity-run the Python suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add static/caption-panel-case.js static/index.html static/panel-captions.js static/caption-panel-style.js
git commit -m "feat: CAPTIONS panel case-style button group"
```

---

### Task 6: Codebase map update + live verification

**Files:**
- Modify: `CLAUDE.md` (File structure tree + Text blocks / Captions inventory sections)

This task is run by the orchestrating session (needs the browser preview), not a subagent.

- [ ] **Step 1: Update CLAUDE.md**

Add entries for `app/text_case.py`, `static/text-case.js`, `static/text-panel-case.js`, `static/caption-panel-case.js` to the File structure tree; note `TextPreset.text_case` and the preview/export case handling in the Text blocks and Captions inventory sections (preview-text.js / preview-captions.js / ass_render.py notes).

- [ ] **Step 2: Full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass.

- [ ] **Step 3: Live verification in the browser preview**

Start the dev server, open a throwaway project (never real data — see memory), then:
1. Add a text block with mixed-case text; toggle lowercase → stage shows lowercase; toggle UPPERCASE → uppercase; click into the block on stage → the editable text is still as-typed; toggle As-typed → back to original.
2. Open CAPTIONS with a few words; toggle UPPERCASE → caption words uppercase on stage, word list in the Closed-captions tab still as-typed.
3. Confirm the active case button highlights and persists across a reload (saved project).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: map entries for case styling (text_case)"
```
