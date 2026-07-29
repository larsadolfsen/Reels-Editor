# Straight-edge mask for video & image boxes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Video Box or Image Box be cut along one straight line, hiding one side so the layers beneath show through — live on the stage and burned into the exported mp4.

**Architecture:** One pure geometry function, `mask_polygon(width, height, angle, offset, flip)`, mirrored in Python (`app/box_mask.py`) and JS (`static/box-mask.js`), returns the kept region of a box as a clockwise polygon in box-local px. The preview turns that polygon into a CSS `clip-path`; the export turns it into a Pillow-drawn RGBA PNG that ffmpeg `alphaextract`s and `alphamerge`s onto the box's scaled stream just before the existing `overlay`. Four defaulted fields on `VideoBoxLayer`/`ImageBoxLayer` carry the parameters; with `mask_enabled` false every code path is byte-identical to today's.

**Tech Stack:** Python 3.12 + Pydantic v2 + FastAPI (backend), Pillow (mask PNG, already a dependency via `app/font_metrics.py`), ffmpeg filter_complex (export), framework-free browser JS with no build step (frontend), pytest (tests), Node (JS-parity test driver only, never at runtime).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-box-edge-mask-design.md`. It is approved; do not redesign.
- `mask_enabled = False` (or absent) must produce **exactly** today's behavior in preview and a **byte-identical** ffmpeg command in export.
- One straight line only. No curves, no multi-segment shapes, no feathered edges, no time animation, no ML segmentation, no masking of main VIDEO-sequence clips.
- Both `VideoBoxLayer` and `ImageBoxLayer` get every part of the feature. Their code mirrors each other throughout this codebase; keep it mirrored.
- The Python and JS geometry implementations must not drift. Any change to one is a change to both, pinned by `tests/test_box_mask_js.py`.
- No new runtime dependencies, no build step, no bundler. Icon SVGs are hand-inlined [Lucide](https://lucide.dev) paths in the existing `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` wrapper style.
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — styling lives in `static/css/components/**` as classes. (Setting `el.style.<prop>` from JS for computed geometry is existing practice in the preview modules and is fine.)
- Every new `static/*.js` and `static/css/**/*.css` file opens with a one- or two-line comment stating its role. Every new `app/*.py` file opens with a 2–3 line header comment.
- Every commit that adds, moves, renames, or deletes a file must update the codebase map + inventory in `CLAUDE.md` in that same commit.
- Test command: `.venv/Scripts/python -m pytest -q` (run from the repo root). Run the full suite before declaring a task done.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `app/box_mask.py` | Pure `mask_polygon()` — half-plane clip of the box rectangle. No I/O, no Pillow, no models. |
| `static/box-mask.js` | `window.BoxMask.maskPolygon` (exact mirror of the above) + `window.BoxMask.clipPath(box)`, the CSS-string formatter both preview modules share. |
| `app/mask_image.py` | `write_mask_png()` — the only place Pillow is used for masks. Built on `app.box_mask`. |
| `static/ui-mask-line-drag.js` | `UI.maskLineDrag()` — the on-stage draggable cut-line guide. Presentational only; callers own the data. |
| `static/css/components/mask-line-guide.css` | Styling for that guide. |
| `tests/test_box_mask.py` | Pins the Python geometry to hand-computed expected polygons. |
| `tests/test_box_mask_js.py` | Pins the JS geometry to the Python geometry over a shared case table, via Node. |
| `tests/test_mask_image.py` | Pins the generated PNG's size, mode, and sampled pixel alpha. |

**Modified:**

| Path | Change |
|---|---|
| `app/models.py` | Four defaulted mask fields on `VideoBoxLayer` and `ImageBoxLayer`. |
| `app/ffmpeg_cmd.py` | `video_box`/`image_box` band branches gain an optional `mask_path` chain. |
| `app/main.py` | Export route writes a mask PNG sidecar per masked band and passes its path. |
| `static/video-box-preview.js` | Applies `clip-path`; mounts the drag guide for the selected box. |
| `static/image-box-preview.js` | Same, mirrored. |
| `static/panel-video-box.js` | Third "Mask" tab: toggle / ANGLE / OFFSET / FLIP. |
| `static/panel-image-box.js` | Same, mirrored. |
| `static/index.html` | Mask tab bodies in both box panels; `<script>`/`<link>` tags for the new files. |
| `tests/test_models.py`, `tests/test_ffmpeg_cmd.py`, `tests/test_main.py` | New cases per task. |
| `CLAUDE.md` | Map + inventory updates, per commit. |

**Geometry convention** (used by every task — read this before writing any code):

Box-local coordinates: origin top-left, `x` right, `y` **down**. Center `c = (width/2, height/2)`. The unit normal is `n = (cos θ, sin θ)` with `θ = radians(angle)`, so `angle = 0` gives `n = (1, 0)` — a **vertical** line at `x = width/2 + offset` — and increasing `angle` rotates the line clockwise on screen. The kept region is `dot(n, p - c) <= offset`; `flip` negates both `n` and `offset`, so one code path serves both sides.

---

### Task 1: Line math — `app/box_mask.py` + `static/box-mask.js`

**Files:**
- Create: `app/box_mask.py`
- Create: `static/box-mask.js`
- Create: `tests/test_box_mask.py`
- Create: `tests/test_box_mask_js.py`
- Modify: `static/index.html` (add the `<script>` tag)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `app.box_mask.mask_polygon(width: float, height: float, angle: float, offset: float, flip: bool) -> list[tuple[float, float]]` — clockwise vertices of the kept region in box-local px, each coordinate clamped to `[0, width]`/`[0, height]` and rounded to 6 decimals. `[]` when nothing is kept; `[(0,0), (width,0), (width,height), (0,height)]` when everything is kept.
  - `window.BoxMask.maskPolygon(width, height, angle, offset, flip) -> Array<[number, number]>` — identical semantics and output.
  - `window.BoxMask.clipPath(box) -> string` — a CSS `clip-path` value in **percentages** for a box object carrying `width`, `height`, `mask_enabled`, `mask_angle`, `mask_offset`, `mask_flip`; `""` when `mask_enabled` is falsy.

**Note on `clipPath` returning percentages:** the spec describes scaling canvas px to on-stage px. Percentages are equivalent and strictly better here — the value stays correct when the stage resizes, so no recompute is needed on resize. This is the only deviation from the spec's literal wording and it changes nothing observable.

- [ ] **Step 1: Write the failing Python test**

Create `tests/test_box_mask.py`:

```python
# Tests for app.box_mask.mask_polygon: the pure straight-line cut geometry shared by the
# stage preview (static/box-mask.js) and the export mask PNG (app/mask_image.py).
from app.box_mask import mask_polygon

W, H = 100.0, 200.0   # a tall box, so vertical and horizontal cuts give distinguishable answers

def test_vertical_cut_keeps_left_half():
    assert mask_polygon(W, H, 0, 0, False) == [(0.0, 0.0), (50.0, 0.0), (50.0, 200.0), (0.0, 200.0)]

def test_flip_keeps_the_other_side():
    assert mask_polygon(W, H, 0, 0, True) == [(50.0, 0.0), (100.0, 0.0), (100.0, 200.0), (50.0, 200.0)]

def test_offset_shifts_the_cut_line_along_its_normal():
    assert mask_polygon(W, H, 0, 25, False) == [(0.0, 0.0), (75.0, 0.0), (75.0, 200.0), (0.0, 200.0)]

def test_ninety_degrees_is_a_horizontal_cut_keeping_the_top():
    assert mask_polygon(W, H, 90, 0, False) == [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)]

def test_angled_cut_produces_a_clipped_quad():
    # 45 deg through the center: kept region is x + y <= 150
    assert mask_polygon(W, H, 45, 0, False) == [(0.0, 0.0), (100.0, 0.0), (100.0, 50.0), (0.0, 150.0)]

def test_line_entirely_outside_keeps_the_whole_box():
    assert mask_polygon(W, H, 0, 1000, False) == [(0.0, 0.0), (100.0, 0.0), (100.0, 200.0), (0.0, 200.0)]

def test_line_entirely_outside_the_other_way_keeps_nothing():
    assert mask_polygon(W, H, 0, -1000, False) == []

def test_every_vertex_stays_within_the_box_bounds():
    poly = mask_polygon(W, H, 30, 12.5, True)
    assert poly
    assert all(0.0 <= x <= W and 0.0 <= y <= H for x, y in poly)
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
.venv/Scripts/python -m pytest tests/test_box_mask.py -q
```

Expected: collection error — `ModuleNotFoundError: No module named 'app.box_mask'`.

- [ ] **Step 3: Write the Python implementation**

Create `app/box_mask.py`:

```python
# Pure straight-line mask geometry for video/image boxes: mask_polygon() clips the box rectangle
# by one half-plane and returns the KEPT region as a clockwise polygon in box-local px.
# Mirrored exactly in static/box-mask.js — the two are pinned together by tests/test_box_mask_js.py.
import math

def _clamped(x: float, y: float, width: float, height: float) -> tuple[float, float]:
    """Clamp a vertex into the box and round off float noise so both language mirrors agree."""
    cx = min(max(x, 0.0), width)
    cy = min(max(y, 0.0), height)
    return (round(cx, 6), round(cy, 6))

def mask_polygon(width: float, height: float, angle: float, offset: float,
                 flip: bool) -> list[tuple[float, float]]:
    """Polygon of the KEPT region of a width x height box cut by one straight line.

    Box-local coordinates: origin top-left, x right, y down. The line sits at signed
    perpendicular distance `offset` px from the box's center; `angle` is in degrees, 0 being a
    vertical line and increasing values rotating clockwise on screen. `flip` keeps the other side.

    Returns clockwise vertices clipped to the box: [] when nothing is kept, the full rectangle
    when the line misses the box on the kept side.
    """
    theta = math.radians(angle)
    nx, ny = math.cos(theta), math.sin(theta)
    if flip:
        nx, ny, offset = -nx, -ny, -offset
    cx, cy = width / 2.0, height / 2.0
    rect = [(0.0, 0.0), (float(width), 0.0), (float(width), float(height)), (0.0, float(height))]
    dists = [nx * (px - cx) + ny * (py - cy) - offset for px, py in rect]

    # Sutherland-Hodgman against a single half-plane. Emitting `cur` (rather than `next`) keeps
    # the all-inside case in the rectangle's own vertex order, and preserves clockwise winding.
    out: list[tuple[float, float]] = []
    for i in range(4):
        cur, nxt = rect[i], rect[(i + 1) % 4]
        sc, sn = dists[i], dists[(i + 1) % 4]
        if sc <= 0:
            out.append(_clamped(cur[0], cur[1], width, height))
        if (sc <= 0) != (sn <= 0):
            t = sc / (sc - sn)
            out.append(_clamped(cur[0] + t * (nxt[0] - cur[0]),
                                cur[1] + t * (nxt[1] - cur[1]), width, height))
    return out
```

- [ ] **Step 4: Run the Python test to verify it passes**

```bash
.venv/Scripts/python -m pytest tests/test_box_mask.py -q
```

Expected: `8 passed`.

- [ ] **Step 5: Write the failing JS-parity test**

Create `tests/test_box_mask_js.py`:

```python
# Pins static/box-mask.js's maskPolygon to app.box_mask.mask_polygon over one shared case table,
# by running the browser file under Node with a minimal `window` shim. Node is a dev-only tool
# here (the app itself has no build step); the test skips when node is not installed.
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.box_mask import mask_polygon

REPO_ROOT = Path(__file__).resolve().parents[1]
BOX_MASK_JS = REPO_ROOT / "static" / "box-mask.js"

# (width, height, angle, offset, flip) — the same table both implementations are checked against.
CASES = [
    (100, 200, 0, 0, False),      # vertical cut, keep left
    (100, 200, 0, 0, True),       # vertical cut, keep right
    (100, 200, 0, 25, False),     # offset along the normal
    (100, 200, 90, 0, False),     # horizontal cut, keep top
    (100, 200, 45, 0, False),     # angled cut
    (100, 200, 30, 12.5, True),   # angled + offset + flip
    (100, 200, 0, 1000, False),   # line misses the box: keep everything
    (100, 200, 0, -1000, False),  # line misses the box: keep nothing
    (1080, 1920, 17.5, -240, False),   # real canvas-sized box
    (300, 500, 135, 60, True),         # obtuse angle
]

DRIVER = """
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const window = {};
eval(src);
const cases = JSON.parse(process.argv[3]);
console.log(JSON.stringify(cases.map(c => window.BoxMask.maskPolygon(c[0], c[1], c[2], c[3], c[4]))));
"""

def test_js_mask_polygon_matches_python_on_every_case(tmp_path):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not installed; JS mirror parity not checked")
    driver = tmp_path / "driver.js"
    driver.write_text(DRIVER, encoding="utf-8")
    proc = subprocess.run(
        [node, str(driver), str(BOX_MASK_JS), json.dumps(CASES)],
        capture_output=True, text=True, check=True)
    js_results = json.loads(proc.stdout)

    assert len(js_results) == len(CASES)
    for case, js_poly in zip(CASES, js_results):
        py_poly = mask_polygon(*case)
        assert len(js_poly) == len(py_poly), f"vertex count differs for {case}"
        for (jx, jy), (px, py) in zip(js_poly, py_poly):
            # Both round to 6 decimals; the tolerance only absorbs a possible last-ulp
            # difference between the two libms' cos/sin right at a rounding boundary.
            assert jx == pytest.approx(px, abs=1e-6), f"x differs for {case}"
            assert jy == pytest.approx(py, abs=1e-6), f"y differs for {case}"
```

- [ ] **Step 6: Run it to make sure it fails**

```bash
.venv/Scripts/python -m pytest tests/test_box_mask_js.py -q
```

Expected: FAIL — `subprocess.CalledProcessError` (Node cannot read `static/box-mask.js`, which does not exist yet).

- [ ] **Step 7: Write the JS mirror**

Create `static/box-mask.js`:

```javascript
// Pure straight-line mask geometry for video/image boxes: maskPolygon() returns the KEPT region
// of a box as a clockwise polygon in box-local px (exact mirror of app/box_mask.py's
// mask_polygon — keep both in sync), and clipPath() formats it as a CSS clip-path value.
window.BoxMask = (() => {
  function clamped(x, y, width, height) {
    const cx = Math.min(Math.max(x, 0), width);
    const cy = Math.min(Math.max(y, 0), height);
    return [Math.round(cx * 1e6) / 1e6, Math.round(cy * 1e6) / 1e6];
  }

  // Box-local coordinates: origin top-left, x right, y down. The line sits at signed
  // perpendicular distance `offset` px from the box's center; `angle` is in degrees, 0 being a
  // vertical line and increasing values rotating clockwise on screen. `flip` keeps the other side.
  function maskPolygon(width, height, angle, offset, flip) {
    const theta = angle * Math.PI / 180;
    let nx = Math.cos(theta), ny = Math.sin(theta), off = offset;
    if (flip) { nx = -nx; ny = -ny; off = -off; }
    const cx = width / 2, cy = height / 2;
    const rect = [[0, 0], [width, 0], [width, height], [0, height]];
    const dists = rect.map(([px, py]) => nx * (px - cx) + ny * (py - cy) - off);

    // Sutherland-Hodgman against a single half-plane. Emitting `cur` (rather than `next`) keeps
    // the all-inside case in the rectangle's own vertex order, and preserves clockwise winding.
    const out = [];
    for (let i = 0; i < 4; i++) {
      const cur = rect[i], nxt = rect[(i + 1) % 4];
      const sc = dists[i], sn = dists[(i + 1) % 4];
      if (sc <= 0) out.push(clamped(cur[0], cur[1], width, height));
      if ((sc <= 0) !== (sn <= 0)) {
        const t = sc / (sc - sn);
        out.push(clamped(cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1]), width, height));
      }
    }
    return out;
  }

  // CSS clip-path value for a VideoBoxLayer/ImageBoxLayer-shaped object, in percentages so it
  // stays correct at any stage size. "" when the box is unmasked (caller clears the property).
  function clipPath(box) {
    if (!box || !box.mask_enabled) return "";
    const poly = maskPolygon(box.width, box.height,
      box.mask_angle || 0, box.mask_offset || 0, !!box.mask_flip);
    if (!poly.length) return "polygon(0% 0%, 0% 0%, 0% 0%)";   // nothing kept: hide the box
    const pts = poly.map(([x, y]) =>
      `${(x / box.width * 100).toFixed(4)}% ${(y / box.height * 100).toFixed(4)}%`);
    return `polygon(${pts.join(", ")})`;
  }

  return { maskPolygon, clipPath };
})();
```

- [ ] **Step 8: Run the parity test to verify it passes**

```bash
.venv/Scripts/python -m pytest tests/test_box_mask_js.py -q
```

Expected: `1 passed`.

- [ ] **Step 9: Load the new script in the page**

In `static/index.html`, find this line (around line 909):

```html
<script src="/static/video-box-preview.js"></script>
```

Insert immediately **before** it:

```html
<script src="/static/box-mask.js"></script>
```

(`box-mask.js` must load before the preview modules and panels that call it.)

- [ ] **Step 10: Update the codebase map**

In `CLAUDE.md`, under the `app/` block of the File structure tree, add after the `caption_layout.py` line:

```
  box_mask.py           # pure straight-line mask geometry (added 2026-07-29, box edge mask): mask_polygon(width, height, angle, offset, flip) -> clockwise polygon of the KEPT region in box-local px, Sutherland-Hodgman half-plane clip of the box rect; mirrored in static/box-mask.js, pinned by tests/test_box_mask_js.py
```

Under the `static/` block, add after the `caption-layout.js` line:

```
  box-mask.js           # window.BoxMask.{maskPolygon, clipPath} (added 2026-07-29, box edge mask): exact JS mirror of app/box_mask.py's mask_polygon, plus clipPath(box) formatting the polygon as a percentage-based CSS clip-path value; consumed by video-box-preview.js/image-box-preview.js
```

Under the `tests/` block, add:

```
  test_box_mask.py      # the pure polygon function: vertical/horizontal/angled cuts, flip, line-outside-both-ways, bounds clipping
  test_box_mask_js.py   # runs static/box-mask.js under Node against the same case table, pinning the JS mirror to the Python original
```

In the Inventory, add a new subsection immediately **before** "### Video & image boxes (picture-in-picture)":

```markdown
### Box edge mask (straight-line cut)

Added 2026-07-29 — see `docs/superpowers/specs/2026-07-29-box-edge-mask-design.md`. Cuts a video/image box along one straight line so the layers beneath show through ("clone yourself" without green screen or ML segmentation).

- `app/box_mask.py` / `static/box-mask.js` — `mask_polygon(width, height, angle, offset, flip)` / `BoxMask.maskPolygon(...)`: the one shared geometry function, mirrored across the two languages the same way `app/text_case.py` / `static/text-case.js` are. Returns the KEPT region as a clockwise polygon in box-local px, clipped to the box: `[]` when nothing is kept, the full rectangle when the line misses the box. `angle` is degrees with 0 = vertical and increasing rotating clockwise; `offset` is signed canvas px from the box's center, perpendicular to the line; `flip` selects the other side. `BoxMask.clipPath(box)` additionally formats that polygon as a percentage-based CSS `clip-path` value (JS only, no Python counterpart — same shape as `TextCase.cssValue`).
```

- [ ] **Step 11: Run the full suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all tests pass, including the 9 new ones.

- [ ] **Step 12: Commit**

```bash
git add app/box_mask.py static/box-mask.js tests/test_box_mask.py tests/test_box_mask_js.py static/index.html CLAUDE.md && git commit -m "feat: pure straight-line box mask geometry, mirrored in Python and JS"
```

---

### Task 2: Model fields on both box layers

**Files:**
- Modify: `app/models.py:38-61` (`VideoBoxLayer` and `ImageBoxLayer`)
- Modify: `tests/test_models.py`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing from Task 1 (the fields are independent of the geometry function).
- Produces: `mask_enabled: bool = False`, `mask_angle: float = 0.0`, `mask_offset: float = 0.0`, `mask_flip: bool = False` on both `VideoBoxLayer` and `ImageBoxLayer`. Every later task reads these exact names, both in Python and (snake_case, straight off the JSON) in JS.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_models.py`:

```python
def test_video_box_mask_fields_default_off():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920)
    assert (v.mask_enabled, v.mask_angle, v.mask_offset, v.mask_flip) == (False, 0.0, 0.0, False)

def test_image_box_mask_fields_default_off():
    b = ImageBoxLayer(media_id="m1", file_path="pic.jpg", height=1920)
    assert (b.mask_enabled, b.mask_angle, b.mask_offset, b.mask_flip) == (False, 0.0, 0.0, False)

def test_video_box_mask_fields_round_trip():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920,
                      mask_enabled=True, mask_angle=33.5, mask_offset=-120.0, mask_flip=True)
    assert VideoBoxLayer.model_validate_json(v.model_dump_json()) == v

def test_image_box_mask_fields_round_trip():
    b = ImageBoxLayer(media_id="m1", file_path="pic.jpg", height=1920,
                      mask_enabled=True, mask_angle=33.5, mask_offset=-120.0, mask_flip=True)
    assert ImageBoxLayer.model_validate_json(b.model_dump_json()) == b

def test_boxes_saved_before_the_mask_feature_load_with_the_mask_off():
    # Projects saved before this feature carry no mask_* keys at all; they must load unchanged.
    v = VideoBoxLayer.model_validate({"media_id": "m1", "file_path": "a.mp4",
                                      "out_point": 5.0, "height": 1920})
    b = ImageBoxLayer.model_validate({"media_id": "m1", "file_path": "pic.jpg", "height": 1920})
    assert v.mask_enabled is False and b.mask_enabled is False
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
.venv/Scripts/python -m pytest tests/test_models.py -q -k mask
```

Expected: FAIL — `AttributeError: 'VideoBoxLayer' object has no attribute 'mask_enabled'`.

- [ ] **Step 3: Add the fields**

In `app/models.py`, in `VideoBoxLayer`, after the `z_index` line:

```python
class VideoBoxLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    in_point: float = 0.0    # seconds into source
    out_point: float          # seconds into source (exclusive end)
    start: float = 0.0        # timeline seconds; end is always derived (start + out_point - in_point)
    x: int = 0                 # px, left edge on the 1080x1920 canvas
    y: int = 0                 # px, top edge
    width: int = 1080
    height: int                # px; set from source aspect ratio at creation, kept locked on resize
    z_index: int = -1          # new boxes default just below the default text z_index (0)
    mask_enabled: bool = False # straight-line cut of this box; False reproduces pre-feature behavior exactly
    mask_angle: float = 0.0    # degrees; 0 = vertical cut line, increasing rotates clockwise on screen
    mask_offset: float = 0.0   # signed canvas px from the box's center to the line, perpendicular to it
    mask_flip: bool = False    # which side of the line is kept
```

And the identical four lines at the end of `ImageBoxLayer`:

```python
class ImageBoxLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    start: float = 0.0        # timeline seconds
    duration: float = 3.0     # seconds the box is visible; images have no source timeline to trim
    x: int = 0                 # px, left edge on the 1080x1920 canvas
    y: int = 0                 # px, top edge
    width: int = 1080
    height: int                # px; set from the image's aspect ratio at creation, kept locked on resize
    z_index: int = -1          # same convention as VideoBoxLayer: new boxes default just below text (0)
    mask_enabled: bool = False # straight-line cut of this box; False reproduces pre-feature behavior exactly
    mask_angle: float = 0.0    # degrees; 0 = vertical cut line, increasing rotates clockwise on screen
    mask_offset: float = 0.0   # signed canvas px from the box's center to the line, perpendicular to it
    mask_flip: bool = False    # which side of the line is kept
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
.venv/Scripts/python -m pytest tests/test_models.py -q
```

Expected: all pass, including the 5 new ones.

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, in the "### Box edge mask (straight-line cut)" Inventory subsection added in Task 1, append this bullet:

```markdown
- `VideoBoxLayer` / `ImageBoxLayer` in `app/models.py` — four defaulted fields carry the cut: `mask_enabled: bool = False`, `mask_angle: float = 0.0` (degrees, 0 = vertical, increasing clockwise), `mask_offset: float = 0.0` (signed canvas px from the box's center, perpendicular to the line), `mask_flip: bool = False` (which side is kept). All defaulted, so projects saved before this feature load and behave unchanged; the line is expressed relative to the box's own center, so moving/resizing the box carries the mask with it.
```

- [ ] **Step 6: Run the full suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/models.py tests/test_models.py CLAUDE.md && git commit -m "feat: mask_enabled/angle/offset/flip fields on video and image box layers"
```

---

### Task 3: Preview clipping

**Files:**
- Modify: `static/video-box-preview.js`
- Modify: `static/image-box-preview.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `window.BoxMask.clipPath(box)` (Task 1); the four `mask_*` fields (Task 2).
- Produces: nothing new for later tasks — the `clip-path` assignment is the whole deliverable.

**Testing note (stated, not silently skipped):** this is thin DOM glue over an already-tested pure function — one property assignment per module — so it carries no automated test. It is verified manually in the browser per Step 4 below.

- [ ] **Step 1: Apply the clip-path in the video-box preview**

In `static/video-box-preview.js`, inside `render()`, find:

```javascript
      video.style.height = (v.height / 1920 * stageH) + "px";
      video.style.zIndex = String(v.z_index);
```

Replace with:

```javascript
      video.style.height = (v.height / 1920 * stageH) + "px";
      video.style.zIndex = String(v.z_index);
      // Straight-edge mask (box-mask.js): a percentage polygon, so it survives stage resizes
      // untouched. "" when the box is unmasked, which is exactly the pre-feature rendering.
      video.style.clipPath = BoxMask.clipPath(v);
```

Then update the file's header comment — append this sentence to the existing block:

```javascript
// Applies BoxMask.clipPath(box) as the element's CSS clip-path so a mask_enabled box is cut
// along its straight line (added 2026-07-29, box edge mask); unmasked boxes get "" (no clipping).
```

- [ ] **Step 2: Apply the clip-path in the image-box preview**

In `static/image-box-preview.js`, inside `render()`, find:

```javascript
      img.style.height = (b.height / 1920 * stageH) + "px";
      img.style.zIndex = String(b.z_index);
```

Replace with:

```javascript
      img.style.height = (b.height / 1920 * stageH) + "px";
      img.style.zIndex = String(b.z_index);
      // Straight-edge mask (box-mask.js): a percentage polygon, so it survives stage resizes
      // untouched. "" when the box is unmasked, which is exactly the pre-feature rendering.
      img.style.clipPath = BoxMask.clipPath(b);
```

And append the same sentence to that file's header comment:

```javascript
// Applies BoxMask.clipPath(box) as the element's CSS clip-path so a mask_enabled box is cut
// along its straight line (added 2026-07-29, box edge mask); unmasked boxes get "" (no clipping).
```

- [ ] **Step 3: Update the codebase map**

In `CLAUDE.md`, in the "### Box edge mask (straight-line cut)" Inventory subsection, append:

```markdown
- `static/video-box-preview.js` / `static/image-box-preview.js` — each `render()` sets `el.style.clipPath = BoxMask.clipPath(box)` right after the position/size/z-index assignments. A static CSS property recomputed only on render — no per-frame work, no libraries — and it composites correctly against the layers below because the boxes already live as siblings in `#overlay` with explicit z-indexes. An unmasked box gets `""`, i.e. today's exact rendering.
```

- [ ] **Step 4: Verify in the browser on a throwaway project**

Start the server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Then, at http://127.0.0.1:8000, create a **new throwaway project** (never test on real project data — the app's unload keepalive-save flushes in-memory mutations to disk), import a video, add a Video Box, then in the browser console run:

```javascript
project.video_boxes[0].mask_enabled = true;
project.video_boxes[0].mask_angle = 0;
project.video_boxes[0].mask_offset = 0;
await saveProject();
VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
```

Expected: the right half of the box disappears and the main clip shows through. Then set `mask_flip = true` and re-run the last two lines — the other half is kept instead. Repeat with an Image Box and `ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime())`.

- [ ] **Step 5: Run the full suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass (nothing Python-side changed; this confirms nothing regressed).

- [ ] **Step 6: Commit**

```bash
git add static/video-box-preview.js static/image-box-preview.js CLAUDE.md && git commit -m "feat: cut masked video and image boxes on the stage via clip-path"
```

---

### Task 4: Mask tab in both box panels

**Files:**
- Modify: `static/index.html:471-560` (both box panel sections)
- Modify: `static/panel-video-box.js`
- Modify: `static/panel-image-box.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the four `mask_*` fields (Task 2); the `clip-path` rendering (Task 3).
- Produces: `#video-box-mask-body` and `#image-box-mask-body` DOM containers, and a `renderMask(box)` function inside each panel's IIFE (module-private; nothing outside calls it).

**Testing note (stated, not silently skipped):** panel wiring is thin DOM glue — `UI.buttonGroup`/`UI.numberField` callbacks that assign a field, save, and re-render — with no logic to extract. No automated test; verified manually per Step 6.

- [ ] **Step 1: Add the Mask tab bodies to the markup**

In `static/index.html`, in the `#panel-video-box` section, find:

```html
          <div id="video-box-time-body">
            <div class="style-group-label">TIME</div>
            <div class="style-group">
              <label id="video-box-start-field"></label>
            </div>
          </div>
```

Insert immediately **after** it:

```html
          <div id="video-box-mask-body">
            <div class="style-group-label">EDGE MASK</div>
            <div class="style-group">
              <div id="video-box-mask-toggle"></div>
            </div>
            <div class="style-group">
              <div class="style-row">
                <label id="video-box-mask-angle-field"></label>
                <label id="video-box-mask-offset-field"></label>
              </div>
            </div>
            <div class="style-group">
              <button id="video-box-mask-flip" type="button" class="panel-button col-8">Flip side</button>
            </div>
          </div>
```

In the `#panel-image-box` section, find:

```html
          <div id="image-box-time-body">
            <div class="style-group-label">TIME</div>
            <div class="style-group">
              <div class="style-row">
                <label id="image-box-start-field"></label>
                <label id="image-box-duration-field"></label>
              </div>
            </div>
          </div>
```

Insert immediately **after** it:

```html
          <div id="image-box-mask-body">
            <div class="style-group-label">EDGE MASK</div>
            <div class="style-group">
              <div id="image-box-mask-toggle"></div>
            </div>
            <div class="style-group">
              <div class="style-row">
                <label id="image-box-mask-angle-field"></label>
                <label id="image-box-mask-offset-field"></label>
              </div>
            </div>
            <div class="style-group">
              <button id="image-box-mask-flip" type="button" class="panel-button col-8">Flip side</button>
            </div>
          </div>
```

- [ ] **Step 2: Add the Mask tab to the video-box panel**

In `static/panel-video-box.js`, after the `VIDEO_BOX_TAB_ICON_TIME` constant, add the Lucide `square-split-horizontal` icon:

```javascript
  const VIDEO_BOX_TAB_ICON_MASK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3"/><path d="M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3"/><line x1="12" x2="12" y1="4" y2="20"/></svg>';
```

Change the tabs list and panes map to:

```javascript
  const VIDEO_BOX_TABS = [
    { value: "box", icon: VIDEO_BOX_TAB_ICON_BOX, label: "Box" },
    { value: "time", icon: VIDEO_BOX_TAB_ICON_TIME, label: "Time" },
    { value: "mask", icon: VIDEO_BOX_TAB_ICON_MASK, label: "Mask" },
  ];
  const videoBoxTabPanes = {
    box: document.getElementById("video-box-box-body"),
    time: document.getElementById("video-box-time-body"),
    mask: document.getElementById("video-box-mask-body"),
  };
```

- [ ] **Step 3: Wire the video-box mask controls**

In `static/panel-video-box.js`, add this function immediately **before** `function renderDetail(box) {`:

```javascript
  // Re-renders the stage so a mask change is visible immediately, same as the X/Y/W/H fields do.
  function repaintStage() {
    VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
  }

  function renderMask(box) {
    UI.buttonGroup(document.getElementById("video-box-mask-toggle"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      box.mask_enabled ? "on" : "off",
      async (v) => {
        box.mask_enabled = v === "on";
        await saveProject();
        renderMask(box);
        repaintStage();
      });

    UI.numberField(document.getElementById("video-box-mask-angle-field"),
      { label: "ANGLE", unit: "DEG", value: box.mask_angle ?? 0, step: 1, decimals: 1, span: 4,
        disabled: !box.mask_enabled,
        onChange: async (v) => { box.mask_angle = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("video-box-mask-offset-field"),
      { label: "OFFSET", unit: "PX", value: box.mask_offset ?? 0, step: 10, span: 4,
        disabled: !box.mask_enabled,
        onChange: async (v) => { box.mask_offset = v; await saveProject(); repaintStage(); } });

    const flip = document.getElementById("video-box-mask-flip");
    flip.disabled = !box.mask_enabled;
    flip.onclick = async () => {
      box.mask_flip = !box.mask_flip;
      await saveProject();
      repaintStage();
    };
  }
```

Then, inside `renderDetail(box)`, add a call right before the `VideoBoxPreview.setSelectedVideoBox(box.id, {` line:

```javascript
    renderMask(box);
```

And update the file's header comment — change the first sentence's tab list to read `into Box (SIZE & POSITION + TRIM), Time (START) and Mask (EDGE MASK) tab panes via UI.tabBar (Box default)`.

- [ ] **Step 4: Add the Mask tab to the image-box panel**

In `static/panel-image-box.js`, after the `IMAGE_BOX_TAB_ICON_TIME` constant:

```javascript
  const IMAGE_BOX_TAB_ICON_MASK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3"/><path d="M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3"/><line x1="12" x2="12" y1="4" y2="20"/></svg>';
```

Change the tabs list and panes map to:

```javascript
  const IMAGE_BOX_TABS = [
    { value: "box", icon: IMAGE_BOX_TAB_ICON_BOX, label: "Box" },
    { value: "time", icon: IMAGE_BOX_TAB_ICON_TIME, label: "Time" },
    { value: "mask", icon: IMAGE_BOX_TAB_ICON_MASK, label: "Mask" },
  ];
  const imageBoxTabPanes = {
    box: document.getElementById("image-box-box-body"),
    time: document.getElementById("image-box-time-body"),
    mask: document.getElementById("image-box-mask-body"),
  };
```

- [ ] **Step 5: Wire the image-box mask controls**

In `static/panel-image-box.js`, add this immediately **before** `function renderDetail(box) {`:

```javascript
  // Re-renders the stage so a mask change is visible immediately, same as the X/Y/W/H fields do.
  function repaintStage() {
    ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
  }

  function renderMask(box) {
    UI.buttonGroup(document.getElementById("image-box-mask-toggle"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      box.mask_enabled ? "on" : "off",
      async (v) => {
        box.mask_enabled = v === "on";
        await saveProject();
        renderMask(box);
        repaintStage();
      });

    UI.numberField(document.getElementById("image-box-mask-angle-field"),
      { label: "ANGLE", unit: "DEG", value: box.mask_angle ?? 0, step: 1, decimals: 1, span: 4,
        disabled: !box.mask_enabled,
        onChange: async (v) => { box.mask_angle = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("image-box-mask-offset-field"),
      { label: "OFFSET", unit: "PX", value: box.mask_offset ?? 0, step: 10, span: 4,
        disabled: !box.mask_enabled,
        onChange: async (v) => { box.mask_offset = v; await saveProject(); repaintStage(); } });

    const flip = document.getElementById("image-box-mask-flip");
    flip.disabled = !box.mask_enabled;
    flip.onclick = async () => {
      box.mask_flip = !box.mask_flip;
      await saveProject();
      repaintStage();
    };
  }
```

Then, inside `renderDetail(box)`, add right before the `ImageBoxPreview.setSelectedImageBox(box.id, {` line:

```javascript
    renderMask(box);
```

And update that file's header comment — change the tab list sentence to read `split into Box (SIZE & POSITION), Time (START + DURATION) and Mask (EDGE MASK) tab panes via UI.tabBar (Box default)`.

- [ ] **Step 6: Verify in the browser on a throwaway project**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

On a **throwaway project**: add a Video Box, open the VIDEO BOX panel's new **Mask** tab. Confirm: OFF/ON toggles the cut on the stage; ANGLE rotates the cut line; OFFSET slides it; "Flip side" swaps which half is kept; ANGLE/OFFSET/Flip are disabled while the toggle is OFF; reloading the page keeps every value. Repeat for an Image Box.

- [ ] **Step 7: Update the codebase map**

In `CLAUDE.md`:

1. In the "### Box edge mask (straight-line cut)" Inventory subsection, append:

```markdown
- `static/panel-video-box.js` / `static/panel-image-box.js` — a third **Mask** tab (`UI.tabBar`, beside Box and Time; `#video-box-mask-body` / `#image-box-mask-body`) holding an OFF/ON `UI.buttonGroup` bound to `mask_enabled`, ANGLE (degrees) and OFFSET (px) `UI.numberField`s — both disabled while the mask is off — and a "Flip side" `.panel-button` toggling `mask_flip`. Every control saves the project and re-renders the stage preview immediately, the same way the panels' existing X/Y/WIDTH/HEIGHT fields do.
```

2. In the File structure tree's `static/index.html` description, append to the existing 2026-07-24 sentence list: `As of 2026-07-29 (box edge mask): both box panels gained a third Mask tab body (\`#video-box-mask-body\`/\`#image-box-mask-body\`) holding the mask toggle/ANGLE/OFFSET/Flip controls.`

3. In the File structure tree, update the `panel-video-box.js` and `panel-image-box.js` lines to mention the Mask tab alongside Box and Time.

- [ ] **Step 8: Run the full suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add static/index.html static/panel-video-box.js static/panel-image-box.js CLAUDE.md && git commit -m "feat: Mask tab with toggle, angle, offset and flip in both box panels"
```

---

### Task 5: Export — mask PNG + ffmpeg alphamerge

**Files:**
- Create: `app/mask_image.py`
- Create: `tests/test_mask_image.py`
- Modify: `app/ffmpeg_cmd.py:115-140` (the `video_box` and `image_box` band branches)
- Modify: `app/main.py:246-259` (the export route's banded branch)
- Modify: `tests/test_ffmpeg_cmd.py`, `tests/test_main.py`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `app.box_mask.mask_polygon` (Task 1); the four `mask_*` fields (Task 2).
- Produces:
  - `app.mask_image.write_mask_png(path: str, width: int, height: int, angle: float, offset: float, flip: bool) -> None` — writes an RGBA PNG of exactly `width x height`, opaque white `(255, 255, 255, 255)` inside the kept polygon and fully transparent `(0, 0, 0, 0)` outside.
  - `build_export_cmd`'s band dicts accept an optional `"mask_path": str` key on `"video_box"` and `"image_box"` bands. Absent (the only case before this task) means today's exact command.

**How the ffmpeg chain works:** the mask PNG is added as a `-loop 1 -t <box duration> -i` input; `alphaextract` pulls its alpha channel into a gray stream, and `alphamerge` writes that as the box stream's alpha. It must run **before** the video-box branch's `setpts=...+start/TB` timeline offset, otherwise the box stream's timestamps (starting at `start`) and the mask stream's (starting at 0) would not line up in `alphamerge`'s frame sync. So for a masked video box the existing single `trim,setpts,scale` chain is split: `trim,setpts=PTS-STARTPTS,scale` → `alphamerge` → `setpts=PTS-STARTPTS+start/TB`. Image boxes have no timeline offset, so their chain just gains the two filters.

- [ ] **Step 1: Write the failing mask-PNG test**

Create `tests/test_mask_image.py`:

```python
# Tests for app.mask_image.write_mask_png: the export-side rasterization of app.box_mask's
# kept-region polygon into an RGBA PNG whose alpha channel ffmpeg alphaextracts.
from PIL import Image

from app.mask_image import write_mask_png

def test_png_has_the_requested_size_and_rgba_mode(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, False)
    with Image.open(path) as img:
        assert img.size == (100, 200)
        assert img.mode == "RGBA"

def test_vertical_cut_is_opaque_left_and_transparent_right(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, False)
    with Image.open(path) as img:
        assert img.getpixel((10, 100))[3] == 255    # kept side
        assert img.getpixel((90, 100))[3] == 0      # cut side

def test_flip_swaps_which_side_is_opaque(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, True)
    with Image.open(path) as img:
        assert img.getpixel((10, 100))[3] == 0
        assert img.getpixel((90, 100))[3] == 255

def test_kept_pixels_are_white(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, 0.0, False)
    with Image.open(path) as img:
        assert img.getpixel((10, 100)) == (255, 255, 255, 255)

def test_line_missing_the_box_on_the_cut_side_gives_a_fully_transparent_png(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 0.0, -1000.0, False)
    with Image.open(path) as img:
        assert img.getpixel((10, 100))[3] == 0
        assert img.getpixel((90, 100))[3] == 0

def test_horizontal_cut_is_opaque_on_top(tmp_path):
    path = tmp_path / "mask.png"
    write_mask_png(str(path), 100, 200, 90.0, 0.0, False)
    with Image.open(path) as img:
        assert img.getpixel((50, 20))[3] == 255
        assert img.getpixel((50, 180))[3] == 0
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
.venv/Scripts/python -m pytest tests/test_mask_image.py -q
```

Expected: collection error — `ModuleNotFoundError: No module named 'app.mask_image'`.

- [ ] **Step 3: Write the mask-PNG module**

Create `app/mask_image.py`:

```python
# Export-side rasterization of app.box_mask's kept-region polygon: write_mask_png() draws it with
# Pillow (already a dependency, see app/font_metrics.py) as an RGBA PNG — opaque white inside the
# kept region, fully transparent outside — for ffmpeg to alphaextract + alphamerge onto the box.
from PIL import Image, ImageDraw

from app.box_mask import mask_polygon

def write_mask_png(path: str, width: int, height: int, angle: float, offset: float,
                   flip: bool) -> None:
    """Write a width x height RGBA mask PNG for one box's straight-line cut.

    Alpha carries the mask: 255 inside the kept region, 0 outside. An empty polygon (the line
    keeps nothing) writes a fully transparent PNG, which correctly hides the box entirely.
    """
    img = Image.new("RGBA", (int(width), int(height)), (0, 0, 0, 0))
    polygon = mask_polygon(float(width), float(height), angle, offset, flip)
    if polygon:
        ImageDraw.Draw(img).polygon([(x, y) for x, y in polygon], fill=(255, 255, 255, 255))
    img.save(path)
```

- [ ] **Step 4: Run the mask-PNG test to verify it passes**

```bash
.venv/Scripts/python -m pytest tests/test_mask_image.py -q
```

Expected: `6 passed`.

- [ ] **Step 5: Write the failing ffmpeg-command tests**

Append to `tests/test_ffmpeg_cmd.py`:

```python
def test_masked_video_box_adds_one_mask_input_and_one_alphamerge():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=3,
                        start=1.0, x=100, y=200, width=300, height=500, z_index=5,
                        mask_enabled=True)
    bands = [{"kind": "video_box", "video_box": box, "mask_path": "C:/tmp/band0-mask.png"}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    assert cmd.count("C:/tmp/band0-mask.png") == 1
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert fc.count("alphamerge") == 1
    assert fc.count("alphaextract") == 1
    # alphamerge runs before the timeline offset, so both its inputs start at t=0
    assert fc.index("alphamerge") < fc.index("setpts=PTS-STARTPTS+1/TB")
    assert fc.index("alphamerge") < fc.index("overlay=x=100:y=200")

def test_masked_image_box_adds_one_mask_input_and_one_alphamerge():
    box = ImageBoxLayer(media_id="m1", file_path="pic.jpg", start=2.0, duration=4.0,
                        x=10, y=20, width=200, height=300, z_index=3, mask_enabled=True)
    bands = [{"kind": "image_box", "image_box": box, "mask_path": "C:/tmp/band0-mask.png"}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    assert cmd.count("C:/tmp/band0-mask.png") == 1
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert fc.count("alphamerge") == 1 and fc.count("alphaextract") == 1
    assert fc.index("alphamerge") < fc.index("overlay=x=10:y=20")

def test_mask_input_is_a_looped_still_matching_the_box_duration():
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=1, out_point=4,
                        start=0, height=1920, z_index=5, mask_enabled=True)
    bands = [{"kind": "video_box", "video_box": box, "mask_path": "mask.png"}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    i = cmd.index("mask.png")
    assert cmd[i - 5:i] == ["-loop", "1", "-t", "3", "-i"]   # "3" = out_point - in_point

def test_unmasked_band_command_is_unchanged_by_the_mask_feature():
    # The whole mask feature must be invisible when no box is masked: same command, byte for byte.
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", in_point=0, out_point=3,
                        start=1.0, x=100, y=200, width=300, height=500, z_index=5)
    img = ImageBoxLayer(media_id="m2", file_path="pic.jpg", start=0, duration=2.0,
                        width=100, height=100, z_index=4)
    bands = [{"kind": "video_box", "video_box": box}, {"kind": "image_box", "image_box": img}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "alphamerge" not in fc and "alphaextract" not in fc
    assert ";[2:v]trim=start=0:end=3,setpts=PTS-STARTPTS+1/TB,scale=300:500[box0]" in fc
    assert ";[vc][box0]overlay=x=100:y=200" in fc
    assert ";[3:v]scale=100:100[box1]" in fc

def test_masked_band_input_indices_stay_consistent_across_two_boxes():
    a = VideoBoxLayer(media_id="m1", file_path="a-pip.mp4", in_point=0, out_point=2,
                      start=0, height=1920, z_index=5, mask_enabled=True)
    b = VideoBoxLayer(media_id="m2", file_path="b-pip.mp4", in_point=0, out_point=2,
                      start=0, height=1920, z_index=6)
    bands = [{"kind": "video_box", "video_box": a, "mask_path": "m0.png"},
             {"kind": "video_box", "video_box": b}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    # inputs: 0 = a.mp4 clip, 1 = b.mp4 clip, 2 = a-pip.mp4, 3 = m0.png, 4 = b-pip.mp4
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[2:v]trim=start=0:end=2" in fc
    assert "[3:v]alphaextract" in fc
    assert "[4:v]trim=start=0:end=2" in fc
```

- [ ] **Step 6: Run them to make sure they fail**

```bash
.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -q -k "mask"
```

Expected: FAIL — `assert 0 == 1` on the `alphamerge` counts (the `mask_path` key is currently ignored).

- [ ] **Step 7: Add the mask chain to the band branches**

In `app/ffmpeg_cmd.py`, replace the `video_box` and `image_box` branches (currently lines 120–140) with:

```python
        elif band["kind"] == "video_box":
            v = band["video_box"]
            cmd += ["-i", v.file_path]
            box_input = next_input_index
            next_input_index += 1
            end = v.start + (v.out_point - v.in_point)
            out_label = f"[ov{step}]"
            mask_path = band.get("mask_path")
            if mask_path:
                # alphamerge must see both streams starting at t=0, so the timeline offset
                # (setpts ... +start/TB) is applied after the merge rather than before it.
                cmd += ["-loop", "1", "-t", _num(v.out_point - v.in_point), "-i", mask_path]
                mask_input = next_input_index
                next_input_index += 1
                fc += (f";[{box_input}:v]trim=start={_num(v.in_point)}:end={_num(v.out_point)},"
                       f"setpts=PTS-STARTPTS,scale={v.width}:{v.height}[boxs{step}]"
                       f";[{mask_input}:v]alphaextract[maskv{step}]"
                       f";[boxs{step}][maskv{step}]alphamerge,"
                       f"setpts=PTS-STARTPTS+{_num(v.start)}/TB[box{step}]")
            else:
                fc += (f";[{box_input}:v]trim=start={_num(v.in_point)}:end={_num(v.out_point)},"
                       f"setpts=PTS-STARTPTS+{_num(v.start)}/TB,scale={v.width}:{v.height}[box{step}]")
            fc += (f";{current}[box{step}]overlay=x={v.x}:y={v.y}:"
                   f"enable='between(t\\,{_num(v.start)}\\,{_num(end)})'{out_label}")
            current = out_label
        else:  # "image_box"
            b = band["image_box"]
            cmd += ["-loop", "1", "-t", _num(b.duration), "-i", b.file_path]
            box_input = next_input_index
            next_input_index += 1
            end = b.start + b.duration
            out_label = f"[ov{step}]"
            mask_path = band.get("mask_path")
            if mask_path:
                cmd += ["-loop", "1", "-t", _num(b.duration), "-i", mask_path]
                mask_input = next_input_index
                next_input_index += 1
                fc += (f";[{box_input}:v]scale={b.width}:{b.height}[boxs{step}]"
                       f";[{mask_input}:v]alphaextract[maskv{step}]"
                       f";[boxs{step}][maskv{step}]alphamerge[box{step}]")
            else:
                fc += f";[{box_input}:v]scale={b.width}:{b.height}[box{step}]"
            fc += (f";{current}[box{step}]overlay=x={b.x}:y={b.y}:"
                   f"enable='between(t\\,{_num(b.start)}\\,{_num(end)})'{out_label}")
            current = out_label
```

Then append to the module's header comment:

```python
# A band dict may carry an optional "mask_path" (a PNG written by app/main.py via app/mask_image.py):
# the PNG is added as a `-loop 1 -t <box duration>` input, alphaextract pulls its alpha channel out,
# and alphamerge writes it as the box stream's alpha immediately before the existing overlay — for a
# video box, before the setpts timeline offset so both alphamerge inputs start at t=0. No "mask_path"
# on any band produces a byte-identical command to the pre-mask baseline.
```

- [ ] **Step 8: Run the ffmpeg tests to verify they pass**

```bash
.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -q
```

Expected: all pass, including the 5 new ones.

- [ ] **Step 9: Write the failing export-route test**

In `tests/test_main.py`, change the model import line to add `VideoBoxLayer`:

```python
from app.models import Project, TextBlockLayer, TextPreset, MediaItem, VideoBoxLayer
```

Then append:

```python
def test_export_writes_a_mask_png_and_alphamerges_it_for_a_masked_video_box(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2.0,
                        width=300, height=500, mask_enabled=True, mask_angle=0.0,
                        mask_offset=0.0, mask_flip=False)
    p = Project(name="r", video_boxes=[box])
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        export_project(p.id)
    pngs = list((tmp_path / "exports").glob("*-mask.png"))
    assert len(pngs) == 1
    cmd = run_export.call_args[0][0]
    assert str(pngs[0]) in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "alphamerge" in fc

def test_export_writes_no_mask_png_for_an_unmasked_video_box(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    box = VideoBoxLayer(media_id="m1", file_path="pip.mp4", out_point=2.0, width=300, height=500)
    p = Project(name="r", video_boxes=[box])
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        export_project(p.id)
    assert list((tmp_path / "exports").glob("*-mask.png")) == []
    cmd = run_export.call_args[0][0]
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "alphamerge" not in fc
```

- [ ] **Step 10: Run them to make sure they fail**

```bash
.venv/Scripts/python -m pytest tests/test_main.py -q -k mask
```

Expected: the first fails with `assert 0 == 1` (no PNG written); the second passes already.

- [ ] **Step 11: Write the mask PNG in the export route**

In `app/main.py`, add `mask_image` to the module import line:

```python
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform, filmstrip, auth, auto_slice, mask_image
```

Then, in `export_project`, replace the `elif`/`else` band branches:

```python
            elif band["kind"] == "video_box":
                bands.append({"kind": "video_box", "video_box": band["video_box"]})
            else:
                bands.append({"kind": "image_box", "image_box": band["image_box"]})
```

with:

```python
            elif band["kind"] == "video_box":
                v = band["video_box"]
                entry = {"kind": "video_box", "video_box": v}
                if v.mask_enabled:
                    png = out_dir / f"{p.name}-{p.id[:8]}-band{i}-mask.png"
                    mask_image.write_mask_png(str(png), v.width, v.height,
                                              v.mask_angle, v.mask_offset, v.mask_flip)
                    entry["mask_path"] = str(png)
                bands.append(entry)
            else:
                b = band["image_box"]
                entry = {"kind": "image_box", "image_box": b}
                if b.mask_enabled:
                    png = out_dir / f"{p.name}-{p.id[:8]}-band{i}-mask.png"
                    mask_image.write_mask_png(str(png), b.width, b.height,
                                              b.mask_angle, b.mask_offset, b.mask_flip)
                    entry["mask_path"] = str(png)
                bands.append(entry)
```

- [ ] **Step 12: Run the route tests to verify they pass**

```bash
.venv/Scripts/python -m pytest tests/test_main.py -q
```

Expected: all pass, including both new ones.

- [ ] **Step 13: Update the codebase map**

In `CLAUDE.md`:

1. In the File structure tree's `app/` block, add after the `box_mask.py` line:

```
  mask_image.py         # export-side mask rasterization (added 2026-07-29, box edge mask): write_mask_png(path, width, height, angle, offset, flip) draws app/box_mask.py's kept-region polygon with Pillow as an RGBA PNG — opaque white inside, transparent outside — written next to the .ass sidecars for ffmpeg to alphaextract/alphamerge
```

2. In the `tests/` block, add `test_mask_image.py   # generated PNG size/mode plus sampled alpha on the kept and cut sides`.

3. In the "### Box edge mask (straight-line cut)" Inventory subsection, append:

```markdown
- `app/mask_image.py` — `write_mask_png(path, width, height, angle, offset, flip)`: rasterizes `mask_polygon`'s output with Pillow into a `width x height` RGBA PNG, alpha 255 inside the kept region and 0 outside. An empty polygon writes a fully transparent PNG, correctly hiding the box.
- `app/ffmpeg_cmd.py` — a `"video_box"`/`"image_box"` band dict may carry an optional `"mask_path"`. When present, the PNG is added as a `-loop 1 -t <box duration>` input, `alphaextract` pulls its alpha into a gray stream, and `alphamerge` writes that as the box stream's alpha immediately before the existing `overlay`. For a video box the merge happens **before** the `setpts=...+start/TB` timeline offset, so both `alphamerge` inputs start at t=0. Trimming, scaling, positioning, band ordering, and audio are untouched; a project with no masked box produces a byte-identical command to the pre-mask baseline.
- `app/main.py` — the export route's banded branch writes one `{name}-{id[:8]}-band{i}-mask.png` sidecar per masked box (same directory and naming convention as the `.ass` sidecars) and passes its path as the band's `"mask_path"`. Deciding *whether* a box is masked lives here; `build_export_cmd` stays pure and keys only off the presence of `"mask_path"`.
```

- [ ] **Step 14: Run the full suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass.

- [ ] **Step 15: Verify a real export end to end**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

On a **throwaway project**: add a clip, add a Video Box over it from a second clip, turn its mask ON with a vertical cut, export from the EXPORT panel, and play the resulting mp4 from `data/exports/`. Expected: the box is cut along the same line the stage showed, with the main clip visible on the other side. (This needs `ffmpeg` on PATH.)

- [ ] **Step 16: Commit**

```bash
git add app/mask_image.py app/ffmpeg_cmd.py app/main.py tests/test_mask_image.py tests/test_ffmpeg_cmd.py tests/test_main.py CLAUDE.md && git commit -m "feat: burn box edge masks into the export via alphaextract + alphamerge"
```

---

### Task 6: On-stage drag guide

**Files:**
- Create: `static/ui-mask-line-drag.js`
- Create: `static/css/components/mask-line-guide.css`
- Modify: `static/index.html` (one `<link>`, one `<script>`)
- Modify: `static/video-box-preview.js`
- Modify: `static/image-box-preview.js`
- Modify: `static/panel-video-box.js`, `static/panel-image-box.js` (re-render the panel fields after a drag)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `BoxMask` (Task 1), the `mask_*` fields (Task 2), the preview modules' selection plumbing (Task 3), the panels' `renderMask(box)` (Task 4).
- Produces: `UI.maskLineDrag(overlay, { getRect, getMask, onChange, onChangeEnd }) -> { render(), destroy() }`, and `VideoBoxPreview.setOnMaskChange(fn)` / `ImageBoxPreview.setOnMaskChange(fn)` where `fn({angle, offset}, done: boolean)` is called by the guide's drag.

**Why the guide mounts into `#overlay` rather than into the box element:** `<video>`/`<img>` are void-ish elements whose children are fallback content and never render, so the guide is its own absolutely-positioned `<svg>` sibling inside `#overlay`, sized and placed to match the box's on-stage rect.

**Testing note (stated, not silently skipped):** the guide is pointer-driven DOM interaction with the geometry already tested in Task 1; it carries no automated test and is verified by hand per Step 6.

- [ ] **Step 1: Write the guide component**

Create `static/ui-mask-line-drag.js`:

```javascript
// Reusable stage interaction: a draggable straight-line guide for a box's edge mask. Renders an
// SVG line (drag it to shift mask_offset) with a round end handle (drag it to change mask_angle)
// over a box's on-stage rect. Presentational only — the caller owns the data and persistence.
window.UI = window.UI || {};

// overlay: the #overlay element the guide mounts into.
// getRect(): {left, top, width, height} — the box's on-stage rect in px.
// getMask(): {angle, offset} — degrees and signed CANVAS px, straight off the box model.
// onChange({angle, offset}): fires live during a drag. onChangeEnd({angle, offset}): on mouseup.
// Returns destroy(), which removes the guide and any pending document listeners.
window.UI.maskLineDrag = function maskLineDrag(overlay, { getRect, getMask, onChange, onChangeEnd }) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "mask-line-guide");
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "mask-line-guide-line");
  const handle = document.createElementNS(SVG_NS, "circle");
  handle.setAttribute("class", "mask-line-guide-handle");
  handle.setAttribute("r", "7");
  svg.appendChild(line);
  svg.appendChild(handle);
  overlay.appendChild(svg);

  let drag = null; // {mode: "offset"|"angle", startX, startY, startOffset}

  // Canvas px per on-stage px — the stage renders the whole 1080-wide canvas across its width.
  function canvasPerStage() {
    return 1080 / (overlay.clientWidth || 1);
  }

  function geometry() {
    const rect = getRect();
    const { angle, offset } = getMask();
    const theta = angle * Math.PI / 180;
    const n = { x: Math.cos(theta), y: Math.sin(theta) };   // line normal
    const d = { x: -n.y, y: n.x };                          // along the line
    const offStage = offset / canvasPerStage();
    const cx = rect.width / 2 + n.x * offStage;
    const cy = rect.height / 2 + n.y * offStage;
    const len = rect.width + rect.height;                   // longer than any chord; SVG clips it
    return { rect, n, d, cx, cy, len };
  }

  function render() {
    const { rect, d, cx, cy, len } = geometry();
    svg.style.left = rect.left + "px";
    svg.style.top = rect.top + "px";
    svg.setAttribute("width", rect.width);
    svg.setAttribute("height", rect.height);
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    line.setAttribute("x1", cx - d.x * len);
    line.setAttribute("y1", cy - d.y * len);
    line.setAttribute("x2", cx + d.x * len);
    line.setAttribute("y2", cy + d.y * len);
    const reach = Math.max(24, Math.min(rect.width, rect.height) * 0.35);
    handle.setAttribute("cx", cx + d.x * reach);
    handle.setAttribute("cy", cy + d.y * reach);
  }

  function startDrag(mode, e) {
    e.preventDefault();
    e.stopPropagation();
    drag = { mode, startX: e.clientX, startY: e.clientY, startOffset: getMask().offset };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function maskFromEvent(e) {
    const { n, cx, cy } = geometry();
    const { angle } = getMask();
    if (drag.mode === "offset") {
      // Only motion along the line's normal moves the cut; motion along the line does nothing.
      const along = (e.clientX - drag.startX) * n.x + (e.clientY - drag.startY) * n.y;
      return { angle, offset: drag.startOffset + along * canvasPerStage() };
    }
    // Angle: the vector from the line's own center to the pointer defines the line direction
    // d = (-sin, cos), so theta = atan2(-v.x, v.y).
    const svgBox = svg.getBoundingClientRect();
    const vx = (e.clientX - svgBox.left) - cx;
    const vy = (e.clientY - svgBox.top) - cy;
    if (vx === 0 && vy === 0) return { angle, offset: drag.startOffset };
    const deg = Math.atan2(-vx, vy) * 180 / Math.PI;
    return { angle: Math.round((((deg % 360) + 360) % 360) * 10) / 10, offset: drag.startOffset };
  }

  function onMouseMove(e) {
    if (!drag) return;
    onChange(maskFromEvent(e));
  }

  function onMouseUp(e) {
    if (!drag) return;
    const mask = maskFromEvent(e);
    drag = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    onChangeEnd(mask);
  }

  line.addEventListener("mousedown", (e) => startDrag("offset", e));
  handle.addEventListener("mousedown", (e) => startDrag("angle", e));

  render();
  return {
    render,
    destroy() {
      svg.remove();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    },
  };
};
```

- [ ] **Step 2: Write the guide's styles**

Create `static/css/components/mask-line-guide.css`:

```css
/* .mask-line-guide: the draggable straight-line cut guide drawn over a selected masked box
   on the stage (UI.maskLineDrag, static/ui-mask-line-drag.js). */
