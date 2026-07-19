# Font-Weight Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `TextPreset.bold: bool` with a real weight picker (400 Regular / 500 Medium / 600 SemiBold / 700 Bold), with genuine export fidelity — the burned-in video shows the exact chosen weight, not an approximated bold/not-bold.

**Architecture:** ASS/SSA (what libass burns into exports) has no numeric font-weight concept — only a boolean `Bold` style column, and it selects fonts purely by family-name lookup. So real weight fidelity requires generating a static font file per weight (via `fontTools.varLib.instancer`, since the vendored fonts are variable fonts), each renamed to a distinct family name (e.g. "Public Sans Medium"), and pointing ffmpeg's `ass` filter at them via `fontsdir` so libass finds them by exact name. The live browser preview needs none of this — it already renders variable-font weights natively via CSS `font-weight`.

**Tech Stack:** FastAPI/Pydantic backend, vanilla JS frontend (`window.UI.*`/`window.Api.*`/`window.TextPanel.*`, no build step), `fontTools`/Pillow (already dependencies) for font generation and measurement, ffmpeg/libass for export.

**Spec:** `docs/superpowers/specs/2026-07-19-font-weight-picker-design.md` — read it first for full background, including the real pre-existing bug found during investigation (exports currently silently fall back to Arial) and the empirical validation that `fontsdir` + renamed static instances actually works on this environment.

## Global Constraints

- One function/component per file under `static/ui-*.js`/`static/api-*.js`/`static/text-panel-*.js`, each attached to `window.UI.*`/`window.Api.*`/`window.TextPanel.*` (per `CLAUDE.md`).
- Every `static/*.js` and `app/*.py` file that changes keeps (or gains) a one-or-two-line purpose comment at the top, current with its actual job (per `CLAUDE.md`).
- Icon SVGs, where used, follow the existing wrapper style: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- Only the four standard weights (400/500/600/700) are ever offered — no arbitrary/continuous values (spec Non-goals).
- `app/main.py` stays wiring-only — no feature logic there (per `CLAUDE.md`).
- Frontend JS has no automated test runner in this project — UI tasks are verified manually (start a server on a scratch port, drive it with the browser tool), matching this codebase's existing convention.
- Every task: tests pass (`.venv/Scripts/python -m pytest -q`), commit on the current branch.

---

### Task 1: Generate static per-weight font files

**Files:**
- Create: `scripts/generate_font_weights.py`
- Create (generated output, committed): `static/fonts/PublicSans-Regular.ttf`, `static/fonts/PublicSans-Medium.ttf`, `static/fonts/PublicSans-SemiBold.ttf`, `static/fonts/PublicSans-Bold.ttf`, `static/fonts/JetBrainsMono-Regular.ttf`, `static/fonts/JetBrainsMono-Medium.ttf`, `static/fonts/JetBrainsMono-Bold.ttf`

**Interfaces:**
- Consumes: the vendored `static/fonts/PublicSans-Regular.woff2` and `static/fonts/JetBrainsMono-Regular.woff2` (already in the repo).
- Produces: 7 static `.ttf` files, each with a distinct family name (`"Public Sans Regular"`, `"Public Sans Medium"`, `"Public Sans SemiBold"`, `"Public Sans Bold"`, `"JetBrains Mono Regular"`, `"JetBrains Mono Medium"`, `"JetBrains Mono Bold"` — note **no** `JetBrainsMono-SemiBold.ttf`, since JetBrains Mono's `fvar` table has no SemiBold(600) named instance). Task 2 depends on this exact file list and exact family-name strings.

This is a one-off/dev script, not part of the request-serving app — it's run once now and whenever a new font is vendored. It has no pytest coverage (same as the vendored font files themselves aren't tested); instead this task's "test" is running it for real and inspecting the output.

- [ ] **Step 1: Write the script**

```python
# scripts/generate_font_weights.py
# One-off dev script: bakes static per-weight .ttf files from the vendored variable fonts in
# static/fonts/, for app/font_metrics.py's FONT_WEIGHT_PATHS registry and libass's fontsdir
# lookup at export time. Run: .venv/Scripts/python scripts/generate_font_weights.py
# Re-run whenever a new font is vendored, or app/font_metrics.py's SOURCES-equivalent changes.
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# (source variable font path, output filename prefix, display family name, {weight: label})
# Only the four standard weights (400/500/600/700) are considered, and only if the source
# font's fvar table actually names an instance at that weight (checked at generation time,
# not hand-maintained here) — see the print output for which weights each font produced.
SOURCES = [
    ("static/fonts/PublicSans-Regular.woff2", "PublicSans", "Public Sans"),
    ("static/fonts/JetBrainsMono-Regular.woff2", "JetBrainsMono", "JetBrains Mono"),
]
STANDARD_WEIGHTS = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}


def _named_instance_weights(font: TTFont) -> set[int]:
    if "fvar" not in font:
        return set()
    return {int(inst.coordinates["wght"]) for inst in font["fvar"].instances if "wght" in inst.coordinates}


def _rename_family(font: TTFont, family_name: str, subfamily_name: str) -> None:
    name_table = font["name"]
    for name_id in (1, 4, 16):
        name_table.setName(family_name, name_id, 3, 1, 0x409)
        name_table.setName(family_name, name_id, 1, 0, 0)
    for name_id in (2, 17):
        name_table.setName(subfamily_name, name_id, 3, 1, 0x409)
        name_table.setName(subfamily_name, name_id, 1, 0, 0)
    name_table.setName((family_name + "-" + subfamily_name).replace(" ", ""), 6, 3, 1, 0x409)


def generate() -> None:
    for src_path, prefix, display_name in SOURCES:
        available = _named_instance_weights(TTFont(src_path))
        for weight, label in STANDARD_WEIGHTS.items():
            if weight not in available:
                print(f"skip {display_name} {label} ({weight}) — no named instance in {src_path}")
                continue
            font = TTFont(src_path)
            font.flavor = None
            instance = instantiateVariableFont(font, {"wght": float(weight)})
            family_name = f"{display_name} {label}"
            _rename_family(instance, family_name, "Regular")
            out_path = f"static/fonts/{prefix}-{label}.ttf"
            instance.save(out_path)
            print(f"wrote {out_path} (family={family_name!r})")


if __name__ == "__main__":
    generate()
```

