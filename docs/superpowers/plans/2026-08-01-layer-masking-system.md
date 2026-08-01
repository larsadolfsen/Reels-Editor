# Layer Masking System (Shape-as-Mask) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the straight-line edge-mask feature on video/image boxes with a system where a shape layer can be nested under a video/image box as its mask, clipping that box to the shape's rounded-rect alpha (respecting opacity and corner radius) in both live preview and export.

**Architecture:** `VideoBoxLayer`/`ImageBoxLayer` gain `mask_shape_id: str | None`. A shape referenced by some box's `mask_shape_id` is excluded from the normal shape overlay stack/export bands and instead rendered nested under its target in the timeline (an accordion). A shared pure geometry module (`app/shape_mask.py` + `static/shape-mask.js`, mirrored like the retired `box_mask.py`/`box-mask.js`) computes the mask rect in the target's local coordinate space; the frontend turns that into a CSS `mask-image` (final view) or, when the mask shape is selected, a red rubylith overlay on the target plus the mask shape rendered normally via the existing `ShapePreview`. Export rasterizes the same rect to a PNG (`write_shape_mask_png`) consumed by the existing `alphaextract`/`alphamerge` ffmpeg chain (unchanged — it already accepts an optional `mask_path` per band).

**Tech Stack:** FastAPI + Pydantic (backend), vanilla JS classic scripts (frontend, no build step), Pillow (PNG rasterization), ffmpeg (export), pytest + `node --test`.

## Global Constraints

- No JS build step/bundler — new icons go through `UI.icon`'s `ICON_PATHS` map (`static/ui-icon.js`), never hand-inlined `<svg>` (enforced by `tests/js/no-raw-svg.test.js`).
- No inline `style="..."` attributes in `static/index.html` — new static markup uses CSS classes; JS-set inline styles (`el.style.x = ...`) are fine, matching existing box/shape preview code.
- Every `static/*.js` file opens with a 1–2 line header comment stating its purpose.
- Pure geometry/logic shared between Python and JS gets a Python module, a JS mirror, and a pinning test running the JS file under Node against the same case table — the existing `box_mask.py`/`box-mask.js`/`test_box_mask_js.py` pattern.
- Classic scripts share one global scope: `project`, `saveProject()`, `renderTimeline()`, `stageScale()` etc. are referenced as bare identifiers from any `static/*.js` file loaded after `editor.js`, no imports needed.
- Run `.venv/Scripts/python -m pytest -q` and `node --test "tests/js/**/*.test.js"` before every commit that touches backend/frontend respectively.
- Update the codebase map (project `CLAUDE.md`) in the same commit as any file add/move/rename/delete.

---

## Task 1: Data model — remove edge-mask fields, add `mask_shape_id`

**Files:**
- Modify: `app/models.py:39-72` (`VideoBoxLayer`, `ImageBoxLayer`)
- Modify: `tests/test_models.py:367-390`

**Interfaces:**
- Produces: `VideoBoxLayer.mask_shape_id: str | None`, `ImageBoxLayer.mask_shape_id: str | None` — consumed by every later task.

- [ ] **Step 1: Write the failing test**

Replace the four mask tests in `tests/test_models.py` (lines 367–390):

```python
def test_video_box_mask_shape_id_defaults_none():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920)
    assert v.mask_shape_id is None

def test_image_box_mask_shape_id_defaults_none():
    b = ImageBoxLayer(media_id="m1", file_path="pic.jpg", height=1920)
    assert b.mask_shape_id is None

def test_video_box_mask_shape_id_round_trip():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920,
                      mask_shape_id="shape123")
    assert VideoBoxLayer.model_validate_json(v.model_dump_json()) == v

def test_image_box_mask_shape_id_round_trip():
    b = ImageBoxLayer(media_id="m1", file_path="pic.jpg", height=1920,
                      mask_shape_id="shape123")
    assert ImageBoxLayer.model_validate_json(b.model_dump_json()) == b
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k mask_shape_id -v`
Expected: FAIL with `AttributeError` / `unexpected keyword argument 'mask_shape_id'`

- [ ] **Step 3: Update the models**