.mask-line-guide {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
  z-index: 999;
}

.mask-line-guide-line {
  stroke: var(--accent);
  stroke-width: 2;
  pointer-events: stroke;
  cursor: move;
}

.mask-line-guide-handle {
  fill: var(--accent);
  stroke: var(--bg);
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
}
```

Confirm `--accent` and `--bg` exist in `static/css/tokens.css`; if either is named differently there, use the actual token names — never a literal color value.

- [ ] **Step 3: Link the new files in the page**

In `static/index.html`, add the stylesheet beside the other component stylesheets (after the `image-box-panel.css` line, around line 31):

```html
<link rel="stylesheet" href="/static/css/components/mask-line-guide.css">
```

And the script beside the other `ui-*` helpers, immediately after the `ui-video-box-drag.js` line (around line 846):

```html
<script src="/static/ui-mask-line-drag.js"></script>
```

- [ ] **Step 4: Mount the guide from the video-box preview**

In `static/video-box-preview.js`:

1. Add two module-level declarations next to `let onActivate = null;`:

```javascript
  let onMaskChange = null;   // ({angle, offset}, done) => void, fired by the mask-line drag guide
  let maskGuide = null;      // the UI.maskLineDrag handle for the selected box, if it is masked
```

2. Add these two functions immediately before `function render(videoBoxes, timelineTime) {`:

```javascript
  function unmountMaskGuide() {
    if (maskGuide) { maskGuide.destroy(); maskGuide = null; }
  }

  // The guide only exists for the selected box while its mask is on; every other case tears it
  // down, so switching selection or turning the mask off leaves no stray SVG in #overlay.
  function syncMaskGuide(box, el) {
    if (!box.mask_enabled || box.id !== selectedBoxId) { unmountMaskGuide(); return; }
    if (!maskGuide) {
      maskGuide = UI.maskLineDrag(overlay, {
        getRect: () => ({ left: el.offsetLeft, top: el.offsetTop,
                          width: el.offsetWidth, height: el.offsetHeight }),
        getMask: () => ({ angle: box.mask_angle || 0, offset: box.mask_offset || 0 }),
        onChange: (mask) => { if (onMaskChange) onMaskChange(mask, false); },
        onChangeEnd: (mask) => { if (onMaskChange) onMaskChange(mask, true); },
      });
    }
    maskGuide.render();
  }
```

3. Inside `render()`, immediately after the `video.style.clipPath = BoxMask.clipPath(v);` line added in Task 3:

```javascript
      syncMaskGuide(v, video);
```

4. In the cleanup loop at the end of `render()`, add `unmountMaskGuide()` when the selected box disappears — change:

```javascript
    for (const [id, video] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
```

to:

```javascript
    for (const [id, video] of mounted) {
      if (!activeIds.has(id)) {
        if (id === selectedBoxId) unmountMaskGuide();
        unmountHandles(id);
```

5. In `setSelectedVideoBox`, tear the guide down on any selection change — change:

```javascript
  function setSelectedVideoBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
```

to:

```javascript
  function setSelectedVideoBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    if (selectedBoxId !== boxId) unmountMaskGuide();
```

6. Add the setter and export it — change the module's return statement to:

```javascript
  function setOnMaskChange(fn) {
    onMaskChange = fn || null;
  }

  return { render, setSelectedVideoBox, setOnActivate, setOnMaskChange };
```

7. Append to the file's header comment:

```javascript
// Also mounts the on-stage cut-line guide (UI.maskLineDrag, static/ui-mask-line-drag.js) for the
// selected box while its mask is on, reporting drags through setOnMaskChange(fn) as
// fn({angle, offset}, done) — done=false live during the drag, true once on mouseup.
```

- [ ] **Step 5: Mount the guide from the image-box preview**

Apply the identical six edits to `static/image-box-preview.js`, with the module's own names: the loop variable is `b` (not `v`), the element is `img` (not `video`), the selection setter is `setSelectedImageBox`, and the return becomes:

```javascript
  return { render, setSelectedImageBox, setOnActivate, setOnMaskChange };
```

The two added functions are byte-identical to the video-box version:

```javascript
  function unmountMaskGuide() {
    if (maskGuide) { maskGuide.destroy(); maskGuide = null; }
  }

  // The guide only exists for the selected box while its mask is on; every other case tears it
  // down, so switching selection or turning the mask off leaves no stray SVG in #overlay.
  function syncMaskGuide(box, el) {
    if (!box.mask_enabled || box.id !== selectedBoxId) { unmountMaskGuide(); return; }
    if (!maskGuide) {
      maskGuide = UI.maskLineDrag(overlay, {
        getRect: () => ({ left: el.offsetLeft, top: el.offsetTop,
                          width: el.offsetWidth, height: el.offsetHeight }),
        getMask: () => ({ angle: box.mask_angle || 0, offset: box.mask_offset || 0 }),
        onChange: (mask) => { if (onMaskChange) onMaskChange(mask, false); },
        onChangeEnd: (mask) => { if (onMaskChange) onMaskChange(mask, true); },
      });
    }
    maskGuide.render();
  }
```

with the call site `syncMaskGuide(b, img);` placed right after `img.style.clipPath = BoxMask.clipPath(b);`, and the same header-comment sentence appended.

- [ ] **Step 6: Wire the drag back into both panels**

In `static/panel-video-box.js`, inside `renderMask(box)`, append at the end of the function:

```javascript
    VideoBoxPreview.setOnMaskChange(async (mask, done) => {
      box.mask_angle = mask.angle;
      box.mask_offset = Math.round(mask.offset);
      repaintStage();
      if (done) {
        await saveProject();
        renderMask(box);   // number fields track the drag once it settles
      }
    });
```

In `static/panel-image-box.js`, the mirrored version inside its `renderMask(box)`:

```javascript
    ImageBoxPreview.setOnMaskChange(async (mask, done) => {
      box.mask_angle = mask.angle;
      box.mask_offset = Math.round(mask.offset);
      repaintStage();
      if (done) {
        await saveProject();
        renderMask(box);   // number fields track the drag once it settles
      }
    });
```

- [ ] **Step 7: Verify in the browser on a throwaway project**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

On a **throwaway project**, with a Video Box selected and its mask ON: confirm the cut line renders over the box with a round handle; dragging the **line** slides the cut and the OFFSET field tracks it once the drag ends; dragging the **handle** rotates the cut and the ANGLE field tracks it; the guide disappears when the mask is turned OFF or the box is deselected, and leaves no leftover SVG in `#overlay`; reloading the page keeps the dragged values. Then align a cut to a real vertical feature (a pole, a doorframe) in the footage and export — the mp4 must match the stage. Repeat the drag checks for an Image Box.

- [ ] **Step 8: Update the codebase map**

In `CLAUDE.md`:

1. In the File structure tree's `static/` block, add after the `ui-video-box-drag.js` line:

```
  ui-mask-line-drag.js    # UI.maskLineDrag (added 2026-07-29, box edge mask): draggable SVG cut-line guide over a selected masked box's on-stage rect — drag the line to shift mask_offset, drag the round end handle to change mask_angle; returns {render, destroy}
```

2. In the `static/css/components/` block, add:

```
      mask-line-guide.css          # .mask-line-guide line + handle styling for ui-mask-line-drag.js (added 2026-07-29, box edge mask)
```

3. In the "### Box edge mask (straight-line cut)" Inventory subsection, append:

```markdown
- `static/ui-mask-line-drag.js` — `UI.maskLineDrag(overlay, {getRect, getMask, onChange, onChangeEnd}) -> {render, destroy}`: the on-stage cut guide, mounted as its own absolutely-positioned `<svg>` inside `#overlay` (a `<video>`/`<img>`'s children never render, so it cannot live inside the box element the way `ui-resize-handles.js` does). Dragging the line shifts `mask_offset` along the line's normal; dragging the round end handle sets `mask_angle` from the pointer's direction off the line's center. Stage px are converted to canvas px with the same `1080 / overlay.clientWidth` scale `stageScale()` uses. Presentational only — `panel-video-box.js`/`panel-image-box.js` own the writes and persistence, via `VideoBoxPreview.setOnMaskChange` / `ImageBoxPreview.setOnMaskChange`, which fire `fn({angle, offset}, done)` (live during the drag, then once on mouseup). Aligning a cut to a real pole by typing numbers is impractical, so this is the primary interaction and the Mask tab's number fields are the precise fallback.
```

4. In the "Shared UI components" Inventory section, add:

```markdown
- `static/ui-mask-line-drag.js` — `UI.maskLineDrag(overlay, {getRect, getMask, onChange, onChangeEnd})`: draggable straight-line guide for a box's edge mask (see "Box edge mask" above).
```

- [ ] **Step 9: Run the full suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add static/ui-mask-line-drag.js static/css/components/mask-line-guide.css static/index.html static/video-box-preview.js static/image-box-preview.js static/panel-video-box.js static/panel-image-box.js CLAUDE.md && git commit -m "feat: drag the box edge mask cut line directly on the stage"
```

---

## Spec coverage check

| Spec section | Covered by |
|---|---|
| Data model — four fields, both layer types, defaulted | Task 2 |
| Shared line math — one function, both languages, contract | Task 1 |
| Preview — `clip-path` from `maskPolygon`, none when off | Task 3 |
| Export — Pillow PNG next to the `.ass` sidecars, `alphamerge` before `overlay`, `app/mask_image.py` | Task 5 |
| UI — Mask tab, toggle/ANGLE/OFFSET/FLIP, both panels, save + re-render | Task 4 |
| UI — on-stage drag guide, `static/ui-mask-line-drag.js` | Task 6 |
| Testing — `tests/test_box_mask.py` case list | Task 1, Step 1 |
| Testing — JS mirror on the same case table | Task 1, Steps 5–8 |
| Testing — `tests/test_models.py` defaults + round trip | Task 2 |
| Testing — `tests/test_ffmpeg_cmd.py` one input, one `alphamerge`, unmasked unchanged | Task 5, Step 5 |
| Testing — `tests/test_mask_image.py` size, mode, sampled alpha | Task 5, Step 1 |
| Manual verification, stated not skipped | Tasks 3, 4, 5, 6 (each has a browser step; the untested layers are named in each task's Testing note) |