- [ ] **Step 2: Run it**

Run: `.venv/Scripts/python scripts/generate_font_weights.py`

Expected output (7 lines, in this order):
```
wrote static/fonts/PublicSans-Regular.ttf (family='Public Sans Regular')
wrote static/fonts/PublicSans-Medium.ttf (family='Public Sans Medium')
wrote static/fonts/PublicSans-SemiBold.ttf (family='Public Sans SemiBold')
wrote static/fonts/PublicSans-Bold.ttf (family='Public Sans Bold')
wrote static/fonts/JetBrainsMono-Regular.ttf (family='JetBrains Mono Regular')
wrote static/fonts/JetBrainsMono-Medium.ttf (family='JetBrains Mono Medium')
wrote static/fonts/JetBrainsMono-Bold.ttf (family='JetBrains Mono Bold')
```
(No `JetBrainsMono-SemiBold.ttf` line — JetBrains Mono has no 600 named instance, correctly skipped.)

- [ ] **Step 3: Verify each file loads and reports the right family/weight**

Run:
```bash
.venv/Scripts/python -c "
from fontTools.ttLib import TTFont
import glob
for path in sorted(glob.glob('static/fonts/*.ttf')):
    f = TTFont(path)
    family = f['name'].getDebugName(1)
    print(path, '->', family)
"
```
Expected: 7 lines, one per generated file, each printing the exact family name from Step 2's output (e.g. `static/fonts/PublicSans-Medium.ttf -> Public Sans Medium`).

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_font_weights.py static/fonts/PublicSans-Regular.ttf static/fonts/PublicSans-Medium.ttf static/fonts/PublicSans-SemiBold.ttf static/fonts/PublicSans-Bold.ttf static/fonts/JetBrainsMono-Regular.ttf static/fonts/JetBrainsMono-Medium.ttf static/fonts/JetBrainsMono-Bold.ttf
git commit -m "feat: generate static per-weight font files for export fidelity"
```

---

### Task 2: `app/font_metrics.py` — weight registry + weight-aware measurer

**Files:**
- Modify: `app/font_metrics.py`
- Test: `tests/test_font_metrics.py`

**Interfaces:**
- Consumes: the 7 `.ttf` files from Task 1 (exact paths).
- Produces: `FONT_WEIGHT_PATHS: dict[str, dict[int, str]]`, `WEIGHT_LABELS: dict[int, str]`, `available_weights(font_name: str) -> list[int]`, `pil_font_measurer(font_name: str, size_px: int, weight: int = 400) -> Callable[[str], float]` (signature change — `weight` is a new keyword with a default, so the one existing call site in `app/ass_render.py` and the one existing test call keep working unmodified until Task 4 updates them to pass `weight` explicitly). Tasks 4 and 6 depend on `available_weights`/`WEIGHT_LABELS`/`FONT_WEIGHT_PATHS`.

Read the current file first — it's short:

```python
# app/font_metrics.py (current, full file)
from io import BytesIO
from typing import Callable
from fontTools.ttLib import TTFont
from PIL import ImageFont

_FONT_PATHS = {
    "Public Sans": "static/fonts/PublicSans-Regular.woff2",
    "JetBrains Mono": "static/fonts/JetBrainsMono-Regular.woff2",
}

def wrap_text(text: str, measure_width: Callable[[str], float], max_width_px: float) -> str:
    out_lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        line = words[0]
        for word in words[1:]:
            candidate = f"{line} {word}"
            if measure_width(candidate) <= max_width_px:
                line = candidate
            else:
                out_lines.append(line)
                line = word
        out_lines.append(line)
    return "\n".join(out_lines)

def pil_font_measurer(font_name: str, size_px: int) -> Callable[[str], float]:
    ttfont = TTFont(_FONT_PATHS[font_name])
    ttfont.flavor = None
    buf = BytesIO()
    ttfont.save(buf)
    buf.seek(0)
    pil_font = ImageFont.truetype(buf, size_px)

    def measure(text: str) -> float:
        left, _, right, _ = pil_font.getbbox(text)
        return right - left

    return measure
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_font_metrics.py`:

```python
from app.font_metrics import available_weights, WEIGHT_LABELS

def test_available_weights_public_sans_has_all_four_standard_weights():
    assert available_weights("Public Sans") == [400, 500, 600, 700]

def test_available_weights_jetbrains_mono_has_no_semibold():
    # JetBrains Mono's vendored variable font has no 600 (SemiBold) named instance.
    assert available_weights("JetBrains Mono") == [400, 500, 700]

def test_weight_labels_cover_all_four_standard_weights():
    assert WEIGHT_LABELS == {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}

def test_pil_font_measurer_accepts_a_weight_and_still_measures():
    measure = pil_font_measurer("Public Sans", 96, weight=700)
    assert measure("a") > 0