In `app/models.py`, replace lines 51–54 (`VideoBoxLayer`'s mask fields) with:

```python
    mask_shape_id: str | None = None  # id of the ShapeLayer (in Project.shapes) acting as this box's mask, or None
```

and replace lines 68–71 (`ImageBoxLayer`'s mask fields) with the same line.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k mask -v`
Expected: PASS (4 new tests; the old 4 no longer exist)

- [ ] **Step 5: Fix the other tests that reference the removed fields**

`tests/test_main.py:403-407` — replace:
```python
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2.0,
                        width=300, height=500, mask_enabled=True, mask_angle=0.0,
                        mask_offset=0.0, mask_flip=False)
```
with:
```python
    shape = ShapeLayer(x=0, y=0, width=300, height=500)
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2.0,
                        width=300, height=500, mask_shape_id=shape.id)
```
and add `shapes=[shape]` to the `Project(...)` call that follows on the next line (`p = Project(name="r", video_boxes=[box], shapes=[shape])`). Add `ShapeLayer` to that file's import from `app.models` if not already imported (check the top of `tests/test_main.py`).

`tests/test_ffmpeg_cmd.py` lines 428-506 (five tests) — these build `VideoBoxLayer`/`ImageBoxLayer` with `mask_enabled=True` purely to exercise the `bands` list's `mask_path` key, which is unrelated to how the mask was assigned. Simplify: drop `mask_enabled=True` from every constructor call in that block (lines 430, 443, 453, 501) — `build_export_cmd` only ever reads `band["mask_path"]`, never the box's own mask fields, so this doesn't change what the test is verifying.

- [ ] **Step 6: Run full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: existing failures only in files not yet touched (`test_box_mask.py`, `test_box_mask_js.py`, `test_mask_image.py` — removed in Task 5) and `tests/js/timeline-slice.test.js` (fixed in Task 9). Every other test passes.

- [ ] **Step 7: Commit**

```bash
git add app/models.py tests/test_models.py tests/test_main.py tests/test_ffmpeg_cmd.py
git commit -m "Replace VideoBoxLayer/ImageBoxLayer edge-mask fields with mask_shape_id"
```

---

## Task 2: Pure geometry — `app/shape_mask.py` + `static/shape-mask.js`

**Files:**
- Create: `app/shape_mask.py`
- Create: `static/shape-mask.js`
- Create: `tests/test_shape_mask.py`
- Create: `tests/test_shape_mask_js.py`

**Interfaces:**
- Produces: `app.shape_mask.local_rect(target_x, target_y, shape_x, shape_y, shape_width, shape_height, opacity, corner_radius) -> dict` with keys `rel_x, rel_y, width, height, opacity, corner_radius`. Consumed by Task 3 (`write_shape_mask_png` call site in `app/main.py`) and mirrored by `window.ShapeMask.localRect(target, shape) -> {relX, relY, width, height, opacity, cornerRadius}`, consumed by Task 7 (frontend rendering).

- [ ] **Step 1: Write the failing test**

Create `tests/test_shape_mask.py`:

```python
# Tests for app.shape_mask.local_rect: expresses a mask shape's geometry relative to its
# target box's own top-left corner, the coordinate space both the CSS mask-image (preview)
# and the rasterized mask PNG (export) are built in.
from app.shape_mask import local_rect

def test_shape_exactly_covering_target_has_zero_offset():
    rect = local_rect(target_x=100, target_y=200, shape_x=100, shape_y=200,
                       shape_width=300, shape_height=400, opacity=1.0, corner_radius=0)
    assert rect == {"rel_x": 0, "rel_y": 0, "width": 300, "height": 400,
                     "opacity": 1.0, "corner_radius": 0}

def test_shape_offset_from_target_carries_signed_offset():
    rect = local_rect(target_x=100, target_y=200, shape_x=150, shape_y=180,
                       shape_width=50, shape_height=60, opacity=0.5, corner_radius=8)
    assert rect["rel_x"] == 50   # shape is to the right of target's origin
    assert rect["rel_y"] == -20  # shape is above target's origin
    assert rect["width"] == 50 and rect["height"] == 60
    assert rect["opacity"] == 0.5 and rect["corner_radius"] == 8
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_shape_mask.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.shape_mask'`

- [ ] **Step 3: Write minimal implementation**

Create `app/shape_mask.py`:

```python
# Pure geometry for shape-as-mask: local_rect() expresses a mask ShapeLayer's rect relative to
# its target VideoBoxLayer/ImageBoxLayer's own top-left corner — the coordinate space both the
# CSS mask-image (static/shape-mask.js, live preview) and the rasterized mask PNG
# (app/shape_render.py's write_shape_mask_png, export) are built in.
# Mirrored exactly in static/shape-mask.js — pinned together by tests/test_shape_mask_js.py.

def local_rect(target_x: float, target_y: float, shape_x: float, shape_y: float,
               shape_width: float, shape_height: float, opacity: float,
               corner_radius: float) -> dict:
    """Express a mask shape's rect in the target box's own local coordinate space (target's
    top-left corner = origin). Width/height/opacity/corner_radius pass through unchanged."""
    return {
        "rel_x": shape_x - target_x,
        "rel_y": shape_y - target_y,
        "width": shape_width,
        "height": shape_height,
        "opacity": opacity,
        "corner_radius": corner_radius,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_shape_mask.py -v`
Expected: PASS

- [ ] **Step 5: Write the JS mirror**

Create `static/shape-mask.js`:

```javascript
// window.ShapeMask: geometry + CSS mask-image generation for shape-as-mask.
// localRect mirrors app/shape_mask.py's local_rect exactly (pinned by tests/test_shape_mask_js.py).
// cssMaskImage/cssInverseMaskImage build a data-URI SVG mask value: cssMaskImage keeps the shape's
// own rect (used on the masked target itself), cssInverseMaskImage keeps everything EXCEPT the
// shape's rect (used on the rubylith red-tint overlay shown while the mask shape is being edited).
window.ShapeMask = (() => {
  // target/shape are {x, y} for target and {x, y, width, height, opacity, corner_radius} for shape.
  function localRect(target, shape) {
    return {
      relX: shape.x - target.x,
      relY: shape.y - target.y,
      width: shape.width,
      height: shape.height,
      opacity: shape.opacity,
      cornerRadius: shape.corner_radius,
    };
  }

  function clampedRadius(rect) {
    return Math.max(0, Math.min(rect.cornerRadius, Math.min(rect.width, rect.height) / 2));
  }

  function clampedOpacity(rect) {
    return Math.max(0, Math.min(1, rect.opacity));
  }

  // Luminance mask: white = visible, black = hidden. Kept mask: a white rounded-rect at the
  // shape's own position/size on an otherwise black (fully hidden) canvas.
  function cssMaskImage(targetWidth, targetHeight, rect) {
    const radius = clampedRadius(rect);
    const opacity = clampedOpacity(rect);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}">` +
      `<rect x="${rect.relX}" y="${rect.relY}" width="${rect.width}" height="${rect.height}" ` +
      `rx="${radius}" fill="#fff" fill-opacity="${opacity}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  // Inverse mask: a full-canvas white rect (everything visible by default) with the shape's own
  // rect painted black on top (hidden there) — the complement of cssMaskImage's kept region.
  function cssInverseMaskImage(targetWidth, targetHeight, rect) {
    const radius = clampedRadius(rect);
    const opacity = clampedOpacity(rect);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}">` +
      `<rect x="0" y="0" width="${targetWidth}" height="${targetHeight}" fill="#fff"/>` +
      `<rect x="${rect.relX}" y="${rect.relY}" width="${rect.width}" height="${rect.height}" ` +
      `rx="${radius}" fill="#000" fill-opacity="${opacity}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  const api = { localRect, cssMaskImage, cssInverseMaskImage };
  if (typeof window !== "undefined") window.ShapeMask = api;
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
```

- [ ] **Step 6: Write the JS mirror pinning test**

Create `tests/test_shape_mask_js.py`:

```python
# Pins static/shape-mask.js's localRect to app.shape_mask.local_rect over a shared case table,
# by running the browser file under Node with a minimal `window` shim (same technique as
# tests/test_box_mask_js.py).
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.shape_mask import local_rect

REPO_ROOT = Path(__file__).resolve().parents[1]
SHAPE_MASK_JS = REPO_ROOT / "static" / "shape-mask.js"

# (target_x, target_y, shape_x, shape_y, shape_width, shape_height, opacity, corner_radius)
CASES = [
    (0, 0, 0, 0, 300, 400, 1.0, 0),
    (100, 200, 100, 200, 300, 400, 1.0, 0),
    (100, 200, 150, 180, 50, 60, 0.5, 8),
    (500, 900, 0, 0, 1080, 1920, 0.25, 40),
]

DRIVER = """
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const window = {};
eval(src);
const cases = JSON.parse(process.argv[3]);
console.log(JSON.stringify(cases.map(c => window.ShapeMask.localRect(
  { x: c[0], y: c[1] },
  { x: c[2], y: c[3], width: c[4], height: c[5], opacity: c[6], corner_radius: c[7] },
))));
"""

def test_js_local_rect_matches_python_on_every_case(tmp_path):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not installed; JS mirror parity not checked")
    driver = tmp_path / "driver.js"
    driver.write_text(DRIVER, encoding="utf-8")
    proc = subprocess.run(
        [node, str(driver), str(SHAPE_MASK_JS), json.dumps(CASES)],
        capture_output=True, text=True, check=True)
    js_results = json.loads(proc.stdout)

    assert len(js_results) == len(CASES)
    for case, js_rect in zip(CASES, js_results):
        py_rect = local_rect(case[0], case[1], case[2], case[3], case[4], case[5], case[6], case[7])
        assert js_rect["relX"] == pytest.approx(py_rect["rel_x"])
        assert js_rect["relY"] == pytest.approx(py_rect["rel_y"])
        assert js_rect["width"] == pytest.approx(py_rect["width"])
        assert js_rect["height"] == pytest.approx(py_rect["height"])
        assert js_rect["opacity"] == pytest.approx(py_rect["opacity"])
        assert js_rect["cornerRadius"] == pytest.approx(py_rect["corner_radius"])
```

- [ ] **Step 7: Run both new tests**

Run: `.venv/Scripts/python -m pytest tests/test_shape_mask.py tests/test_shape_mask_js.py -v`
Expected: PASS (4 + 1 tests)

- [ ] **Step 8: Add the script tag**

In `static/index.html`, add `<script src="/static/shape-mask.js"></script>` immediately after the existing `<script src="/static/box-mask.js"></script>` line (removed in Task 5 — for now it sits alongside it; Task 5 removes the box-mask line).

- [ ] **Step 9: Commit**

```bash
git add app/shape_mask.py static/shape-mask.js tests/test_shape_mask.py tests/test_shape_mask_js.py static/index.html
git commit -m "Add shape_mask pure geometry (Python + JS mirror) for shape-as-mask"
```

---

## Task 3: Export rasterization — `write_shape_mask_png`

**Files:**
- Modify: `app/shape_render.py`
- Modify: `tests/test_shape_render.py`

**Interfaces:**
- Consumes: nothing new (pure Pillow rasterization, same style as `write_shape_png` in the same file).
- Produces: `write_shape_mask_png(path, target_width, target_height, rel_x, rel_y, shape_width, shape_height, opacity, corner_radius) -> None`. Consumed by Task 5 (`app/main.py` export route).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_shape_render.py`:

```python
from app.shape_render import write_shape_mask_png

def test_write_shape_mask_png_has_target_size_and_rgba_mode(tmp_path):
    path = tmp_path / "mask.png"
    write_shape_mask_png(str(path), 200, 300, 0, 0, 200, 300, 1.0, 0)
    with Image.open(path) as img:
        assert img.size == (200, 300)
        assert img.mode == "RGBA"

def test_write_shape_mask_png_full_opacity_inside_transparent_outside(tmp_path):
    path = tmp_path / "mask.png"
    # A 100x100 shape centered in a 200x200 target box: rel_x/rel_y = 50, 50.
    write_shape_mask_png(str(path), 200, 200, 50, 50, 100, 100, 1.0, 0)
    with Image.open(path) as img:
        assert img.getpixel((100, 100))[3] == 255  # inside the shape
        assert img.getpixel((10, 10))[3] == 0      # outside the shape

def test_write_shape_mask_png_opacity_scales_alpha(tmp_path):
    path = tmp_path / "mask.png"
    write_shape_mask_png(str(path), 200, 200, 50, 50, 100, 100, 0.5, 0)
    with Image.open(path) as img:
        assert img.getpixel((100, 100))[3] == 128  # round(0.5 * 255)

def test_write_shape_mask_png_offset_outside_canvas_is_clipped_safely(tmp_path):
    path = tmp_path / "mask.png"
    # Mask shape hangs off the left/top edge of the target box — must not error, and the
    # visible portion (inside the canvas) must still be opaque.
    write_shape_mask_png(str(path), 100, 100, -30, -30, 60, 60, 1.0, 0)
    with Image.open(path) as img:
        assert img.size == (100, 100)
        assert img.getpixel((15, 15))[3] == 255
        assert img.getpixel((80, 80))[3] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_shape_render.py -k write_shape_mask_png -v`
Expected: FAIL with `ImportError: cannot import name 'write_shape_mask_png'`

- [ ] **Step 3: Write minimal implementation**

Add to `app/shape_render.py` (after `write_shape_png`):

```python
def write_shape_mask_png(path: str, target_width: int, target_height: int, rel_x: float,
                         rel_y: float, shape_width: float, shape_height: float,
                         opacity: float, corner_radius: int) -> None:
    """Write a target_width x target_height RGBA mask PNG: a filled rounded-rect at
    (rel_x, rel_y, shape_width, shape_height) — the mask shape's rect in the target box's own
    local coordinate space (app.shape_mask.local_rect) — alpha = round(opacity * 255) inside,
    0 outside. Pillow clips drawing to the canvas automatically, so a shape rect that hangs off
    any edge of the target box is safe. corner_radius is clamped to
    min(shape_width, shape_height) / 2 so it can never self-intersect."""
    tw, th = int(target_width), int(target_height)
    radius = max(0, min(int(corner_radius), int(min(shape_width, shape_height) / 2)))
    alpha = round(max(0.0, min(1.0, opacity)) * 255)

    img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x0, y0 = rel_x, rel_y
    x1, y1 = rel_x + shape_width - 1, rel_y + shape_height - 1
    ImageDraw.Draw(img).rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=(255, 255, 255, alpha))
    img.save(path)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_shape_render.py -v`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 5: Update the file header comment**

`app/shape_render.py`'s header (lines 1–7) currently describes only `write_shape_png`. Update it to also mention `write_shape_mask_png`:

```python
# Export-side rasterization for the vector shape overlay feature: write_shape_png() draws a
# filled rounded-rect as an RGBA PNG via Pillow (already a dependency, see app/font_metrics.py) —
# fill_color at the given opacity inside the rounded rect, fully transparent outside. Consumed by
# app/ffmpeg_cmd.py's "shape" band (a plain overlay respects the PNG's own alpha directly).
# write_shape_mask_png() rasterizes the same rounded-rect shape as a shape-as-mask feature's mask
# PNG instead: opaque white (not fill_color) at the given position/opacity within a canvas sized
# to the MASKED TARGET box (not the shape itself) — consumed by app/ffmpeg_cmd.py's "mask_path"
# alphaextract/alphamerge chain, same as the retired box-edge-mask feature's write_mask_png.
from PIL import Image, ImageDraw
```

- [ ] **Step 6: Commit**

```bash
git add app/shape_render.py tests/test_shape_render.py
git commit -m "Add write_shape_mask_png for shape-as-mask export rasterization"
```

---

## Task 4: `banded_layers()` excludes mask-referenced shapes

**Files:**
- Modify: `app/timeline.py:65-89`
- Modify: `tests/test_timeline.py`

**Interfaces:**
- Consumes: `VideoBoxLayer.mask_shape_id`, `ImageBoxLayer.mask_shape_id` (Task 1).
- Produces: `banded_layers(project)` no longer emits a `"shape"` band for a `ShapeLayer` whose id is referenced by any box's `mask_shape_id`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_timeline.py`:

```python
def test_banded_layers_excludes_a_shape_used_as_a_mask():
    shape = ShapeLayer(id="mask-shape", x=0, y=0, width=100, height=100)
    box = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=1.0, height=100,
                        mask_shape_id="mask-shape")
    other_shape = ShapeLayer(id="visible-shape", x=0, y=0, width=50, height=50)
    p = Project(name="p", video_boxes=[box], shapes=[shape, other_shape])
    bands = banded_layers(p)
    shape_bands = [b for b in bands if b["kind"] == "shape"]
    assert [b["shape"].id for b in shape_bands] == ["visible-shape"]
```

(Add `ShapeLayer` to the file's existing `from app.models import ...` line if not already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -k excludes_a_shape_used_as_a_mask -v`
Expected: FAIL — both shapes appear as bands.

- [ ] **Step 3: Update `banded_layers`**

In `app/timeline.py`, replace the `banded_layers` function (lines 65–89):

```python
def banded_layers(project: Project) -> list[dict]:
    """Partitions text blocks, video boxes, image boxes, and shapes into z-order bands for export
    compositing: consecutive text blocks accumulate into one 'text' band; each video/image box
    or shape is its own band. A shape referenced by some box's mask_shape_id is a mask source,
    not a visible layer, and is excluded here — it's rasterized separately (app.shape_render's
    write_shape_mask_png) and attached to its target box's band as "mask_path" by app.main's
    export route, instead of getting its own overlay band. Consumed by app.main's export route to
    decide how many ASS files to render, and by app.ffmpeg_cmd to build the alternating
    ass-burn/overlay filter chain."""
    mask_shape_ids = {v.mask_shape_id for v in project.video_boxes if v.mask_shape_id}
    mask_shape_ids |= {i.mask_shape_id for i in project.image_boxes if i.mask_shape_id}
    visible_shapes = [s for s in project.shapes if s.id not in mask_shape_ids]

    entries = sorted(
        [("text", b) for b in project.text_blocks]
        + [("video_box", v) for v in project.video_boxes]
        + [("image_box", i) for i in project.image_boxes]
        + [("shape", s) for s in visible_shapes],
        key=lambda e: e[1].z_index,
    )
    bands: list[dict] = []
    pending_text: list = []
    for kind, item in entries:
        if kind == "text":
            pending_text.append(item)
        else:
            if pending_text:
                bands.append({"kind": "text", "text_blocks": pending_text})
                pending_text = []
            bands.append({"kind": kind, kind: item})
    if pending_text:
        bands.append({"kind": "text", "text_blocks": pending_text})
    return bands
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add app/timeline.py tests/test_timeline.py
git commit -m "banded_layers excludes shapes referenced as a box's mask_shape_id"
```

---

## Task 5: Wire export route; remove the retired edge-mask backend files

**Files:**
- Modify: `app/main.py:293-325` (export route), `app/main.py:12-13` (imports)
- Delete: `app/box_mask.py`, `app/mask_image.py`
- Delete: `tests/test_box_mask.py`, `tests/test_box_mask_js.py`, `tests/test_mask_image.py`

**Interfaces:**
- Consumes: `app.shape_mask.local_rect` (Task 2), `app.shape_render.write_shape_mask_png` (Task 3).
- Produces: the export route rasterizes a mask PNG from a box's `mask_shape_id` shape instead of `mask_enabled`/`mask_angle`/etc.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_main.py` (near the existing masked-box export test around line 400):

```python
def test_export_masked_video_box_rasterizes_mask_png_from_its_shape(tmp_path, monkeypatch):
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    shape = ShapeLayer(id="mshape", x=350, y=750, width=300, height=500, opacity=0.8, corner_radius=12)
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2.0,
                        x=300, y=700, width=300, height=500, mask_shape_id="mshape")
    p = Project(name="r", video_boxes=[box], shapes=[shape])
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        resp = client.post(f"/api/projects/{p.id}/export")
    assert resp.status_code == 200
    cmd = run_export.call_args[0][0]
    mask_pngs = [tmp_path_arg for tmp_path_arg in cmd if str(tmp_path_arg).endswith("-mask.png")]
    assert len(mask_pngs) == 1
    with Image.open(mask_pngs[0]) as img:
        assert img.size == (300, 500)  # target box's own size, not the shape's
```

(This test follows the exact style of the existing masked-box export test a few lines above it in `tests/test_main.py` — reuse whatever `client`/`patch`/`Image` imports that test already uses at the top of the file; add `ShapeLayer` to the `app.models` import if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k rasterizes_mask_png_from_its_shape -v`
Expected: FAIL — no mask PNG produced (the export route still checks `v.mask_enabled`, which no longer exists, so this currently raises `AttributeError`).

- [ ] **Step 3: Update the export route**

In `app/main.py`, update the import line (line 13):

```python
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform, filmstrip, auth, auto_slice, shape_render, shape_mask
```

(drop `mask_image`, add `shape_mask`).

Replace the `video_box`/`image_box` band-building branches (lines 302–319):

```python
            elif band["kind"] == "video_box":
                v = band["video_box"]
                entry = {"kind": "video_box", "video_box": v}
                if v.mask_shape_id:
                    shape = next((s for s in p.shapes if s.id == v.mask_shape_id), None)
                    if shape:
                        rect = shape_mask.local_rect(v.x, v.y, shape.x, shape.y, shape.width,
                                                     shape.height, shape.opacity, shape.corner_radius)
                        png = out_dir / f"{p.name}-{p.id[:8]}-band{i}-mask.png"
                        shape_render.write_shape_mask_png(str(png), v.width, v.height,
                                                           rect["rel_x"], rect["rel_y"],
                                                           rect["width"], rect["height"],
                                                           rect["opacity"], rect["corner_radius"])
                        entry["mask_path"] = str(png)
                bands.append(entry)
            elif band["kind"] == "image_box":
                b = band["image_box"]
                entry = {"kind": "image_box", "image_box": b}
                if b.mask_shape_id:
                    shape = next((s for s in p.shapes if s.id == b.mask_shape_id), None)
                    if shape:
                        rect = shape_mask.local_rect(b.x, b.y, shape.x, shape.y, shape.width,
                                                     shape.height, shape.opacity, shape.corner_radius)
                        png = out_dir / f"{p.name}-{p.id[:8]}-band{i}-mask.png"
                        shape_render.write_shape_mask_png(str(png), b.width, b.height,
                                                           rect["rel_x"], rect["rel_y"],
                                                           rect["width"], rect["height"],
                                                           rect["opacity"], rect["corner_radius"])
                        entry["mask_path"] = str(png)
                bands.append(entry)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k rasterizes_mask_png_from_its_shape -v`
Expected: PASS

- [ ] **Step 5: Delete the retired edge-mask files**

```bash
git rm app/box_mask.py app/mask_image.py tests/test_box_mask.py tests/test_box_mask_js.py tests/test_mask_image.py
```

- [ ] **Step 6: Run full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (no reference to the deleted modules remains anywhere in `app/` or `tests/`; confirm with `grep -rl "box_mask\|mask_image" app tests` returning nothing)

- [ ] **Step 7: Commit**

```bash
git add app/main.py tests/test_main.py
git commit -m "Export route rasterizes masks from mask_shape_id; remove retired box_mask/mask_image"
```

---

## Task 6: Remove the retired edge-mask frontend UI

**Files:**
- Delete: `static/box-mask.js`, `static/ui-mask-line-drag.js`, `static/css/components/mask-line-guide.css`
- Modify: `static/index.html` (script tags, stylesheet link, Mask tab markup in both box panels)
- Modify: `static/panel-video-box.js`, `static/panel-image-box.js` (remove Mask tab + `renderMask`)
- Modify: `static/video-box-preview.js`, `static/image-box-preview.js` (remove `BoxMask.clipPath`/mask-guide code — Task 7 replaces this with the new shape-as-mask rendering, so these files end this task with boxes rendering fully unmasked, then Task 7 makes masked boxes look right again)
- Modify: `tests/js/timeline-slice.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `VideoBoxPanel.render`/`ImageBoxPanel.render` with only Box + Time tabs (no Mask tab). `VideoBoxPreview.render`/`ImageBoxPreview.render` unchanged signature, temporarily rendering every box unmasked (fixed by Task 7).

- [ ] **Step 1: Update `tests/js/timeline-slice.test.js`**

Replace the mask fields in `makeBox`'s defaults (line 12) and the two assertion blocks (lines 67–114) with `mask_shape_id`:

```javascript
    mask_shape_id: null,
```
(replacing `mask_enabled: false, mask_angle: 0, mask_offset: 0, mask_flip: false,` on line 12)

```javascript
  const box = makeBox({
    y: 200, height: 500,
    mask_shape_id: "shape-abc",
  }); // start=5, in=2, out=12 -> window [5, 15)
```
(replacing the `mask_enabled: true, ...` block starting at line 72)

Replace the mask assertions (lines 91–94 and 110–113) with:
```javascript
  assert.strictEqual(box.mask_shape_id, "shape-abc");
```
and
```javascript
  assert.strictEqual(newBox.mask_shape_id, "shape-abc");
```

- [ ] **Step 2: Run the JS test to verify it currently passes as-is**

Run: `node --test tests/js/timeline-slice.test.js`
Expected: PASS (this file's `sliceVideoBox` spreads `...box`, so `mask_shape_id` already carries through unchanged with no code edits — this step just confirms the renamed field is still exercised, and flags the pre-existing "both halves keep the same mask id" behavior addressed by Task 9's cascade-delete design, not fixed here)

- [ ] **Step 3: Remove the Mask tab from `panel-video-box.js`**

In `static/panel-video-box.js`:
- Remove `const VIDEO_BOX_TAB_ICON_MASK = UI.icon("columns-2", { size: 18 });` (line 19)
- Remove `{ value: "mask", icon: VIDEO_BOX_TAB_ICON_MASK, label: "Mask" },` from `VIDEO_BOX_TABS` (line 24)
- Remove `mask: document.getElementById("video-box-mask-body"),` from `videoBoxTabPanes` (line 29)
- Delete the entire `renderMask(box)` function (lines 102–139)
- Remove the `renderMask(box);` call in `renderDetail` (line 162)
- Update the file's header comment (lines 1–12) to drop the "Mask (EDGE MASK)" mention: replace `"Time (START) and Mask (EDGE MASK) tab panes via UI.tabBar (Box default)"` with `"Time (START) tab panes via UI.tabBar (Box default)"`.

- [ ] **Step 4: Remove the Mask tab from `panel-image-box.js`**

Same edits as Step 3, mirrored: remove `IMAGE_BOX_TAB_ICON_MASK`, the `{value: "mask", ...}` tab entry, the `mask:` pane mapping, the `renderMask(box)` function (lines 97–134), its call site (line 160), and the header comment's Mask mention.

- [ ] **Step 5: Remove the Mask tab markup from `index.html`**

Delete lines 418–432 (`<div id="video-box-mask-body">...</div>` block) and lines 465–479 (`<div id="image-box-mask-body">...</div>` block).

- [ ] **Step 6: Remove `BoxMask`/mask-guide code from the preview modules**

In `static/video-box-preview.js`:
- Remove the header comment paragraphs about `BoxMask.clipPath`/`ui-mask-line-drag.js` (lines 9–13)
- Remove the mask-guide state variables (lines 21–25: `onMaskChange`, `maskGuide`, `maskGuideBoxId`, `maskGuideBox`, `maskGuideEl`)
- Remove `unmountMaskGuide()` and `syncMaskGuide()` (lines 50–87)
- Replace `video.style.clipPath = BoxMask.clipPath(v); syncMaskGuide(v, video);` (lines 128–131, including the comment) with nothing for now (Task 7 adds the replacement)
- Remove the two `unmountMaskGuide()` call sites inside `render`/`setSelectedVideoBox` (line 156, part of line 166)
- Remove `setOnMaskChange` from the returned object and its function definition (lines 175–177, 179)

Apply the same set of removals to `static/image-box-preview.js` (identical structure).

- [ ] **Step 7: Remove the retired files and their references**

```bash
git rm static/box-mask.js static/ui-mask-line-drag.js static/css/components/mask-line-guide.css
```

In `static/index.html`, remove the `<link rel="stylesheet" href="/static/css/components/mask-line-guide.css">` line (line 37) and the `<script src="/static/box-mask.js"></script>` line (find it near the other component `<script>` tags — grep confirmed it exists) and the `<script src="/static/ui-mask-line-drag.js"></script>` line.

- [ ] **Step 8: Verify no remaining references**

Run: `Select-String -Path static\*.js,static\index.html -Pattern "BoxMask|mask-line-guide|mask_enabled|mask_angle|mask_offset|mask_flip|maskLineDrag" ` (PowerShell) or `grep -rn "BoxMask\|mask-line-guide\|mask_enabled\|mask_angle\|mask_offset\|mask_flip\|maskLineDrag" static/`
Expected: no matches (aside from this plan file itself, if searched from repo root)

- [ ] **Step 9: Run the frontend test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS

- [ ] **Step 10: Manually verify the app still loads**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open a project with an existing video box, confirm the VIDEO BOX panel shows only Box and Time tabs and the box renders (unmasked — that's expected until Task 7).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Remove retired box-edge-mask frontend UI (Mask tab, BoxMask, mask-line-guide)"
```

---

## Task 7: Live mask rendering — CSS mask-image + rubylith edit view

**Files:**
- Modify: `static/video-box-preview.js`, `static/image-box-preview.js`

**Interfaces:**
- Consumes: `ShapeMask.localRect`/`cssMaskImage`/`cssInverseMaskImage` (Task 2), bare global `project` (classic-script sharing), `VideoBoxLayer.mask_shape_id`/`ImageBoxLayer.mask_shape_id` (Task 1).
- Produces: `VideoBoxPreview.setActiveMaskShapeId(shapeId | null)`, `ImageBoxPreview.setActiveMaskShapeId(shapeId | null)` — called by Task 9's mask-panel wiring whenever a mask shape becomes/stops being selected.

- [ ] **Step 1: Add the rubylith overlay + mask-image rendering to `video-box-preview.js`**

In `static/video-box-preview.js`, add module state near the top (alongside `selectedBoxId`):

```javascript
  let activeMaskShapeId = null; // shape id currently being edited as a mask (rubylith view); set by panel-shape.js via setActiveMaskShapeId
  const rubylithOverlays = new Map(); // boxId -> <div>, the translucent red "what gets cut" overlay shown only while its mask shape is selected
```

Add a helper (near `boxEnd`):

```javascript
  function maskingShapeFor(v) {
    if (!v.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === v.mask_shape_id) || null;
  }

  function syncMaskRendering(v, video) {
    const shape = maskingShapeFor(v);
    if (!shape) {
      video.style.maskImage = "";
      video.style.webkitMaskImage = "";
      const existing = rubylithOverlays.get(v.id);
      if (existing) { existing.remove(); rubylithOverlays.delete(v.id); }
      return;
    }
    const rect = ShapeMask.localRect(v, shape);
    const maskCss = ShapeMask.cssMaskImage(v.width, v.height, rect);
    video.style.maskImage = maskCss;
    video.style.webkitMaskImage = maskCss;
    video.style.maskRepeat = "no-repeat";
    video.style.webkitMaskRepeat = "no-repeat";

    let overlay = rubylithOverlays.get(v.id);
    if (shape.id === activeMaskShapeId) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "mask-rubylith-overlay";
        overlay.style.pointerEvents = "none";
        document.getElementById("overlay").appendChild(overlay);
        rubylithOverlays.set(v.id, overlay);
      }
      overlay.style.left = video.style.left;
      overlay.style.top = video.style.top;
      overlay.style.width = video.style.width;
      overlay.style.height = video.style.height;
      overlay.style.zIndex = "9999";
      const inverseCss = ShapeMask.cssInverseMaskImage(v.width, v.height, rect);
      overlay.style.maskImage = inverseCss;
      overlay.style.webkitMaskImage = inverseCss;
      overlay.style.maskRepeat = "no-repeat";
      overlay.style.webkitMaskRepeat = "no-repeat";
    } else if (overlay) {
      overlay.remove();
      rubylithOverlays.delete(v.id);
    }
  }
```

Replace the removed `video.style.clipPath = ...` line (where Task 6 deleted it, inside the `for (const v of videoBoxes)` loop, right after `video.style.zIndex = String(v.z_index);`) with:

```javascript
      syncMaskRendering(v, video);
```

Add cleanup in the `for (const [id, video] of mounted)` removal loop (alongside `unmountHandles(id)`):

```javascript
        const overlay = rubylithOverlays.get(id);
        if (overlay) { overlay.remove(); rubylithOverlays.delete(id); }
```

Add the setter and expose it, alongside `setOnActivate`:

```javascript
  function setActiveMaskShapeId(shapeId) {
    activeMaskShapeId = shapeId || null;
  }
```

Update the returned object: `return { render, setSelectedVideoBox, setOnActivate, setActiveMaskShapeId };`

- [ ] **Step 2: Apply the same changes to `image-box-preview.js`**

Identical structure — `img` in place of `video`, `imageBoxes` in place of `videoBoxes`, `boxEnd(b)` already exists. Same `maskingShapeFor`, `syncMaskRendering`, `setActiveMaskShapeId`, rubylith cleanup.

- [ ] **Step 3: Add the rubylith CSS class**

Add to `static/css/components/stage.css`, near the existing `.video-box`/`.image-box`/`.shape-box` rules (around line 90):

```css
.mask-rubylith-overlay {
  position: absolute;
  background-color: rgba(255, 0, 0, 0.5);
}
```

- [ ] **Step 4: Update the header comments**

`static/video-box-preview.js`'s header (lines 1–13) should describe the new mask rendering instead of the retired one:

```javascript
// Stage preview for video-box (picture-in-picture) layers: mounts one <video> element per
// visible box into #overlay (a sibling of preview.js's text-block divs — both set an explicit
// CSS z-index from their model's z_index so stacking follows the project's cross-layer
// z-order), keeps each element's position/size/currentTime in sync with the timeline clock,
// and wires drag-to-move (UI.videoBoxDrag)/resize (UI.resizeHandles) onto the selected box.
// Exposes window.VideoBoxPreview.{render, setSelectedVideoBox, setOnActivate,
// setActiveMaskShapeId}. Muted always (no PiP audio).
// Shape-as-mask (layer-masking-system): a box with mask_shape_id set looks up that ShapeLayer
// in the (bare-global, classic-script-shared) project.shapes, computes its rect in the box's
// local coordinate space via ShapeMask.localRect, and applies it as a CSS mask-image
// (ShapeMask.cssMaskImage) — soft-alpha, respecting the shape's opacity and corner_radius,
// unlike the retired box-edge-mask's hard clip-path. While the masking shape is the currently
// selected layer (setActiveMaskShapeId, called by panel-shape.js), an additional translucent
// red "rubylith" overlay div is drawn over the box showing exactly what the mask cuts away
// (ShapeMask.cssInverseMaskImage), matching Photoshop's quick-mask convention.
```

Mirror the equivalent update in `static/image-box-preview.js`'s header.

- [ ] **Step 5: Manual verification**

Start the dev server, on a throwaway project add a video box, use the browser console to set `project.video_boxes[0].mask_shape_id` to an existing shape's id (or wait for Task 9's UI), call `renderTimeline()` and `VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime())`, confirm the box is visually clipped to the shape's rounded-rect region. Call `VideoBoxPreview.setActiveMaskShapeId(<shape id>)` and re-render; confirm the red rubylith tint appears over the cut region.

- [ ] **Step 6: Commit**

```bash
git add static/video-box-preview.js static/image-box-preview.js static/css/components/stage.css
git commit -m "Render shape-as-mask via CSS mask-image + rubylith edit-view overlay"
```

---

## Task 8: Exclude mask shapes from the normal overlay stack

**Files:**
- Modify: `static/timeline-overlay-layers.js`
- Modify: `static/shape-preview.js`
- Create: `tests/js/timeline-overlay-layers.test.js` (if no existing test file covers `mergedEntries`; check first)

**Interfaces:**
- Consumes: `VideoBoxLayer.mask_shape_id`, `ImageBoxLayer.mask_shape_id`.
- Produces: `OverlayLayers.mergedEntries(project)` no longer includes a shape referenced by any box's `mask_shape_id`. `ShapePreview.render` no longer mounts a `<div class="shape-box">` for a mask shape unless it is the currently selected/edited one.

- [ ] **Step 1: Check for an existing test file**

Run: `Get-ChildItem tests\js\*overlay-layers*` (or `ls tests/js/*overlay-layers*`). If `tests/js/timeline-overlay-layers.test.js` already exists, add to it; otherwise create it fresh with the header:

```javascript
// Tests for window.OverlayLayers.mergedEntries/renumber (static/timeline-overlay-layers.js).
require("../../static/timeline-overlay-layers.js");
const { test } = require("node:test");
const assert = require("node:assert");
```

(Match whatever `require`/import style other files in `tests/js/` use — check `tests/js/timeline-slice.test.js`'s top for the exact pattern before writing this.)

- [ ] **Step 2: Write the failing test**

```javascript
test("mergedEntries excludes a shape used as a box's mask", () => {
  const project = {
    text_blocks: [],
    video_boxes: [{ id: "box1", z_index: 5, mask_shape_id: "mask-shape" }],
    image_boxes: [],
    shapes: [
      { id: "mask-shape", z_index: -1 },
      { id: "visible-shape", z_index: 2 },
    ],
  };
  const entries = OverlayLayers.mergedEntries(project);
  assert.deepStrictEqual(entries.map((e) => e.id).sort(), ["box1", "visible-shape"].sort());
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/js/timeline-overlay-layers.test.js`
Expected: FAIL — `mask-shape` still appears in `entries`.

- [ ] **Step 4: Update `mergedEntries`**

In `static/timeline-overlay-layers.js`, replace `mergedEntries`:

```javascript
  function mergedEntries(project) {
    const maskShapeIds = new Set(
      [...(project.video_boxes || []), ...(project.image_boxes || [])]
        .map((b) => b.mask_shape_id)
        .filter(Boolean),
    );
    const text = (project.text_blocks || []).map((b) => ({ id: b.id, kind: "text", item: b }));
    const boxes = (project.video_boxes || []).map((v) => ({ id: v.id, kind: "video_box", item: v }));
    const imageBoxes = (project.image_boxes || []).map((i) => ({ id: i.id, kind: "image_box", item: i }));
    const shapes = (project.shapes || [])
      .filter((s) => !maskShapeIds.has(s.id))
      .map((s) => ({ id: s.id, kind: "shape", item: s }));
    return [...text, ...boxes, ...imageBoxes, ...shapes].sort((a, b) => (b.item.z_index ?? 0) - (a.item.z_index ?? 0));
  }
```

Update the file's header comment (line 1–6) to mention the exclusion: append a sentence — `"A shape referenced by some box's mask_shape_id is a mask source, not an overlay layer, and is excluded from mergedEntries — see the layer-masking-system feature."`

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/js/timeline-overlay-layers.test.js`
Expected: PASS

- [ ] **Step 6: Exclude mask shapes from `ShapePreview.render`**

In `static/shape-preview.js`, add near the top of `render(shapes, timelineTime)` (right after `const activeIds = new Set();`):

```javascript
    const maskShapeIds = new Set(
      [...(project.video_boxes || []), ...(project.image_boxes || [])]
        .map((b) => b.mask_shape_id)
        .filter(Boolean),
    );
```

Change the loop condition: `for (const s of shapes) {` becomes:

```javascript
    for (const s of shapes) {
      if (maskShapeIds.has(s.id) && s.id !== selectedShapeId) continue;
```

(A mask shape still renders normally via `ShapePreview` while it IS the selected shape — Task 7's rubylith design and the spec both require the mask shape to render exactly like a normal shape when selected. It's excluded only when NOT selected, i.e. from the normal always-visible overlay stack.)

Update the file's header comment to note this: append `"A shape referenced by some box's mask_shape_id only renders here while it is itself the selected shape (mask-edit mode) — otherwise it's a hidden mask source, composited via video-box-preview.js/image-box-preview.js instead."`

- [ ] **Step 7: Run the frontend test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add static/timeline-overlay-layers.js static/shape-preview.js tests/js/timeline-overlay-layers.test.js
git commit -m "Exclude mask-referenced shapes from the normal overlay stack and shape preview"
```

---

## Task 9: Timeline accordion — nested mask lane, type gallery, assign/select flow

**Files:**
- Create: `static/ui-mask-type-gallery.js`
- Create: `static/css/components/mask-type-gallery.css`
- Modify: `static/timeline.js` (`renderOverlaysRow`)
- Modify: `static/index.html` (script/stylesheet tags)

**Interfaces:**
- Consumes: `UI.icon`, `UI.button`, `ShapePanel.createShapeAt` (existing), `OverlayLayers.mergedEntries` (Task 8).
- Produces: `UI.maskTypeGallery(container, types, onSelect)`; the overlays row renders a chevron + nested sub-lane for every `video_box`/`image_box` entry.

- [ ] **Step 1: Add the `venetian-mask` icon**

In `static/ui-icon.js`'s `ICON_PATHS` map, add (verified against Lucide's `venetian-mask` icon, 24x24 viewBox):

```javascript
  "venetian-mask": '<path d="M20.6 11a1.9 1.9 0 0 0-1.6-2A2.9 2.9 0 0 0 16.3 2c-1.4.2-2.9 1.2-4.3 1.2S9.1 2.2 7.7 2A2.9 2.9 0 0 0 5 9a1.9 1.9 0 0 0-1.6 2 12 12 0 0 0-.4 3v2a8 8 0 0 0 16 0v-2a12 12 0 0 0-.4-3"/><path d="M4 8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1"/><path d="M20 8a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1"/><path d="M6.3 15c.4 1.5 2.6 3 5.7 3s5.3-1.5 5.7-3"/>',
```

- [ ] **Step 2: Write the mask type gallery component**

Create `static/ui-mask-type-gallery.js`:

```javascript
// UI.maskTypeGallery(container, types, onSelect): renders a small card grid for choosing what
// kind of layer to use as a mask (layer-masking-system feature, "+ Add mask" flow). types is
// [{value, icon, label}]; only "shape" exists today, but the grid pattern is built generically
// so text/person mask sources can be added later as more cards without restructuring this.
window.UI = window.UI || {};

window.UI.maskTypeGallery = function maskTypeGallery(container, types, onSelect) {
  container.innerHTML = "";
  container.classList.add("mask-type-gallery");
  types.forEach((t) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mask-type-gallery-card";
    card.innerHTML = `${UI.icon(t.icon, { size: 20 })}<span>${t.label}</span>`;
    card.addEventListener("click", () => onSelect(t.value));
    container.appendChild(card);
  });
};
```

- [ ] **Step 3: Add the gallery CSS**

Create `static/css/components/mask-type-gallery.css`:

```css
.mask-type-gallery {
  display: flex;
  gap: 8px;
  padding: 8px;
}

.mask-type-gallery-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  background: var(--panel-bg, #1a1a1a);
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.mask-type-gallery-card:hover {
  border-color: var(--accent-color, #4c6fff);
}
```

(If `--border-color`/`--panel-bg`/`--accent-color` aren't the actual token names in `static/css/tokens.css`, replace them with the real token names — check `static/css/tokens.css` before finalizing this file, matching whatever the rest of `style-panel.css` uses for card borders/backgrounds.)

- [ ] **Step 4: Wire the script/stylesheet tags**

In `static/index.html`, add `<link rel="stylesheet" href="/static/css/components/mask-type-gallery.css">` alongside the other component stylesheet links (near where `mask-line-guide.css` used to be), and `<script src="/static/ui-mask-type-gallery.js"></script>` alongside the other `ui-*.js` script tags (before `timeline.js`, since `timeline.js` will call it).

- [ ] **Step 5: Add the accordion state and rendering to `timeline.js`**

In `static/timeline.js`, add module state near the top (alongside `manualZoom`):

```javascript
  const expandedMaskAccordions = new Set(); // ids of video_box/image_box entries whose mask accordion is expanded
```

Add a helper near `renderOverlaysRow`:

```javascript
  // A video_box/image_box entry's target box object, for mask lookups.
  function maskShapeFor(project, box) {
    if (!box.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === box.mask_shape_id) || null;
  }
```

In `renderOverlaysRow`, after the existing per-entry lane-building block (right after `labelContainer.appendChild(laneLabel);` and the `laneTrack`/block-building code for that entry, i.e. after the `if/else if/else` chain that builds the entry's own block — insert this at the end of the `for (const entry of entries)` loop body, before its closing brace):

```javascript
      if (entry.kind === "video_box" || entry.kind === "image_box") {
        const box = entry.item;
        const expanded = expandedMaskAccordions.has(entry.id);
        const chevron = document.createElement("span");
        chevron.className = "overlay-lane-mask-chevron";
        chevron.innerHTML = UI.icon(expanded ? "chevron-down" : "chevron-right", { size: 12 });
        chevron.title = "Mask";
        chevron.addEventListener("click", (e) => {
          e.stopPropagation();
          if (expanded) expandedMaskAccordions.delete(entry.id); else expandedMaskAccordions.add(entry.id);
          renderTimeline();
        });
        laneLabel.appendChild(chevron);

        if (expanded) {
          const maskLabel = document.createElement("div");
          maskLabel.className = "row-label overlay-lane-label overlay-lane-label-mask";
          const maskShape = maskShapeFor(project, box);
          if (maskShape) {
            maskLabel.innerHTML = `<span class="overlay-lane-handle">${UI.icon("venetian-mask", { size: 14 })}</span>`;
            const text = document.createElement("span");
            text.className = "overlay-lane-label-text";
            text.textContent = "MASK";
            text.addEventListener("click", () => onSelect({ type: "shape", item: maskShape }));
            maskLabel.appendChild(text);
          } else {
            maskLabel.textContent = "";
          }
          labelContainer.appendChild(maskLabel);

          const maskTrack = document.createElement("div");
          maskTrack.className = "row-track overlay-lane-track overlay-lane-track-mask";
          row.appendChild(maskTrack);

          if (maskShape) {
            const isSel = !!selected && selected.type === "shape" && !!selected.item && selected.item.id === maskShape.id;
            addBlock(maskTrack, 0, 120, "Mask", isSel, () => onSelect({ type: "shape", item: maskShape }));
          } else {
            const addBtn = document.createElement("div");
            addBtn.className = "mask-add-gallery-wrap";
            UI.maskTypeGallery(addBtn, [{ value: "shape", icon: "square", label: "Shape" }], (kind) => {
              if (kind !== "shape") return;
              const newShape = ShapePanel.createShapeAt({ x: box.x, y: box.y, width: box.width, height: box.height, start: box.start });
              box.mask_shape_id = newShape.id;
              saveProject();
              onSelect({ type: "shape", item: newShape });
              renderTimeline();
            });
            maskTrack.appendChild(addBtn);
          }
        }
      }
```

- [ ] **Step 6: Add the chevron/accordion/gallery CSS**

Add to `static/css/components/timeline.css`, near the other `.overlay-lane-*` rules:

```css
.overlay-lane-mask-chevron {
  cursor: pointer;
  display: inline-flex;
  margin-left: 4px;
}

.overlay-lane-label-mask {
  padding-left: 20px; /* indent under its parent lane */
}