def test_pil_font_measurer_bold_weight_is_wider_than_regular():
    regular = pil_font_measurer("Public Sans", 96, weight=400)
    bold = pil_font_measurer("Public Sans", 96, weight=700)
    assert bold("Weight Test") > regular("Weight Test")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_font_metrics.py -v`
Expected: FAIL — `ImportError: cannot import name 'available_weights'` (and `WEIGHT_LABELS`).

- [ ] **Step 3: Implement**

Replace the full contents of `app/font_metrics.py`:

```python
# Text measurement for ASS export word-wrap: a pure wrap algorithm plus a Pillow adapter that
# measures the static per-weight .ttf files generated by scripts/generate_font_weights.py.
from typing import Callable
from PIL import ImageFont

WEIGHT_LABELS = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}

# font display name -> {weight: path to its generated static .ttf}. Updated together with
# scripts/generate_font_weights.py's SOURCES whenever a font is added or a weight mapping changes.
FONT_WEIGHT_PATHS = {
    "Public Sans": {
        400: "static/fonts/PublicSans-Regular.ttf",
        500: "static/fonts/PublicSans-Medium.ttf",
        600: "static/fonts/PublicSans-SemiBold.ttf",
        700: "static/fonts/PublicSans-Bold.ttf",
    },
    "JetBrains Mono": {
        400: "static/fonts/JetBrainsMono-Regular.ttf",
        500: "static/fonts/JetBrainsMono-Medium.ttf",
        700: "static/fonts/JetBrainsMono-Bold.ttf",
    },
}

def available_weights(font_name: str) -> list[int]:
    return sorted(FONT_WEIGHT_PATHS[font_name].keys())

def wrap_text(text: str, measure_width: Callable[[str], float], max_width_px: float) -> str:
    out_lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        line = words[0]
        for word in words[1:]:
            candidate = f"{line} {word}"
            if measure_width(candidate) <= max_width_px:
                line = candidate
            else:
                out_lines.append(line)
                line = word
        out_lines.append(line)
    return "\n".join(out_lines)

def pil_font_measurer(font_name: str, size_px: int, weight: int = 400) -> Callable[[str], float]:
    path = FONT_WEIGHT_PATHS[font_name][weight]
    pil_font = ImageFont.truetype(path, size_px)

    def measure(text: str) -> float:
        left, _, right, _ = pil_font.getbbox(text)
        return right - left

    return measure
```

Note this also simplifies `pil_font_measurer`: it no longer needs the `TTFont`/`BytesIO` decompress-to-sfnt workaround, since the generated files are already plain `.ttf` that Pillow loads directly. The `io`/`fontTools.ttLib` imports are dropped as a result.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_font_metrics.py -v`
Expected: PASS (10 tests — the 5 new ones plus the 5 pre-existing ones, which still pass since `pil_font_measurer("Public Sans", 96)` still works with the new default `weight=400`).

- [ ] **Step 5: Commit**

```bash
git add app/font_metrics.py tests/test_font_metrics.py
git commit -m "feat: add weight-availability registry to font_metrics, weight-aware measurer"
```

---

### Task 3: `app/models.py` — `TextPreset.weight` replaces `bold`

**Files:**
- Modify: `app/models.py`
- Test: `tests/test_models.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TextPreset.weight: int` (400 default). Tasks 4, 7, 8, 9 depend on this field existing and on old saved data with `bold` migrating correctly.

Current `TextPreset` (relevant excerpt, `app/models.py`):
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
    ...
    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_box_fields(cls, data):
        if isinstance(data, dict) and "box" in data and "box_background" not in data:
            data = dict(data)
            data["box_background"] = data.pop("box")
            if "box_color" in data:
                data["box_background_color"] = data.pop("box_color")
        return data
```

- [ ] **Step 1: Write the failing tests**

In `tests/test_models.py`, replace the two existing bold-related tests:

```python
def test_text_preset_style_flags_default_false():
    p = TextPreset(name="Pop")
    assert (p.bold, p.italic, p.underline) == (False, False, False)
    assert p.font == "Public Sans"

def test_text_preset_style_flags_round_trip():
    p = TextPreset(name="Pop", bold=True, italic=True, underline=True, font="JetBrains Mono")
    assert TextPreset.model_validate_json(p.model_dump_json()) == p
```

with:

```python
def test_text_preset_weight_defaults_400():
    p = TextPreset(name="Pop")
    assert p.weight == 400
    assert (p.italic, p.underline) == (False, False)
    assert p.font == "Public Sans"

def test_text_preset_weight_round_trip():
    p = TextPreset(name="Pop", weight=700, italic=True, underline=True, font="JetBrains Mono")
    assert TextPreset.model_validate_json(p.model_dump_json()) == p

def test_text_preset_migrates_legacy_bold_field():
    p = TextPreset.model_validate({"name": "Pop", "bold": True})
    assert p.weight == 700

def test_text_preset_migrates_legacy_bold_false_field():
    p = TextPreset.model_validate({"name": "Pop", "bold": False})
    assert p.weight == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: FAIL — `AttributeError: 'TextPreset' object has no attribute 'weight'` on the new tests (the old two tests you just replaced are gone, so no conflicting failures from them).

- [ ] **Step 3: Implement**

In `app/models.py`, replace `bold: bool = False` with `weight: int = 400` in `TextPreset`:

```python
    weight: int = 400              # 400 | 500 | 600 | 700 — replaces the old `bold: bool`
    italic: bool = False
    underline: bool = False
```

Extend the existing `model_validator` to also migrate the legacy `bold` field:

```python
    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_box_fields(cls, data):
        if isinstance(data, dict) and "box" in data and "box_background" not in data:
            data = dict(data)
            data["box_background"] = data.pop("box")
            if "box_color" in data:
                data["box_background_color"] = data.pop("box_color")
        if isinstance(data, dict) and "bold" in data and "weight" not in data:
            data = dict(data)
            data["weight"] = 700 if data.pop("bold") else 400
        return data
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: PASS (all tests in the file, including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: replace TextPreset.bold with TextPreset.weight, migrate legacy saves"
```

---

### Task 4: `app/ass_render.py` — weight-aware `Fontname`, `Bold` column always 0

**Files:**
- Modify: `app/ass_render.py`
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `TextPreset.weight` (Task 3), `font_metrics.WEIGHT_LABELS` (Task 2), `pil_font_measurer(font_name, size_px, weight=400)` (Task 2).
- Produces: `_style()`'s `Fontname` column includes the weight label (e.g. `"Public Sans Medium"`), matching exactly the family names Task 1 baked into the generated `.ttf` files. `Bold` column is unconditionally `"0"`.

Current relevant code (`app/ass_render.py`):
```python
from app.font_metrics import wrap_text, pil_font_measurer
...
def _style(name: str, p: TextPreset) -> str:
    bold = -1 if p.bold else 0
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    return (f"Style: {name},{p.font},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"
            f"{hex_to_ass(p.outline_color)},{hex_to_ass('#000000')},"
            f"{bold},{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,5,0,0,0,1")   # alignment 5 = center anchor, \pos places it

def _wrapped_lines_and_size(b, p: TextPreset) -> tuple[str, float, float]:
    measure = pil_font_measurer(p.font, p.size_px)
    ...
```

- [ ] **Step 1: Write/update the failing tests**

In `tests/test_ass_render.py`, replace the two existing bold/italic/underline tests:

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
```

with:

```python
def test_style_line_bold_column_is_always_zero_regardless_of_weight():
    # Bold-ness now lives entirely in which font face Fontname selects, not in ASS's
    # synthetic-bold flag — setting both would double-bold a 700-weight face.
    pr = TextPreset(name="Pop", weight=700, italic=True, underline=True)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    # Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
    #         Bold,Italic,Underline,StrikeOut,...
    assert fields[7:10] == ["0", "-1", "-1"]

def test_style_line_defaults_no_italic_underline():
    pr = TextPreset(name="Plain")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[7:10] == ["0", "0", "0"]

def test_style_line_fontname_includes_weight_label():
    pr = TextPreset(name="Pop", font="Public Sans", weight=500)
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[1] == "Public Sans Medium"