.overlay-lane-track-mask {
  opacity: 0.9;
}

.mask-add-gallery-wrap {
  display: flex;
  align-items: center;
  height: 100%;
}
```

- [ ] **Step 7: Add `chevron-down`/`chevron-right` icons if missing**

Check whether `chevron-down`/`chevron-right` already exist in `static/ui-icon.js`'s `ICON_PATHS` (grep the file). If not, add them (verified Lucide path data):

```javascript
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
```

- [ ] **Step 8: Manual verification**

Start the dev server, on a throwaway project add a video box (via the FILES panel's PIP icon), select it, expand its new chevron in the timeline overlays row, click the Shape card, confirm: a new shape is created sized to the box, `#panel-shape` opens, the stage shows the shape (normal rendering) plus the red rubylith tint on the box. Collapse/re-expand the accordion; confirm the nested MASK lane persists and clicking it reselects the shape.

- [ ] **Step 9: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q` and `node --test "tests/js/**/*.test.js"`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add static/ui-mask-type-gallery.js static/css/components/mask-type-gallery.css static/timeline.js static/index.html static/ui-icon.js static/css/components/timeline.css
git commit -m "Add timeline mask accordion: nested mask lane, type gallery, create/select flow"
```

---

## Task 10: Cascade delete + mask deselect wiring

**Files:**
- Modify: `static/panel-shape.js` (delete clears the owning box's `mask_shape_id`; selecting/deselecting a mask shape calls `setActiveMaskShapeId`)
- Modify: `static/panel-video-box.js`, `static/panel-image-box.js` (deleting the target box also deletes its mask shape)

**Interfaces:**
- Consumes: `VideoBoxPreview.setActiveMaskShapeId`, `ImageBoxPreview.setActiveMaskShapeId` (Task 7).
- Produces: no orphaned mask shapes after any delete path; rubylith view activates/deactivates correctly as selection changes.

- [ ] **Step 1: Write the failing test**

There is no existing JS test harness for `panel-shape.js` (it's DOM-heavy, not a pure module — matching this codebase's stated pattern of leaving thin UI-wiring files manually verified rather than unit tested, per the "Shared style sections" inventory entry's stated gap). Skip an automated test for this task; verify manually in Step 5. This is a deliberate, stated decision (per the spec's Section 6 and this codebase's CLAUDE.md policy on untestable UI layers), not a silent gap.

- [ ] **Step 2: Update `panel-shape.js`'s delete handler to cascade**

In `static/panel-shape.js`, replace the delete handler inside `renderDetail` (lines 83–88):

```javascript
    document.getElementById("shape-delete").onclick = async () => {
      project.shapes = project.shapes.filter((s) => s.id !== shape.id);
      // If this shape was acting as a mask for a video/image box, clear that reference so the
      // accordion collapses back to "+ Add mask" instead of pointing at a deleted shape.
      (project.video_boxes || []).forEach((v) => { if (v.mask_shape_id === shape.id) v.mask_shape_id = null; });
      (project.image_boxes || []).forEach((b) => { if (b.mask_shape_id === shape.id) b.mask_shape_id = null; });
      VideoBoxPreview.setActiveMaskShapeId(null);
      ImageBoxPreview.setActiveMaskShapeId(null);
      await saveProject();
      repaintStage();
      renderTimeline();
      openFilesPanel();
    };
```

- [ ] **Step 3: Wire `setActiveMaskShapeId` on select/deselect**

In `static/panel-shape.js`'s `render(selectedId)` function, after `lastSelectedId = shape.id;` (and before `renderDetail(shape)`), add:

```javascript
    const masksVideoBox = (project.video_boxes || []).some((v) => v.mask_shape_id === shape.id);
    const masksImageBox = (project.image_boxes || []).some((b) => b.mask_shape_id === shape.id);
    VideoBoxPreview.setActiveMaskShapeId(masksVideoBox ? shape.id : null);
    ImageBoxPreview.setActiveMaskShapeId(masksImageBox ? shape.id : null);
    VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
    ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
```

Also handle deselection — in the `if (!shape) { ... }` early-return branch (right after `ShapePreview.setSelectedShape(null, null);`), add:

```javascript
      VideoBoxPreview.setActiveMaskShapeId(null);
      ImageBoxPreview.setActiveMaskShapeId(null);
      VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
      ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
```

- [ ] **Step 4: Cascade-delete the mask when its target box is deleted**

In `static/panel-video-box.js`'s `renderDetail`, update the delete handler (lines 155–160):

```javascript
    document.getElementById("video-box-delete").onclick = async () => {
      if (box.mask_shape_id) {
        project.shapes = project.shapes.filter((s) => s.id !== box.mask_shape_id);
      }
      project.video_boxes = project.video_boxes.filter((b) => b.id !== box.id);
      await saveProject();
      repaintStage();
      openFilesPanel();
    };
```

Apply the identical change to `static/panel-image-box.js`'s delete handler (lines 153–158), reading `box.mask_shape_id` and filtering `project.image_boxes`.

- [ ] **Step 5: Manual verification**

On a throwaway project: create a masked video box (per Task 9's flow), confirm `#panel-shape` shows the mask shape and the rubylith renders. Click away to select something else, confirm the rubylith disappears and the box just shows clipped (no red). Re-select the mask shape and delete it — confirm the accordion collapses to "+ Add mask" and the box renders fully unmasked. Re-add a mask, then delete the target VIDEO BOX itself from its own panel — confirm the mask shape is also gone from `project.shapes` (check via `project.shapes` in the browser console) and no orphaned shape reappears in the FILES/overlay list.

- [ ] **Step 6: Run the full test suite one more time**

Run: `.venv/Scripts/python -m pytest -q` and `node --test "tests/js/**/*.test.js"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add static/panel-shape.js static/panel-video-box.js static/panel-image-box.js
git commit -m "Cascade-delete masks with their target box; wire rubylith activation on select/deselect"
```

---

## Task 11: Codebase map update

**Files:**
- Modify: `CLAUDE.md` (project-level, the "Codebase map" section)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: an accurate map reflecting every file added/removed/changed by Tasks 1–10.

- [ ] **Step 1: Update the File structure tree**

In the project `CLAUDE.md`'s File structure tree:
- Remove the `box_mask.py`/`mask_image.py` entries under `app/`.
- Add `shape_mask.py` (pure geometry) and note the `write_shape_mask_png` addition to `shape_render.py`'s entry.
- Remove `box-mask.js`/`ui-mask-line-drag.js`/`mask-line-guide.css` entries under `static/`.
- Add `shape-mask.js`, `ui-mask-type-gallery.js`, `mask-type-gallery.css` entries.
- Update `video-box-preview.js`/`image-box-preview.js` entries to describe the new mask rendering instead of the retired edge-mask one.
- Update `panel-video-box.js`/`panel-image-box.js` entries to drop the "Mask (EDGE MASK)" tab mention (now Box + Time only).
- Update `timeline.js`'s entry to mention the mask accordion.
- Update `timeline-overlay-layers.js`'s entry to mention mask-shape exclusion.
- Update `shape-preview.js`'s entry to mention mask-shape exclusion (renders only when selected).
- Update `panel-shape.js`'s entry to mention cascade-delete + `setActiveMaskShapeId` wiring.

- [ ] **Step 2: Update the "Box edge mask" inventory section**

Rename the "### Box edge mask (straight-line cut)" section to "### Layer masking system (shape-as-mask)" and rewrite its contents to describe: `mask_shape_id` on `VideoBoxLayer`/`ImageBoxLayer`; `app/shape_mask.py`/`static/shape-mask.js`; `write_shape_mask_png`; the timeline accordion + type gallery; the rubylith edit view; cascade delete. Follow the existing section's level of detail (file names + one-line purpose each, matching the rest of the map's style).

- [ ] **Step 3: Update the "Video & image boxes" inventory section**

Where it currently references `mask_enabled`/`mask_angle`/`mask_offset`/`mask_flip` (the field list for `VideoBoxLayer`/`ImageBoxLayer`), update to `mask_shape_id`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Codebase map: document layer masking system, remove retired edge-mask entries"
```

---

## Task 12: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend + frontend test run**

Run: `.venv/Scripts/python -m pytest -q`
Run: `node --test "tests/js/**/*.test.js"`
Expected: both fully green.

- [ ] **Step 2: Live walkthrough on a throwaway project**

Start the dev server. On a throwaway project (never a real one — the app's unload autosave flushes in-memory edits to disk):
1. Add a video clip to the MAIN sequence, add a second video clip as a VIDEO BOX (picture-in-picture).
2. Select the video box, expand its mask accordion, click "+ Add mask" → Shape.
3. Confirm the new shape appears on stage with resize handles, and the video box underneath shows the red rubylith tint in the cut-away region.
4. Drag/resize the mask shape; confirm the rubylith tint tracks the shape's new geometry live.
5. Adjust the mask shape's Opacity (Style tab) to 50%; confirm the video box's masked-out region becomes semi-transparent rather than fully cut, and the rubylith tint dims correspondingly.
6. Adjust Corner radius; confirm the mask's corners round on stage.
7. Click away (select a different layer); confirm the rubylith disappears and the box shows a clean rounded-rect crop.
8. Export the project; confirm the exported mp4 shows the video box correctly masked to the shape's rounded-rect region at the configured opacity.
9. Delete the mask shape from its own panel; confirm the box returns to fully unmasked and the accordion shows "+ Add mask" again.
10. Re-add a mask, then delete the video box itself; confirm no orphaned shape remains in `project.shapes` (check via browser devtools).

- [ ] **Step 3: Report results**

Summarize pass/fail for each verification point above. If anything fails, return to the relevant task and fix before considering the feature complete.

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-01-layer-masking-system-design.md` maps to a task — data model (Task 1), timeline UI/accordion (Task 9), mask subpanel reuse (confirmed via Task 9 reusing `ShapePanel.render`, no new subpanel component built), rendering (Tasks 7–8), export pipeline (Tasks 3–5), removed files (Tasks 5–6), testing/cascade-delete (Tasks 1–4, 10, 12).
- **Type consistency:** `mask_shape_id` (Python) / `mask_shape_id` (JS, same key — plain JSON field, no camelCase translation since it round-trips through `saveProject`/`fetch` as raw JSON) used consistently from Task 1 through Task 10. `ShapeMask.localRect` return shape (`relX`/`relY`/`width`/`height`/`opacity`/`cornerRadius`) matches its Python mirror's `rel_x`/`rel_y`/`width`/`height`/`opacity`/`corner_radius` (same values, JS camelCase vs. Python snake_case per each language's own convention, exactly like `BoxMask`'s prior pattern).
- **No placeholders:** every step has literal file paths, code, or exact verification commands. Task 10 explicitly states why it has no automated test (matching this codebase's own documented policy for thin DOM-wiring files) rather than silently skipping one.