def test_style_line_fontname_includes_regular_label_at_default_weight():
    # 400 gets its own generated "Regular" static file too, rather than a bare unsuffixed
    # family name — uniform handling across all four weights, no special-casing 400.
    pr = TextPreset(name="Pop", font="Public Sans")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="H", preset_id=pr.id, start=0, end=2)])
    out = render_ass(p, {pr.id: pr})
    line = next(l for l in out.splitlines() if l.startswith("Style:"))
    fields = line.split(",")
    assert fields[1] == "Public Sans Regular"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: FAIL — every test in the file errors with `AttributeError: 'TextPreset' object has no attribute 'bold'`. This is expected and correct: Task 3 already removed `TextPreset.bold`, but `_style()` (below, before Step 3's fix) still reads `p.bold` on its first line, and `_style()` runs for every `render_ass()` call in every test in this file.

- [ ] **Step 3: Implement**

In `app/ass_render.py`, update the import and `_style()`/`_wrapped_lines_and_size()`:

```python
from app.font_metrics import wrap_text, pil_font_measurer, WEIGHT_LABELS
```

```python
def _style(name: str, p: TextPreset) -> str:
    italic = -1 if p.italic else 0
    underline = -1 if p.underline else 0
    fontname = f"{p.font} {WEIGHT_LABELS[p.weight]}"
    return (f"Style: {name},{fontname},{p.size_px},{hex_to_ass(p.color)},{hex_to_ass(p.color)},"
            f"{hex_to_ass(p.outline_color)},{hex_to_ass('#000000')},"
            f"0,{italic},{underline},0,100,100,0,0,1,{p.outline_px},0,5,0,0,0,1")   # alignment 5 = center anchor, \pos places it; Bold always 0 — bold-ness lives in Fontname's face selection

def _wrapped_lines_and_size(b, p: TextPreset) -> tuple[str, float, float]:
    measure = pil_font_measurer(p.font, p.size_px, p.weight)
    pad_x = BOX_PAD_X_EM * p.size_px * 2
    pad_y = BOX_PAD_Y_EM * p.size_px * 2
    if p.box_width_mode == "fixed":
        text = wrap_text(b.heading, measure, max(1, p.box_width - pad_x))
    else:
        text = b.heading
    lines = text.split("\n")
    width = p.box_width if p.box_width_mode == "fixed" else max(measure(line) for line in lines) + pad_x
    height = p.box_height if p.box_height_mode == "fixed" else len(lines) * p.size_px * LINE_HEIGHT + pad_y
    return text, width, height
```

Only the first line of `_wrapped_lines_and_size` changes (passing `p.weight` through to the measurer) — everything else in the function is unchanged from the current file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: make ass_render Fontname weight-aware, Bold column always 0"
```

---

### Task 5: `app/ffmpeg_cmd.py` — add `fontsdir` to the `ass` filter

**Files:**
- Modify: `app/ffmpeg_cmd.py`
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `escape_filter_path` (already exists in this file).
- Produces: the `ass` filter string in `build_export_cmd`'s output now always includes `:fontsdir=<escaped path>` when `ass_path` is given. No other task depends on this beyond the export route working end-to-end.

Current relevant code (`app/ffmpeg_cmd.py`):
```python
def build_export_cmd(p: Project, out_path: str, ass_path: str | None = None) -> list[str]:
    clips = ordered(p.clips)
    cmd = ["ffmpeg", "-y"]
    parts = []
    for i, c in enumerate(clips):
        ...
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"
    vmap = "[vc]"
    if ass_path:
        fc += f";[vc]ass='{escape_filter_path(ass_path)}'[vo]"
        vmap = "[vo]"
    cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", out_path]
    return cmd
```

This is the same mechanism empirically validated during the spec's investigation: `fontsdir` must be colon-escaped the same way `ass_path` already is (Windows drive-letter colons break ffmpeg's filter-option parser otherwise — confirmed by a real failed run during that investigation), so reuse `escape_filter_path` for it too.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_ffmpeg_cmd.py`:

```python
def test_ass_burn_includes_fontsdir_pointing_at_static_fonts():
    fc = build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass")[
        build_export_cmd(proj(), "out.mp4", ass_path="C:/tmp/subs.ass").index("-filter_complex") + 1]
    assert ":fontsdir='static/fonts'" in fc

def test_no_fontsdir_when_no_ass_path():
    fc = build_export_cmd(proj(), "out.mp4")[build_export_cmd(proj(), "out.mp4").index("-filter_complex") + 1]
    assert "fontsdir" not in fc
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: FAIL — `test_ass_burn_includes_fontsdir_pointing_at_static_fonts` fails, `fontsdir` not present yet. (`test_no_fontsdir_when_no_ass_path` passes trivially already, since no `ass` filter is added at all without `ass_path` — that's fine, it's a guard-rail test for the next step.)

- [ ] **Step 3: Implement**

In `app/ffmpeg_cmd.py`, change the `ass_path` branch:

```python
    if ass_path:
        fc += f";[vc]ass='{escape_filter_path(ass_path)}':fontsdir='{escape_filter_path('static/fonts')}'[vo]"
        vmap = "[vo]"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: PASS (all tests in the file, including the pre-existing `test_ass_burn_appended_when_given`, which still passes since it only checks a substring that's still present).

- [ ] **Step 5: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py
git commit -m "feat: point ffmpeg's ass filter at static/fonts via fontsdir"
```

---

### Task 6: `GET /api/fonts/{name}/weights` route

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_main.py`

**Interfaces:**
- Consumes: `font_metrics.available_weights(font_name)`, `font_metrics.WEIGHT_LABELS` (Task 2).
- Produces: `list_font_weights(name: str) -> list[dict]`, returning `[{"value": 400, "label": "Regular"}, ...]` in ascending weight order. Task 7's frontend fetch depends on this exact route path and response shape.

Current relevant code (`app/main.py`):
```python
from app.models import Project, TextPreset
from app import store, media, ffmpeg_cmd, ass_render
...
@app.get("/api/presets")
def list_presets() -> list[TextPreset]:
    return store.load_presets(DATA_DIR)
```

- [ ] **Step 1: Write the failing test**

Append to `tests/test_main.py`:

```python
from app.main import list_font_weights

def test_list_font_weights_public_sans_has_all_four():
    result = list_font_weights("Public Sans")
    assert result == [
        {"value": 400, "label": "Regular"},
        {"value": 500, "label": "Medium"},
        {"value": 600, "label": "SemiBold"},
        {"value": 700, "label": "Bold"},
    ]

def test_list_font_weights_jetbrains_mono_has_no_semibold():
    result = list_font_weights("JetBrains Mono")
    assert result == [
        {"value": 400, "label": "Regular"},
        {"value": 500, "label": "Medium"},
        {"value": 700, "label": "Bold"},
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: FAIL — `ImportError: cannot import name 'list_font_weights' from 'app.main'`.

- [ ] **Step 3: Implement**

In `app/main.py`, add the import and route:

```python
from app.font_metrics import available_weights, WEIGHT_LABELS
```

```python
@app.get("/api/fonts/{name}/weights")
def list_font_weights(name: str) -> list[dict]:
    return [{"value": w, "label": WEIGHT_LABELS[w]} for w in available_weights(name)]
```

Place it near the other simple `GET` routes (e.g. right after `/api/probe` or before `/api/presets` — match the existing route ordering style in the file).

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_main.py
git commit -m "feat: add GET /api/fonts/{name}/weights route"
```

---

### Task 7: Frontend — Weight settings row + drill-down, replacing the Bold toggle

**Files:**
- Create: `static/api-list-font-weights.js`
- Create: `static/text-panel-font-weight.js`
- Modify: `static/index.html`
- Modify: `static/editor.js`
- Modify: `static/text-panel-font-style.js`
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `GET /api/fonts/{name}/weights` (Task 6), `TextPreset.weight` (Task 3), `ensureTextBlock()`/`ensureTextPreset()`/`saveProject()`/`renderTextPreview()`/`AVAILABLE_FONTS` (existing `editor.js` globals), `UI.settingsRow`/`UI.subPanelHeader` (existing components).
- Produces: `window.Api.listFontWeights(fontName)`, `window.TextPanel.renderFontWeight()`. Task 8 depends on `TextPanel.renderFontWeight` existing (to re-render the row after a font-family change snaps the weight).

This task removes the Bold icon-button entirely and adds a new Weight settings row + drill-down, mirroring the existing Font Family pattern exactly (`static/text-panel-font-family.js` is the reference implementation — read it in full before starting).

- [ ] **Step 1: Add the API service file**

Create `static/api-list-font-weights.js`:

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the data.
window.Api = window.Api || {};

// Fetches the weights (400/500/600/700, only those the font actually supports) available
// for the given font family, as [{value, label}], from GET /api/fonts/{name}/weights.
window.Api.listFontWeights = async function listFontWeights(fontName) {
  const res = await fetch(`/api/fonts/${encodeURIComponent(fontName)}/weights`);
  return res.json();
};
```

- [ ] **Step 2: Add the Weight settings row + drill-down component**

Create `static/text-panel-font-weight.js`:

```js
// TEXT panel FONT accordion: font-weight row + drill-down subpanel. Pure UI over
// TextPreset.weight. Exposes window.TextPanel.renderFontWeight(). No bundler — reaches
// directly into editor.js's globals (ensureTextBlock, ensureTextPreset, saveProject,
// renderTextPreview), same pattern as text-panel-font-family.js.
window.TextPanel = window.TextPanel || {};

(() => {
  let weightRowSetValue = null;
  let currentWeights = [];   // [{value, label}] for the currently selected font, refreshed per render

  function openWeightPanel() {
    renderWeightList();
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-weight").hidden = false;
  }

  function closeWeightPanel() {
    document.getElementById("panel-text-weight").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  async function selectWeight(weightValue) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset.weight = weightValue;
    await saveProject();
    renderTextPreview();
    renderFontWeight();
    closeWeightPanel();
  }

  function renderWeightList() {
    const listEl = document.getElementById("text-weight-list");
    listEl.innerHTML = "";
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    currentWeights.forEach((w) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("click", () => selectWeight(w.value));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.textContent = w.label;
      li.appendChild(nameEl);

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

  UI.subPanelHeader(document.getElementById("text-weight-subpanel-header"), { title: "Weight", onBack: closeWeightPanel });

  async function renderFontWeight() {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    currentWeights = await Api.listFontWeights(preset.font);
    const current = currentWeights.find((w) => w.value === preset.weight);
    const label = current ? current.label : String(preset.weight);
    if (weightRowSetValue) {
      weightRowSetValue(label);
    } else {
      weightRowSetValue = UI.settingsRow(document.getElementById("text-weight-row"), {
        label: "Weight", value: label,
        onClick: openWeightPanel,
      });
    }
  }

  window.TextPanel.renderFontWeight = renderFontWeight;
})();
```

Note: `currentWeights` is module-local state used only by `renderWeightList()` (populated fresh by `renderFontWeight()` on every render) — it isn't exposed outside this file. Task 8's font-family snap-to-nearest logic needs the *new* font's weight list before `renderFontWeight()` re-runs for it, so it fetches its own copy via `Api.listFontWeights()` rather than reading this module's (necessarily stale, at that point) state.

- [ ] **Step 3: Wire the new script and markup into `index.html`**

In `static/index.html`, find the Bold/Italic/Underline row (inside `#text-font-body`):

```html
          <div class="style-group">
            <div class="style-row">
              <button class="icon-btn" id="text-bold" type="button" aria-pressed="false" title="Bold">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>
              </button>
              <button class="icon-btn" id="text-italic" type="button" aria-pressed="false" title="Italic">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
              </button>
              <button class="icon-btn" id="text-underline" type="button" aria-pressed="false" title="Underline">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
              </button>
            </div>
          </div>
```

Replace it with a Weight settings row above, keeping Italic/Underline as their own (now two-button) row:

```html
          <div class="style-group">
            <div id="text-weight-row"></div>
          </div>

          <div class="style-group">
            <div class="style-row">
              <button class="icon-btn" id="text-italic" type="button" aria-pressed="false" title="Italic">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
              </button>
              <button class="icon-btn" id="text-underline" type="button" aria-pressed="false" title="Underline">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
              </button>
            </div>
          </div>
```

Then, near the end of the file, find the Font Family drill-down panel:

```html
        <div id="panel-text-font" hidden>
          <div id="text-font-subpanel-header"></div>
          <ul id="text-font-list" class="font-list"></ul>
        </div>
```

Add a sibling drill-down panel for Weight right after it:

```html
        <div id="panel-text-font" hidden>
          <div id="text-font-subpanel-header"></div>
          <ul id="text-font-list" class="font-list"></ul>
        </div>

        <div id="panel-text-weight" hidden>
          <div id="text-weight-subpanel-header"></div>
          <ul id="text-weight-list" class="font-list"></ul>
        </div>
```

Finally, add the two new `<script>` tags, placed right after `text-panel-font-family.js` and its neighbor `text-panel-font-style.js`:

```html
<script src="/static/api-list-font-weights.js"></script>
```
(add this near the other `api-*.js` tags, e.g. right after `<script src="/static/api-save-preset.js"></script>`)

```html
<script src="/static/text-panel-font-weight.js"></script>
```
(add this right after `<script src="/static/text-panel-font-style.js"></script>`)

- [ ] **Step 4: Remove the Bold wiring from `text-panel-font-style.js`**

In `static/text-panel-font-style.js`, remove the `text-bold` line from the toggle wiring:

```js
  wireTextStyleToggle("text-bold", "bold");
  wireTextStyleToggle("text-italic", "italic");
  wireTextStyleToggle("text-underline", "underline");
```

becomes:

```js
  wireTextStyleToggle("text-italic", "italic");
  wireTextStyleToggle("text-underline", "underline");
```

And remove the corresponding `aria-pressed` line inside `renderFontStyle()`:

```js
    document.getElementById("text-bold").setAttribute("aria-pressed", String(preset.bold));
    document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));
```

becomes:

```js
    document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));
```

- [ ] **Step 5: Wire `renderFontWeight()` into `renderTextPanel()` and reset its drill-down, in `editor.js`**

Current (`static/editor.js`):
```js
function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-style").hidden = true;
  document.getElementById("panel-text-main").hidden = false;

  const block = ensureTextBlock();
  const preset = ensureTextPreset(block.preset_id);

  TextPanel.renderFontFamily();
  TextPanel.renderFontStyle();
  TextPanel.renderStyle();
  renderBoxPanel();
  TextPanel.renderAlign();
  TextPanel.renderPosition();
  TextPanel.renderTime();

  renderTextPreview();

  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
    onMove: (delta) => handleBoxMove(preset, delta),
    onMoveEnd: (delta) => handleBoxMoveEnd(preset, delta),
    onEdit: (heading) => { block.heading = heading; },
    onEditEnd: async (heading) => { block.heading = heading; await saveProject(); },
  });
}
```

Change to (two new lines only — `panel-text-weight` reset near the top, `renderFontWeight()` call in the middle; everything else in the function is unchanged):
```js
function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-weight").hidden = true;
  document.getElementById("panel-text-style").hidden = true;
  document.getElementById("panel-text-main").hidden = false;

  const block = ensureTextBlock();
  const preset = ensureTextPreset(block.preset_id);

  TextPanel.renderFontFamily();
  TextPanel.renderFontWeight();
  TextPanel.renderFontStyle();
  TextPanel.renderStyle();
  renderBoxPanel();
  TextPanel.renderAlign();
  TextPanel.renderPosition();
  TextPanel.renderTime();

  renderTextPreview();

  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
    onMove: (delta) => handleBoxMove(preset, delta),
    onMoveEnd: (delta) => handleBoxMoveEnd(preset, delta),
    onEdit: (heading) => { block.heading = heading; },
    onEditEnd: async (heading) => { block.heading = heading; await saveProject(); },
  });
}
```

Also update `defaultTextPreset()` (same file), which currently sets `bold: false`:

```js
function defaultTextPreset(id) {
  return {
    id,
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, bold: false, italic: false, underline: false,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000",
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: 700, entrance: "fade_pop",
    pos_row: "mid", pos_col: "mid", offset_x: 0, offset_y: 0,
  };
}
```

(Note: this object is also currently missing a `box_background_opacity` field that `TextPreset` has had server-side since an earlier, unrelated task — out of scope here; don't add it as part of this change, just don't be surprised it's absent from the "current" listing above.)

Change to (only the one field changes, `bold: false` → `weight: 400`):
```js
function defaultTextPreset(id) {
  return {
    id,
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000",
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: 700, entrance: "fade_pop",
    pos_row: "mid", pos_col: "mid", offset_x: 0, offset_y: 0,
  };
}
```

- [ ] **Step 6: `preview.js` reads `weight` instead of `bold`**

Current (`static/preview.js`):
```js
      div.style.fontWeight = preset.bold ? "700" : "400";
```

Change to:
```js
      div.style.fontWeight = String(preset.weight);
```

- [ ] **Step 7: Manual verification**

Run: `.venv/Scripts/python -m pytest -q` — expected: all pass, unaffected (this task is entirely frontend).

Then, since this is a real UI change:
1. Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload` (or a scratch port if another instance is already running).
2. Open it in a browser tool, navigate to TEXT panel → FONT accordion.
3. Confirm: no Bold button remains (only Italic/Underline in that row); a new "Weight" settings row appears above it, showing "Regular" by default.
4. Click the Weight row, confirm the drill-down opens listing "Regular", "Medium", "SemiBold", "Bold" (Public Sans is the default font) with a checkmark on "Regular".
5. Click "Medium", confirm the drill-down closes, the Weight row now shows "Medium", and the stage text visibly gets heavier (inspect `getComputedStyle` on the `.text-block` div, confirm `fontWeight === "500"`).
6. Check `read_console_messages` for errors.

- [ ] **Step 8: Commit**

```bash
git add static/api-list-font-weights.js static/text-panel-font-weight.js static/index.html static/editor.js static/text-panel-font-style.js static/preview.js
git commit -m "feat: add Weight settings row + drill-down, remove Bold toggle"
```

---

### Task 8: Snap to nearest available weight when the font changes

**Files:**
- Modify: `static/text-panel-font-family.js`

**Interfaces:**
- Consumes: `TextPanel.renderFontWeight()`, `Api.listFontWeights()` (Task 7).
- Produces: no new exports — this task only changes `selectFont()`'s internal behavior.

Current (`static/text-panel-font-family.js`):
```js
  async function selectFont(fontName) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset.font = fontName;
    await saveProject();
    renderFontFamily();
    renderFontList();
    closeFontPanel();
  }
```

- [ ] **Step 1: Implement the snap-to-nearest logic**

Change `selectFont` to:

```js
  async function selectFont(fontName) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset.font = fontName;
    const weights = await Api.listFontWeights(fontName);
    if (!weights.some((w) => w.value === preset.weight)) {
      preset.weight = weights.reduce((closest, w) =>
        Math.abs(w.value - preset.weight) < Math.abs(closest.value - preset.weight) ? w : closest
      ).value;
    }
    await saveProject();
    renderFontFamily();
    await TextPanel.renderFontWeight();
    renderFontList();
    closeFontPanel();
  }
```

(`Api.listFontWeights` is called directly here, for the *new* font, rather than reading any state left over from the previous font's render — we need the new font's list to decide whether to snap *before* calling `renderFontWeight()`, which only refreshes its own state after being invoked.)

- [ ] **Step 2: Manual verification**

There's no automated test for this (frontend-only, no test runner) — verify live:
1. Start the server (scratch port if needed), open in a browser tool.
2. In TEXT → FONT, set Weight to "SemiBold" while the font is "Public Sans" (confirm SemiBold is available and selected).
3. Open Font Family, select "JetBrains Mono" (confirm this font has no SemiBold — only Regular/Medium/Bold).
4. Confirm the Weight row now shows something other than "SemiBold" (JetBrains Mono doesn't have it) — expect it to snap to "Medium" (500) or "Bold" (700), whichever is numerically closer to 600 (500 is 100 away, 700 is 100 away — a tie; either is an acceptable, deterministic outcome of `Array.prototype.reduce`'s first-match-wins tie-breaking, since `<` is strict). Confirm the stage text's `font-weight` CSS matches whatever the row now shows.
5. Check `read_console_messages` for errors.

- [ ] **Step 3: Commit**

```bash
git add static/text-panel-font-family.js
git commit -m "feat: snap to nearest available weight when the font changes"
```

---

### Task 9: `CLAUDE.md` inventory update + full verification pass

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing further downstream — this is the final task.

- [ ] **Step 1: Update the `app/models.py` inventory line**

Find (in `CLAUDE.md`'s Inventory section):
```
`TextPreset` (`font` defaults to `"Public Sans"`, constrained by the UI to the 2 vendored families; `bold`/`italic`/`underline: bool = False`, whole-block formatting, added 2026-07-14);
```

Change to:
```
`TextPreset` (`font` defaults to `"Public Sans"`, constrained by the UI to the 2 vendored families; `weight: int = 400` — 400/500/600/700, replaces the old `bold: bool` 2026-07-19, migrated on load — `italic`/`underline: bool = False`, whole-block formatting, added 2026-07-14);
```

- [ ] **Step 2: Update the `app/font_metrics.py` inventory line**

Find:
```
- `app/font_metrics.py` — `wrap_text(text, measure_width, max_width_px) -> str` (pure word-wrap, injectable measurer), `pil_font_measurer(font_name, size_px) -> Callable[[str], float]` (decompresses the vendored `.woff2` via fontTools to sfnt bytes in-memory, measures with Pillow — used only by `ass_render.py`'s export path, added 2026-07-17).
```

Change to:
```
- `app/font_metrics.py` — `wrap_text(text, measure_width, max_width_px) -> str` (pure word-wrap, injectable measurer), `pil_font_measurer(font_name, size_px, weight=400) -> Callable[[str], float]` (measures one of the static per-weight `.ttf` files generated by `scripts/generate_font_weights.py` — used only by `ass_render.py`'s export path, added 2026-07-17, weight-aware 2026-07-19), `FONT_WEIGHT_PATHS` (font -> {weight: path to its generated static file}), `WEIGHT_LABELS` ({400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}), `available_weights(font_name) -> list[int]` (only the weights that font actually has a generated file for — e.g. JetBrains Mono has no 600/SemiBold).
```

- [ ] **Step 3: Update the `app/ass_render.py` inventory line**

Find (the sentence about Bold/Italic/Underline columns):
```
Style line's Bold/Italic/Underline columns come from `TextPreset.bold/italic/underline` (added 2026-07-14).
```

Change to:
```
Style line's Italic/Underline columns come from `TextPreset.italic/underline`; the Bold column is unconditionally `0` and `Fontname` instead includes a weight label (e.g. `"Public Sans Medium"`) matching one of the static per-weight files `scripts/generate_font_weights.py` generates, since ASS has no numeric font-weight concept and libass selects fonts purely by family name (added 2026-07-14, weight-aware 2026-07-19).
```

- [ ] **Step 4: Update the `app/ffmpeg_cmd.py` inventory line**

Find:
```
- `app/ffmpeg_cmd.py` — `build_export_cmd` (per-clip trim/scale/pad, concat, optional ASS burn-in), `escape_filter_path`.
```

Change to:
```
- `app/ffmpeg_cmd.py` — `build_export_cmd` (per-clip trim/scale/pad, concat, optional ASS burn-in with a `fontsdir=static/fonts` option so libass resolves the generated per-weight font files by exact name instead of depending on system-installed fonts, added 2026-07-19), `escape_filter_path`.
```

- [ ] **Step 5: Update the `app/main.py` inventory line**

Find:
```
- `app/main.py` — FastAPI composition root: `GET /`, `POST/GET/PUT /api/projects[/{id}]`, `GET /api/probe`, `GET /api/pick-file`, `GET /media`, `POST /api/projects/{id}/export`, GET/POST /api/presets, static mount at `/static`.
```

Change to:
```
- `app/main.py` — FastAPI composition root: `GET /`, `POST/GET/PUT /api/projects[/{id}]`, `GET /api/probe`, `GET /api/pick-file`, `GET /media`, `POST /api/projects/{id}/export`, GET/POST /api/presets, `GET /api/fonts/{name}/weights` (added 2026-07-19), static mount at `/static`.
```

- [ ] **Step 6: Add a bullet for the new frontend files**

Find the `static/text-panel-font-family.js` inventory line and add two new lines right after it (matching the existing bullet-list style for `static/text-panel-*.js`/`static/api-*.js` files):

```
- `static/text-panel-font-weight.js` — TEXT panel FONT accordion: font-weight settings row + drill-down, replacing the old Bold toggle (added 2026-07-19). Mirrors `text-panel-font-family.js`'s pattern exactly — fetches available weights for the current font via `Api.listFontWeights()`, click-to-apply (no hover-preview), checkmark on the current selection.
- `static/api-list-font-weights.js` — `Api.listFontWeights(fontName) -> Promise<{value, label}[]>`: `GET /api/fonts/{name}/weights`.
```

- [ ] **Step 7: Full-suite verification**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass (this is a docs-only change, but confirms nothing from earlier tasks regressed).

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md inventory for the font-weight picker"
```
