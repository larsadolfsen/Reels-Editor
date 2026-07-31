# Vector Shape Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new overlay layer type — a free-form rectangle with fill color, opacity, and corner radius — that behaves as a full citizen of the existing text-block/video-box/image-box overlay system (z-order stack, its own Box/Style/Time panel, export compositing).

**Architecture:** New `ShapeLayer` model (`app/models.py`) on `Project.shapes`. Backend rasterizes each shape to an RGBA PNG at export time (`app/shape_render.py`) and composites it as a new `"shape"` band, mirroring the existing `"image_box"` band but simpler (no alpha-merge dance — the PNG already carries its own alpha). Frontend mirrors `image-box-preview.js`/`panel-image-box.js` minus the media-picker step and the edge-mask tab (a vector rect has no source image to mask, and corner radius already covers its shaping need) plus a new Style tab (fill/opacity/radius). Joins the unified overlay z-order row exactly like text blocks and video/image boxes.

**Tech Stack:** FastAPI + Pydantic (backend), Pillow (PNG rasterization), vanilla JS (frontend, no framework/bundler), `pytest` + `node --test` for tests.

## Global Constraints

- No JS build step/bundler — icons via `UI.icon(name, {size})` (`static/ui-icon.js`); never hand-inline `<svg>`.
- No inline `style="..."` in `static/index.html`; all styling in `static/css/**` classes.
- Each `static/*.js` file opens with a 1-2 line header comment stating its purpose.
- Reusable JS logic — one function/component per file.
- Every `static/*.js` file's role stays documented in the project's `CLAUDE.md` map; any commit that adds/moves/renames/deletes files must update that map in the same commit.
- A shape's resize is free-form (independent width/height, no aspect lock) — unlike video/image boxes.
- No edge-mask tab, no add-from-media picker for shapes (YAGNI per the approved spec).
- Tests: `.venv/Scripts/python -m pytest -q` (backend), `node --test "tests/js/**/*.test.js"` (frontend pure modules).

---

### Task 1: `ShapeLayer` data model

**Files:**
- Modify: `app/models.py` (add `ShapeLayer` class after `ImageBoxLayer`, add `shapes: list[ShapeLayer] = []` to `Project`)
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `ShapeLayer(id, start=0.0, duration=3.0, x, y, width=300.0, height=300.0, fill_color="#4C6FFF", opacity=1.0, corner_radius=0, z_index=-1)` — `x`/`y` required (no defaults, same as `VideoBoxLayer`/`ImageBoxLayer`'s `x`/`y` which default to `0`, but here we default them too since a shape has no aspect-derived height to keep in step — see Step 3). `Project.shapes: list[ShapeLayer] = []`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py` (near the existing `VideoBoxLayer`/`ImageBoxLayer` default-field tests — grep the file for `class TestImageBoxLayer` or similar to place it alongside; if the file has no class grouping, add as a standalone function):

```python
def test_shape_layer_defaults():
    from app.models import ShapeLayer
    s = ShapeLayer(x=100, y=200)
    assert s.start == 0.0
    assert s.duration == 3.0
    assert s.width == 300.0
    assert s.height == 300.0
    assert s.fill_color == "#4C6FFF"
    assert s.opacity == 1.0
    assert s.corner_radius == 0
    assert s.z_index == -1
    assert s.id  # non-empty, generated

def test_project_shapes_defaults_empty():
    from app.models import Project
    p = Project(name="r")
    assert p.shapes == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k shape -v`
Expected: FAIL with `ImportError: cannot import name 'ShapeLayer'`

- [ ] **Step 3: Write minimal implementation**

In `app/models.py`, immediately after the `ImageBoxLayer` class (after its last field, before `class TextPreset`):

```python
class ShapeLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    start: float = 0.0        # timeline seconds
    duration: float = 3.0     # seconds the shape is visible
    x: int = 0                 # px, left edge on the 1080x1920 canvas
    y: int = 0                 # px, top edge
    width: float = 300.0
    height: float = 300.0
    fill_color: str = "#4C6FFF"
    opacity: float = 1.0        # 0.0-1.0
    corner_radius: int = 0      # px; clamped to min(width, height)/2 when rasterized/rendered
    z_index: int = -1           # same convention as VideoBoxLayer/ImageBoxLayer
```

Find the `Project` class's `image_boxes: list[ImageBoxLayer] = []` line and add directly below it:

```python
    shapes: list[ShapeLayer] = []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k shape -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "Add ShapeLayer data model for the vector shape overlay feature"
```

---

### Task 2: `write_shape_png` rasterizer

**Files:**
- Create: `app/shape_render.py`
- Test: `tests/test_shape_render.py`

**Interfaces:**
- Consumes: nothing new (Pillow only, already a dependency — see `app/mask_image.py`).
- Produces: `write_shape_png(path: str, width: int, height: int, fill_color: str, opacity: float, corner_radius: int) -> None` — writes a `width x height` RGBA PNG, alpha `round(opacity * 255)` inside a rounded rect of the given `corner_radius` (clamped to `min(width, height) / 2`), `0` outside.

- [ ] **Step 1: Write the failing test**

Create `tests/test_shape_render.py`:

```python
# Tests for app.shape_render.write_shape_png: a filled rounded-rect RGBA PNG for the vector
# shape overlay feature, same rasterization style as app.mask_image.write_mask_png.
from PIL import Image
from app.shape_render import write_shape_png

def test_output_size_and_mode(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 200, 100, "#FF0000", 1.0, 0)
    img = Image.open(path)
    assert img.size == (200, 100)
    assert img.mode == "RGBA"

def test_full_opacity_center_pixel_is_opaque_fill_color(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 200, 100, "#FF0000", 1.0, 0)
    img = Image.open(path)
    r, g, b, a = img.getpixel((100, 50))
    assert (r, g, b, a) == (255, 0, 0, 255)

def test_partial_opacity_scales_alpha(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 100, 100, "#00FF00", 0.5, 0)
    img = Image.open(path)
    _, _, _, a = img.getpixel((50, 50))
    assert a == 128  # round(0.5 * 255) via PIL's rounding, i.e. round(127.5) == 128

def test_zero_opacity_is_fully_transparent(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 50, 50, "#0000FF", 0.0, 0)
    img = Image.open(path)
    _, _, _, a = img.getpixel((25, 25))
    assert a == 0

def test_corners_transparent_when_corner_radius_set(tmp_path):
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 100, 100, "#FFFFFF", 1.0, 30)
    img = Image.open(path)
    _, _, _, corner_alpha = img.getpixel((1, 1))
    _, _, _, center_alpha = img.getpixel((50, 50))
    assert corner_alpha == 0
    assert center_alpha == 255

def test_corner_radius_clamped_to_half_min_dimension(tmp_path):
    # radius (80) exceeds min(width, height)/2 == 25 for a 50x100 box; must not raise or
    # produce a self-intersecting rounded-rect, and the box's actual center must stay opaque.
    path = tmp_path / "shape.png"
    write_shape_png(str(path), 50, 100, "#FFFFFF", 1.0, 80)
    img = Image.open(path)
    _, _, _, center_alpha = img.getpixel((25, 50))
    assert center_alpha == 255
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_shape_render.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.shape_render'`

- [ ] **Step 3: Write minimal implementation**

Create `app/shape_render.py`:

```python
# Export-side rasterization for the vector shape overlay feature: write_shape_png() draws a
# filled rounded-rect as an RGBA PNG via Pillow (already a dependency, see app/font_metrics.py
# and app/mask_image.py) — fill_color at the given opacity inside the rounded rect, fully
# transparent outside. Consumed by app/ffmpeg_cmd.py's "shape" band (a plain overlay respects
# the PNG's own alpha directly, no alphaextract/alphamerge needed — unlike the edge-mask
# feature's mask PNGs, which composite onto an existing video/image stream that has no alpha
# of its own).
from PIL import Image, ImageDraw

def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def write_shape_png(path: str, width: int, height: int, fill_color: str, opacity: float,
                    corner_radius: int) -> None:
    """Write a width x height RGBA PNG: a filled rounded-rect in fill_color, alpha =
    round(opacity * 255) inside the rect, 0 outside. corner_radius is clamped to
    min(width, height) / 2 so it can never self-intersect."""
    w, h = int(width), int(height)
    radius = max(0, min(int(corner_radius), int(min(w, h) / 2)))
    alpha = round(max(0.0, min(1.0, opacity)) * 255)
    r, g, b = _hex_to_rgb(fill_color)

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=(r, g, b, alpha))
    img.save(path)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_shape_render.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add app/shape_render.py tests/test_shape_render.py
git commit -m "Add write_shape_png rasterizer for the vector shape overlay feature"
```

---

### Task 3: `banded_layers()` gains a `"shape"` band

**Files:**
- Modify: `app/timeline.py`
- Test: `tests/test_timeline.py`

**Interfaces:**
- Consumes: `ShapeLayer` (Task 1) — reads `.start`, `.duration`, `.z_index`.
- Produces: `shape_end(s: ShapeLayer) -> float` (mirrors `image_box_end`). `banded_layers()` now also sorts in `ShapeLayer`s, emitting `{"kind": "shape", "shape": s}` band dicts.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_timeline.py` (near the existing `image_box_end`/`banded_layers` tests):

```python
def test_shape_end_derived_from_start_and_duration():
    from app.models import ShapeLayer
    from app.timeline import shape_end
    s = ShapeLayer(x=0, y=0, start=1.0, duration=2.5)
    assert shape_end(s) == 3.5

def test_banded_layers_shape_between_two_text_blocks():
    from app.models import ShapeLayer, TextBlockLayer, Project
    low = TextBlockLayer(heading="a", preset_id="p", z_index=-2)
    high = TextBlockLayer(heading="b", preset_id="p", z_index=2)
    shape = ShapeLayer(x=0, y=0, z_index=0)
    p = Project(name="r", text_blocks=[low, high], shapes=[shape])
    bands = banded_layers(p)
    assert [b["kind"] for b in bands] == ["text", "shape", "text"]
    assert bands[1]["shape"] == shape

def test_banded_layers_shape_video_box_image_box_sorted_by_z_index():
    from app.models import ShapeLayer, VideoBoxLayer, ImageBoxLayer, Project
    shape = ShapeLayer(x=0, y=0, z_index=1)
    img = ImageBoxLayer(media_id="m1", file_path="pic.jpg", z_index=2)
    vid = VideoBoxLayer(media_id="m2", file_path="pip.mp4", out_point=1, z_index=3)
    p = Project(name="r", shapes=[shape], image_boxes=[img], video_boxes=[vid])
    bands = banded_layers(p)
    assert [b["kind"] for b in bands] == ["shape", "image_box", "video_box"]
```

(These reference the existing `banded_layers` import already at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -k shape -v`
Expected: FAIL with `ImportError: cannot import name 'shape_end'`

- [ ] **Step 3: Write minimal implementation**

In `app/timeline.py`, update the import line at the top:

```python
from app.models import ClipLayer, VideoBoxLayer, ImageBoxLayer, ShapeLayer, Project
```

Add after `image_box_end`:

```python
def shape_end(s: ShapeLayer) -> float:
    return s.start + s.duration
```

Update `banded_layers()`'s `entries` construction (the `sorted([...])` call) to include shapes:

```python
    entries = sorted(
        [("text", b) for b in project.text_blocks]
        + [("video_box", v) for v in project.video_boxes]
        + [("image_box", i) for i in project.image_boxes]
        + [("shape", s) for s in project.shapes],
        key=lambda e: e[1].z_index,
    )
```

The rest of `banded_layers()`'s loop already handles any non-`"text"` kind generically via `bands.append({"kind": kind, kind: item})`, so no further change is needed there.

Update the file's header comment (line 1) to mention shapes:

```python
# Pure timeline math: order clips, durations, map timeline time to (clip, source time), and merge text/video-box/image-box/shape layers into z-order export bands.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -v`
Expected: PASS (all timeline tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add app/timeline.py tests/test_timeline.py
git commit -m "Include shape layers in banded_layers() export z-order bands"
```

---

### Task 4: `"shape"` band in `build_export_cmd`

**Files:**
- Modify: `app/ffmpeg_cmd.py`
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: a band dict `{"kind": "shape", "shape": ShapeLayer, "png_path": str}` — `png_path` is always present (unlike `video_box`/`image_box`'s optional `mask_path`), pointing at a pre-rendered PNG exactly `shape.width x shape.height` with the shape's own alpha baked in.
- Produces: no new public function — extends `build_export_cmd`'s existing `bands` handling.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_ffmpeg_cmd.py` (near the existing image_box band tests; add `ShapeLayer` to the top-of-file import):

```python
from app.models import Project, ClipLayer, VideoBoxLayer, ImageBoxLayer, ShapeLayer, MediaItem
```

```python
def test_bands_with_single_shape_adds_looped_png_input_and_overlay():
    shape = ShapeLayer(x=100, y=200, width=300, height=500, start=1.0, duration=3.0, z_index=5)
    bands = [{"kind": "shape", "shape": shape, "png_path": "C:/tmp/band0-shape.png"}]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    assert "C:/tmp/band0-shape.png" in cmd
    idx = cmd.index("C:/tmp/band0-shape.png")
    assert cmd[idx - 5:idx] == ["-loop", "1", "-t", "3", "-i"]  # -loop 1 -t <duration> -i <png>
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "overlay=x=100:y=200" in fc
    assert "between(t\\,1\\,4)" in fc  # end = start(1.0) + duration(3.0) = 4.0
    assert "alphamerge" not in fc and "alphaextract" not in fc  # PNG already carries its own alpha

def test_bands_shape_and_image_box_alternate_correctly():
    shape = ShapeLayer(x=0, y=0, width=100, height=100, start=0, duration=2, z_index=5)
    img = ImageBoxLayer(media_id="m1", file_path="pic.jpg", start=0, duration=2, height=1920, z_index=3)
    bands = [
        {"kind": "shape", "shape": shape, "png_path": "shape.png"},
        {"kind": "image_box", "image_box": img},
    ]
    cmd = build_export_cmd(proj(), "out.mp4", bands=bands)
    assert "shape.png" in cmd and "pic.jpg" in cmd
    map_indices = [i for i, x in enumerate(cmd) if x == "-map"]
    assert cmd[map_indices[0] + 1] == "[ov1]"  # second band (index 1) is the final output label
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k shape -v`
Expected: FAIL — the `else: # "image_box"` branch in `build_export_cmd` swallows a `"shape"` band incorrectly (it does `band["image_box"]`, raising `KeyError: 'image_box'`)

- [ ] **Step 3: Write minimal implementation**

In `app/ffmpeg_cmd.py`, change the final `else:` branch of the `bands` loop from an unconditional `# "image_box"` fallback to an explicit `elif`, and add a new `elif band["kind"] == "shape":` branch right after it:

```python
        elif band["kind"] == "image_box":
            b = band["image_box"]
            cmd += ["-loop", "1", "-t", _num(b.duration), "-i", b.file_path]
            box_input = next_input_index
            next_input_index += 1
            end = b.start + b.duration
            out_label = f"[ov{step}]"
            mask_path = band.get("mask_path")
            if mask_path:
                # The mask PNG at mask_path must be exactly b.width x b.height — alphamerge requires
                # its two input streams to have matching dimensions, and the box stream is scaled to
                # b.width:b.height below, so any mismatch fails at ffmpeg runtime with an opaque error.
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
        else:  # "shape"
            s = band["shape"]
            png_path = band["png_path"]
            cmd += ["-loop", "1", "-t", _num(s.duration), "-i", png_path]
            box_input = next_input_index
            next_input_index += 1
            end = s.start + s.duration
            out_label = f"[ov{step}]"
            # The PNG already carries the shape's fill/opacity baked into its own alpha channel
            # (app/shape_render.py) and is already exactly s.width x s.height, so — unlike
            # video_box/image_box — no scale or alphamerge step is needed before the overlay.
            fc += (f";{current}[{box_input}:v]overlay=x={s.x}:y={s.y}:"
                   f"enable='between(t\\,{_num(s.start)}\\,{_num(end)})'{out_label}")
            current = out_label
```

(This replaces the previous bare `else:  # "image_box"` block — the `image_box` handling body itself is unchanged, just now under an explicit `elif`.)

Update the file's header comment to mention the new band kind, adding after the existing "Banded export additionally supports..." paragraph:

```python
# Banded export also supports "shape" bands: a `-loop 1 -t <duration>` looped PNG input
# (pre-rendered by app/shape_render.py, exactly the shape's own width x height with its
# fill/opacity baked into the PNG's alpha channel) is overlaid directly — no scale or
# alphamerge step, since the PNG already carries everything the compositing needs.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: PASS (all ffmpeg_cmd tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py
git commit -m "Composite shape layers into banded export as a direct PNG overlay"
```

---

### Task 5: Export route writes shape PNG sidecars; extend the smoke test

**Files:**
- Modify: `app/main.py`
- Modify: `tests/test_export_smoke.py`

**Interfaces:**
- Consumes: `write_shape_png` (Task 2), `banded_layers` (Task 3), `build_export_cmd`'s `"shape"` band (Task 4).
- Produces: no new public function — extends `export_project`'s banded-export branch.

- [ ] **Step 1: Write the failing test**

Modify `tests/test_export_smoke.py`: add `ShapeLayer` to the model imports, add a shape to the test project, and assert its PNG sidecar was created.

```python
from app.models import (
    Project, MediaItem, ClipLayer, TextPreset, TextBlockLayer, FormatRun,
    CaptionTrack, CaptionWord, VideoBoxLayer, ShapeLayer,
)
```

In the `Project(...)` construction, add:

```python
        shapes=[
            ShapeLayer(x=20, y=30, width=200, height=150, start=0, duration=2,
                       fill_color="#FF00FF", opacity=0.8, corner_radius=12, z_index=-2),
        ],
```

After the existing `assert cmd[-1].endswith(".mp4")` line, add:

```python
    shape_pngs = list(tmp_path.glob("exports/*-band*-shape.png"))
    assert len(shape_pngs) == 1
    assert "-i" in cmd and str(shape_pngs[0]) in cmd
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_export_smoke.py -v`
Expected: FAIL — `export_project` doesn't yet trigger the banded-export path for shapes-only projects (the `if p.video_boxes or p.image_boxes:` condition excludes `p.shapes`), and no `shape` band handling exists in `main.py` yet

- [ ] **Step 3: Write minimal implementation**

In `app/main.py`, add `mask_image`... actually shape rendering needs `from app import shape_render` (check the existing import block at the top of the file for `from app import ... mask_image` and add `shape_render` alongside it).

Change the trigger condition:

```python
    if p.video_boxes or p.image_boxes or p.shapes:
```

Add a new `elif band["kind"] == "shape":` branch in the `for i, band in enumerate(timeline.banded_layers(p)):` loop, after the existing `image_box` branch (the `else:` that currently handles `image_box` becomes an explicit `elif`, matching the pattern already established in `app/ffmpeg_cmd.py`):

```python
            elif band["kind"] == "image_box":
                b = band["image_box"]
                entry = {"kind": "image_box", "image_box": b}
                if b.mask_enabled:
                    png = out_dir / f"{p.name}-{p.id[:8]}-band{i}-mask.png"
                    mask_image.write_mask_png(str(png), b.width, b.height,
                                              b.mask_angle, b.mask_offset, b.mask_flip)
                    entry["mask_path"] = str(png)
                bands.append(entry)
            else:  # "shape"
                s = band["shape"]
                png = out_dir / f"{p.name}-{p.id[:8]}-band{i}-shape.png"
                shape_render.write_shape_png(str(png), s.width, s.height, s.fill_color,
                                             s.opacity, s.corner_radius)
                bands.append({"kind": "shape", "shape": s, "png_path": str(png)})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_export_smoke.py -v`
Expected: PASS

Run the full backend suite to confirm no regressions: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_export_smoke.py
git commit -m "Write shape PNG sidecars in the export route and extend the smoke test"
```

---

### Task 6: Frontend pure helpers — `ShapeDefaults` and `ShapeColor`

**Files:**
- Create: `static/shape-defaults.js`
- Create: `static/shape-color.js`
- Test: `tests/js/shape-defaults.test.js`
- Test: `tests/js/shape-color.test.js`

**Interfaces:**
- Produces: `window.ShapeDefaults.centeredShape() -> { start, duration, x, y, width, height, fill_color, opacity, corner_radius, z_index }`. `window.ShapeColor.toRgba(hex, opacity) -> "rgba(r,g,b,a)"` string.

- [ ] **Step 1: Write the failing tests**

Create `tests/js/shape-defaults.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { centeredShape } = require("../../static/shape-defaults.js");

test("centeredShape returns a 300x300 box centered on the 1080x1920 canvas", () => {
  const s = centeredShape();
  assert.strictEqual(s.width, 300);
  assert.strictEqual(s.height, 300);
  assert.strictEqual(s.x, 390);   // (1080 - 300) / 2
  assert.strictEqual(s.y, 810);   // (1920 - 300) / 2
});

test("centeredShape returns the documented style/time defaults", () => {
  const s = centeredShape();
  assert.strictEqual(s.start, 0);
  assert.strictEqual(s.duration, 3.0);
  assert.strictEqual(s.fill_color, "#4C6FFF");
  assert.strictEqual(s.opacity, 1.0);
  assert.strictEqual(s.corner_radius, 0);
  assert.strictEqual(s.z_index, -1);
});
```

Create `tests/js/shape-color.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { toRgba } = require("../../static/shape-color.js");

test("full opacity", () => {
  assert.strictEqual(toRgba("#FF0000", 1.0), "rgba(255, 0, 0, 1)");
});

test("partial opacity", () => {
  assert.strictEqual(toRgba("#00FF00", 0.5), "rgba(0, 255, 0, 0.5)");
});

test("zero opacity", () => {
  assert.strictEqual(toRgba("#0000FF", 0), "rgba(0, 0, 255, 0)");
});

test("lowercase hex", () => {
  assert.strictEqual(toRgba("#4c6fff", 1.0), "rgba(76, 111, 255, 1)");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/js/shape-defaults.test.js tests/js/shape-color.test.js`
Expected: FAIL — `Cannot find module '../../static/shape-defaults.js'`

- [ ] **Step 3: Write minimal implementation**

Create `static/shape-defaults.js`:

```js
// Pure default values for a newly-created ShapeLayer (vector shape overlay feature): the one
// place these live, so panel-shape.js's create path and its tests stay in sync.
// Exposes window.ShapeDefaults.centeredShape().
(() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const DEFAULT_SIZE = 300;

  function centeredShape() {
    return {
      start: 0,
      duration: 3.0,
      x: Math.round((CANVAS_W - DEFAULT_SIZE) / 2),
      y: Math.round((CANVAS_H - DEFAULT_SIZE) / 2),
      width: DEFAULT_SIZE,
      height: DEFAULT_SIZE,
      fill_color: "#4C6FFF",
      opacity: 1.0,
      corner_radius: 0,
      z_index: -1,
    };
  }

  const api = { centeredShape };
  if (typeof window !== "undefined") window.ShapeDefaults = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

Create `static/shape-color.js`:

```js
// Pure hex+opacity -> CSS rgba() conversion for the vector shape overlay feature: a shape's
// fill color and opacity are stored separately (ShapeLayer.fill_color/opacity), but the CSS
// background needs them combined so opacity affects only the fill, not any future border.
// Exposes window.ShapeColor.toRgba(hex, opacity).
(() => {
  function toRgba(hex, opacity) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  const api = { toRgba };
  if (typeof window !== "undefined") window.ShapeColor = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/js/shape-defaults.test.js tests/js/shape-color.test.js`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add static/shape-defaults.js static/shape-color.js tests/js/shape-defaults.test.js tests/js/shape-color.test.js
git commit -m "Add pure ShapeDefaults/ShapeColor helpers for the vector shape overlay feature"
```

---

### Task 7: Shapes join the unified overlay z-order stack

**Files:**
- Modify: `static/timeline-overlay-layers.js`
- Test: `tests/js/timeline-overlay-layers.test.js` (new file — this module currently has no dedicated test)

**Interfaces:**
- Consumes: `project.shapes` (a plain array of shape-shaped objects for test purposes; real callers pass `ShapeLayer`-shaped JSON).
- Produces: `window.OverlayLayers.mergedEntries(project)` now also includes `{ id, kind: "shape", item }` entries; `renumber(entries)` unchanged in behavior (still just reassigns `z_index` by position, now covering shape entries too since they're part of the same list).

- [ ] **Step 1: Write the failing test**

Create `tests/js/timeline-overlay-layers.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { mergedEntries, renumber } = require("../../static/timeline-overlay-layers.js");

test("mergedEntries sorts text, video_box, image_box, and shape by z_index descending", () => {
  const project = {
    text_blocks: [{ id: "t1", z_index: 0 }],
    video_boxes: [{ id: "v1", z_index: 2 }],
    image_boxes: [{ id: "i1", z_index: -1 }],
    shapes: [{ id: "s1", z_index: 1 }],
  };
  const entries = mergedEntries(project);
  assert.deepStrictEqual(entries.map((e) => e.id), ["v1", "s1", "t1", "i1"]);
  assert.deepStrictEqual(entries.map((e) => e.kind), ["video_box", "shape", "text", "image_box"]);
});

test("mergedEntries handles a project with no shapes", () => {
  const project = { text_blocks: [{ id: "t1", z_index: 0 }], video_boxes: [], image_boxes: [] };
  const entries = mergedEntries(project);
  assert.deepStrictEqual(entries.map((e) => e.id), ["t1"]);
});

test("renumber reassigns z_index by position, including shape entries", () => {
  const shapeItem = { z_index: 1 };
  const textItem = { z_index: 0 };
  const entries = [{ id: "s1", kind: "shape", item: shapeItem }, { id: "t1", kind: "text", item: textItem }];
  renumber(entries);
  assert.strictEqual(shapeItem.z_index, 1);
  assert.strictEqual(textItem.z_index, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/timeline-overlay-layers.test.js`
Expected: FAIL — `require(...)` throws because `static/timeline-overlay-layers.js` has no `module.exports`, and the shape assertions fail (shapes not merged in)

- [ ] **Step 3: Write minimal implementation**

Modify `static/timeline-overlay-layers.js`:

```js
// Pure helpers for the timeline's unified overlay z-order stack: merges every text block,
// video box, image box, and shape into one list ordered by z_index descending (top =
// frontmost, mirrors the removed Layers panel's convention), and renumbers z_index after a
// drag reorder. No DOM/fetch. Consumed by static/timeline.js (rendering) and
// static/timeline-overlay-layer-drag.js (drag-to-reorder).
// Exposes window.OverlayLayers.{mergedEntries, renumber}.
(() => {
  function mergedEntries(project) {
    const text = (project.text_blocks || []).map((b) => ({ id: b.id, kind: "text", item: b }));
    const boxes = (project.video_boxes || []).map((v) => ({ id: v.id, kind: "video_box", item: v }));
    const imageBoxes = (project.image_boxes || []).map((i) => ({ id: i.id, kind: "image_box", item: i }));
    const shapes = (project.shapes || []).map((s) => ({ id: s.id, kind: "shape", item: s }));
    return [...text, ...boxes, ...imageBoxes, ...shapes].sort((a, b) => (b.item.z_index ?? 0) - (a.item.z_index ?? 0));
  }

  // `entries` is already in the desired top-to-bottom (front-to-back) order; assign z_index
  // by position so a drag-drop reorder becomes the new persisted stacking order.
  function renumber(entries) {
    const n = entries.length;
    entries.forEach((e, i) => { e.item.z_index = n - 1 - i; });
  }

  const api = { mergedEntries, renumber };
  if (typeof window !== "undefined") window.OverlayLayers = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/timeline-overlay-layers.test.js`
Expected: PASS (3 passed)

Run the full JS suite to confirm no regressions: `node --test "tests/js/**/*.test.js"`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add static/timeline-overlay-layers.js tests/js/timeline-overlay-layers.test.js
git commit -m "Include shapes in the unified overlay z-order stack"
```

---

### Task 8: `#panel-shape` markup scaffold + `square` icon

**Files:**
- Modify: `static/index.html`
- Modify: `static/ui-icon.js`
- Create: `static/css/components/shape-panel.css`
- Modify: `static/css/components/stage.css`

**Interfaces:**
- Produces: DOM scaffold `#panel-shape` (hidden `.context-panel`) with Box/Style/Time tab-body containers and a Delete footer button, ready for Task 9 (`shape-preview.js`) and Task 10 (`panel-shape.js`) to wire up. `UI.icon("square", { size })` now resolves.

- [ ] **Step 1: Manual verification plan (no automated test — this is markup/CSS scaffolding)**

This task has no behavior yet, so there's nothing to unit-test; verification is "the page still loads with no console errors and the new elements exist," done via the browser at the end of this task's steps.

- [ ] **Step 2: Add the `square` icon**

In `static/ui-icon.js`, add to `ICON_PATHS` (alongside the other simple rect-based icons like `"panel-left-close"`):

```js
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
```

- [ ] **Step 3: Add `#panel-shape` markup to `index.html`**

Find `<div id="panel-image-box" class="context-panel" hidden>` … its closing `</div>` in `static/index.html` (see the block ending just before `<div id="panel-audio" ...>`). Insert a new section immediately after that closing `</div>` and before `<div id="panel-audio" ...>`:

```html
      <div id="panel-shape" class="context-panel" hidden>
        <div id="shape-header" class="context-panel-header"></div>
        <div id="shape-empty-state" class="style-group">
          <button id="shape-add" class="col-8" data-button data-button-intent="dashed" data-button-icon="plus" hidden>ADD SHAPE</button>
        </div>
        <div id="shape-detail" class="context-panel-body" hidden>
          <div id="shape-tab-bar"></div>

          <div id="shape-box-body">
            <div class="section-label-spacer text-eyebrow">SIZE &amp; POSITION</div>
            <div class="style-group">
              <div class="style-row">
                <label id="shape-x-field"></label>
                <label id="shape-y-field"></label>
              </div>
              <div class="style-row">
                <label id="shape-width-field"></label>
                <label id="shape-height-field"></label>
              </div>
            </div>
          </div>

          <div id="shape-style-body">
            <div class="section-label-spacer text-eyebrow">FILL</div>
            <div class="style-group">
              <div id="shape-fill-color-field"></div>
            </div>
            <div class="style-group">
              <div class="style-row">
                <label id="shape-opacity-field"></label>
                <label id="shape-corner-radius-field"></label>
              </div>
            </div>
          </div>

          <div id="shape-time-body">
            <div class="section-label-spacer text-eyebrow">TIME</div>
            <div class="style-group">
              <div class="style-row">
                <label id="shape-start-field"></label>
                <label id="shape-duration-field"></label>
              </div>
            </div>
          </div>

          <div class="style-group panel-danger-footer">
            <button id="shape-delete" class="col-8" data-button data-button-intent="danger" hidden>Delete shape</button>
          </div>
        </div>
      </div>
```

Find the line `<link rel="stylesheet" href="/static/css/components/image-box-panel.css">` and add directly below it:

```html
<link rel="stylesheet" href="/static/css/components/shape-panel.css">
```

Find `showPanel(type)` in `static/panel-nav.js` — **note:** this file's own list of panel types is updated in Task 11, not here; this task only adds the DOM the list will reference.

Find the `<script src="/static/panel-image-box.js"></script>` line in `index.html` and add these four lines directly after it (dependency order: pure helpers before the modules that use them, preview module before the panel that drives it):

```html
<script src="/static/shape-defaults.js"></script>
<script src="/static/shape-color.js"></script>
<script src="/static/shape-preview.js"></script>
<script src="/static/panel-shape.js"></script>
```

(`shape-preview.js` and `panel-shape.js` don't exist yet — they're created in Tasks 9 and 10. Adding the `<script>` tags now means the page will 404 on them until those tasks land; that's fine within this one task's scope since the whole feature ships as one branch, but if you want the app runnable after every single task, defer these two `<script>` lines to Task 10's step instead.)

- [ ] **Step 4: Create `shape-panel.css`**

Create `static/css/components/shape-panel.css`:

```css
/* #panel-shape internal layout: size/position/style/time detail view, no add-picker (a shape
   isn't sourced from media) and no mask tab (corner radius already covers its shaping need).
   Mirrors image-box-panel.css's layout (same grid/spacing), renamed to shape-* ids. */
/* Exposes #panel-shape's internal layout only. Depends on tokens.css, style-panel.css. */
```

- [ ] **Step 5: Add `.shape-box` base styling to `stage.css`**

In `static/css/components/stage.css`, add directly after the existing `.image-box { ... }` block:

```css
.shape-box {
  position: absolute;
  box-sizing: border-box;
}
```

- [ ] **Step 6: Manually verify the scaffold loads cleanly**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000`, open the browser console, and confirm there are no 404s for `shape-panel.css` and no JS errors from the new `<script>` tags failing to find `shape-defaults.js`/`shape-color.js` (both exist from Task 6). If you deferred the `shape-preview.js`/`panel-shape.js` `<script>` tags per the note in Step 3, skip checking those two here — they land in Task 10.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/ui-icon.js static/css/components/shape-panel.css static/css/components/stage.css
git commit -m "Add #panel-shape markup scaffold and the square icon"
```

---

### Task 9: `shape-preview.js` — stage mounting, drag, resize, click-to-select

**Files:**
- Create: `static/shape-preview.js`
- Modify: `static/index.html` (add the `<script>` tag if deferred from Task 8)

**Interfaces:**
- Consumes: `UI.videoBoxDrag`, `UI.resizeHandles` (existing), `ShapeColor.toRgba` (Task 6), `window.ToolMode` (existing).
- Produces: `window.ShapePreview.{render(shapes, timelineTime), setSelectedShape(shapeId, callbacks), setOnActivate(fn)}` — same shape as `window.ImageBoxPreview`.

- [ ] **Step 1: No isolated automated test (documented gap)**

This is DOM-mounting/drag/resize glue, same category as `image-box-preview.js`/`video-box-preview.js` — neither has a dedicated test file (no DOM in this project's `node --test` setup). Verification is manual, folded into this task's last step.

- [ ] **Step 2: Write the implementation**

Create `static/shape-preview.js`:

```js
// Stage preview for shape (vector rectangle) overlay layers: mounts one <div class="shape-box">
// per visible shape into #overlay (a sibling of preview.js's text-block divs and
// video-box-preview.js's/image-box-preview.js's elements — all set an explicit CSS z-index from
// their model's z_index so stacking follows the project's cross-layer z-order), keeps each
// element's position/size/fill/opacity/corner-radius in sync with the timeline clock, and wires
// drag-to-move (UI.videoBoxDrag) / resize (UI.resizeHandles) onto the selected shape. Unlike
// video/image boxes, resize is free-form (no aspect lock) — a shape has no source media aspect
// ratio to preserve. Exposes window.ShapePreview.{render, setSelectedShape, setOnActivate}.
window.ShapePreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // shapeId -> <div>
  const handlesDestroyers = new Map(); // shapeId -> () => void, for resize/drag cleanup
  let selectedShapeId = null;
  let callbacks = null;
  let onActivate = null; // (shapeId) => void, fired by a plain click on an unselected shape in Select mode

  function shapeEnd(s) {
    return s.start + s.duration;
  }

  function mountHandles(shapeId, div) {
    if (handlesDestroyers.has(shapeId)) return; // already mounted for this element
    const destroyDrag = UI.videoBoxDrag(div, {
      onMove: (delta) => { if (callbacks && callbacks.onMove) callbacks.onMove(delta); },
      onMoveEnd: (delta) => { if (callbacks && callbacks.onMoveEnd) callbacks.onMoveEnd(delta); },
    });
    const destroyResize = UI.resizeHandles(div, {
      getSize: () => ({ width: div.offsetWidth, height: div.offsetHeight }),
      onResize: (size) => { if (callbacks && callbacks.onResize) callbacks.onResize(size); },
      onDragEnd: (size) => { if (callbacks && callbacks.onDragEnd) callbacks.onDragEnd(size); },
    });
    handlesDestroyers.set(shapeId, () => { destroyDrag(); destroyResize(); });
  }

  function unmountHandles(shapeId) {
    const destroy = handlesDestroyers.get(shapeId);
    if (destroy) { destroy(); handlesDestroyers.delete(shapeId); }
  }

  function render(shapes, timelineTime) {
    const activeIds = new Set();
    const stageW = overlay.clientWidth || 1;
    const stageH = overlay.clientHeight || 1;

    for (const s of shapes) {
      const visible = s.start <= timelineTime && timelineTime < shapeEnd(s);
      if (!visible) continue;
      activeIds.add(s.id);

      let div = mounted.get(s.id);
      if (!div) {
        div = document.createElement("div");
        div.className = "shape-box";
        div.style.pointerEvents = "auto";
        // Click-to-select (mirrors video-box-preview.js/image-box-preview.js): a plain click on
        // a not-yet-selected shape selects it, Select-tool only. In Text-tool mode this no-ops
        // so the click bubbles to #stage's click listener (stage-click-router.js) and is
        // treated as insert-text-here.
        div.addEventListener("click", () => {
          if (s.id === selectedShapeId) return;
          if (!window.ToolMode || ToolMode.get() !== "select") return;
          if (onActivate) onActivate(s.id);
        });
        overlay.appendChild(div);
        mounted.set(s.id, div);
      }

      div.style.left = (s.x / 1080 * stageW) + "px";
      div.style.top = (s.y / 1920 * stageH) + "px";
      div.style.width = (s.width / 1080 * stageW) + "px";
      div.style.height = (s.height / 1920 * stageH) + "px";
      div.style.zIndex = String(s.z_index);
      div.style.backgroundColor = ShapeColor.toRgba(s.fill_color, s.opacity);
      // Corner radius is stored in 1080x1920 canvas px; scale it the same way width/height are
      // scaled to the stage's actual rendered size, so it doesn't visually change with zoom.
      div.style.borderRadius = (s.corner_radius / 1080 * stageW) + "px";

      if (s.id === selectedShapeId && callbacks) mountHandles(s.id, div);
      else unmountHandles(s.id);
    }

    for (const [id, div] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
        div.remove();
        mounted.delete(id);
      }
    }
  }

  function setSelectedShape(shapeId, cb) {
    if (selectedShapeId && selectedShapeId !== shapeId) unmountHandles(selectedShapeId);
    selectedShapeId = shapeId;
    callbacks = cb || null;
  }

  function setOnActivate(fn) {
    onActivate = fn || null;
  }

  return { render, setSelectedShape, setOnActivate };
})();
```

If the `<script src="/static/shape-preview.js">` tag wasn't already added in Task 8, add it now in `static/index.html` directly after `<script src="/static/panel-image-box.js"></script>` (before `panel-shape.js`, which doesn't exist until Task 10).

- [ ] **Step 3: Manual verification**

This can't be meaningfully checked until Task 10 wires a panel to it (there's no way to create a shape yet), so defer the actual click/drag/resize check to Task 10's verification step. For now, confirm the dev server loads `shape-preview.js` with no console errors (`ShapePreview` should be `typeof "object"` when checked in the browser console).

- [ ] **Step 4: Commit**

```bash
git add static/shape-preview.js static/index.html
git commit -m "Add shape-preview.js: stage mounting/drag/resize for shape overlay layers"
```

---

### Task 10: `panel-shape.js` — Box/Style/Time tabs, create/delete

**Files:**
- Create: `static/panel-shape.js`
- Modify: `static/index.html` (add the `<script>` tag, if not already present)

**Interfaces:**
- Consumes: `ShapeDefaults.centeredShape()` (Task 6), `ShapePreview.{render, setSelectedShape}` (Task 9), globals `project`/`saveProject`/`renderTimeline`/`stageScale` (existing, reached into the same way `panel-image-box.js` does).
- Produces: `window.ShapePanel.render(selectedId)`, `window.ShapePanel.createShape()` — pushes a new `ShapeLayer`-shaped object into `project.shapes` and returns it (no save/render — caller's responsibility, same contract as `ImageBoxPanel.createImageBox`).

- [ ] **Step 1: No isolated automated test (documented gap)**

Same category as `panel-image-box.js`/`panel-video-box.js` — panel rendering/wiring, verified manually. The pure logic it depends on (`ShapeDefaults`, `ShapeColor`) is already tested in Task 6.

- [ ] **Step 2: Write the implementation**

Create `static/panel-shape.js`:

```js
// #panel-shape context-panel section: size/position (Box), fill color/opacity/corner radius
// (Style), and start/duration (Time) fields, drag-to-move/resize on stage (via ShapePreview),
// delete. Detail view split into Box/Style/Time tab panes via UI.tabBar (Box default), with
// Delete as an always-visible footer. Exposes window.ShapePanel.render(selectedId) and
// window.ShapePanel.createShape() (pushes a new shape into project.shapes and returns it, no
// save/render — caller's responsibility, same contract as ImageBoxPanel.createImageBox). One
// shape selected at a time; multiple shapes live in project.shapes (see app/models.py's
// ShapeLayer). No add-from-media picker (a shape isn't sourced from media) and no Mask tab
// (corner radius already covers its shaping need) — mirrors panel-image-box.js otherwise.
window.ShapePanel = window.ShapePanel || {};

(() => {
  const SHAPE_HEADER_ICON = UI.icon("square", { size: 18 });
  const SHAPE_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
  const SHAPE_TAB_ICON_STYLE = UI.icon("square", { size: 18 });
  const SHAPE_TAB_ICON_TIME = UI.icon("timer", { size: 18 });

  const SHAPE_TABS = [
    { value: "box", icon: SHAPE_TAB_ICON_BOX, label: "Box" },
    { value: "style", icon: SHAPE_TAB_ICON_STYLE, label: "Style" },
    { value: "time", icon: SHAPE_TAB_ICON_TIME, label: "Time" },
  ];
  const shapeTabPanes = {
    box: document.getElementById("shape-box-body"),
    style: document.getElementById("shape-style-body"),
    time: document.getElementById("shape-time-body"),
  };
  let activeShapeTab = "box";
  function showShapeTab(value) {
    activeShapeTab = value;
    Object.entries(shapeTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
  }
  UI.tabBar(document.getElementById("shape-tab-bar"), SHAPE_TABS, activeShapeTab, showShapeTab);
  showShapeTab(activeShapeTab);

  function createShape() {
    const shape = { id: crypto.randomUUID().replaceAll("-", ""), ...ShapeDefaults.centeredShape() };
    project.shapes.push(shape);
    return shape;
  }

  function repaintStage() {
    ShapePreview.render(project.shapes, Preview.currentTimelineTime());
  }

  function renderDetail(shape) {
    UI.numberField(document.getElementById("shape-x-field"),
      { label: "X", unit: "PX", value: shape.x, min: 0, max: 1080, span: 4,
        onChange: async (v) => { shape.x = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-y-field"),
      { label: "Y", unit: "PX", value: shape.y, min: 0, max: 1920, span: 4,
        onChange: async (v) => { shape.y = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-width-field"),
      { label: "WIDTH", unit: "PX", value: shape.width, min: 1, max: 1080, span: 4,
        onChange: async (v) => { shape.width = v; await saveProject(); renderTimeline(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-height-field"),
      { label: "HEIGHT", unit: "PX", value: shape.height, min: 1, max: 1920, span: 4,
        onChange: async (v) => { shape.height = v; await saveProject(); renderTimeline(); repaintStage(); } });

    UI.colorSwatch(document.getElementById("shape-fill-color-field"),
      { label: "Fill", value: shape.fill_color, span: 8,
        onChange: async (v) => { shape.fill_color = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-opacity-field"),
      { label: "OPACITY", unit: "%", value: Math.round(shape.opacity * 100), min: 0, max: 100, span: 4,
        onChange: async (v) => { shape.opacity = v / 100; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-corner-radius-field"),
      { label: "RADIUS", unit: "PX", value: shape.corner_radius, min: 0, span: 4,
        onChange: async (v) => { shape.corner_radius = v; await saveProject(); repaintStage(); } });

    UI.numberField(document.getElementById("shape-start-field"),
      { label: "START", unit: "SEC", value: shape.start, step: 0.1, min: 0, span: 4,
        onChange: async (v) => { shape.start = v; await saveProject(); renderTimeline(); } });
    UI.numberField(document.getElementById("shape-duration-field"),
      { label: "DURATION", unit: "SEC", value: shape.duration, step: 0.1, min: 0.1, span: 4,
        onChange: async (v) => { shape.duration = v; await saveProject(); renderTimeline(); } });

    document.getElementById("shape-delete").onclick = async () => {
      project.shapes = project.shapes.filter((s) => s.id !== shape.id);
      await saveProject();
      openFilesPanel();
    };

    ShapePreview.setSelectedShape(shape.id, {
      onResize: (size) => {
        const scale = stageScale();
        const width = Math.round(size.width * scale);
        const height = Math.round(size.height * scale);
        ShapePreview.render(
          project.shapes.map((s) => (s.id === shape.id ? { ...s, width, height } : s)),
          Preview.currentTimelineTime(),
        );
      },
      onDragEnd: async (size) => {
        const scale = stageScale();
        shape.width = Math.round(size.width * scale);
        shape.height = Math.round(size.height * scale);
        await saveProject();
        renderDetail(shape);
      },
      onMove: (delta) => {
        const scale = stageScale();
        ShapePreview.render(
          project.shapes.map((s) => (s.id === shape.id ? { ...s, x: s.x + delta.dx * scale, y: s.y + delta.dy * scale } : s)),
          Preview.currentTimelineTime(),
        );
      },
      onMoveEnd: async (delta) => {
        const scale = stageScale();
        shape.x = Math.round(shape.x + delta.dx * scale);
        shape.y = Math.round(shape.y + delta.dy * scale);
        await saveProject();
        renderDetail(shape);
      },
    });
  }

  let lastSelectedId = null;

  function render(selectedId) {
    document.getElementById("shape-add").onclick = async () => {
      const shape = createShape();
      await saveProject();
      renderTimeline();
      render(shape.id);
    };
    const shape = selectedId ? project.shapes.find((s) => s.id === selectedId) : null;
    UI.contextPanelHeader(document.getElementById("shape-header"), {
      icon: SHAPE_HEADER_ICON,
      label: "Shape",
    });
    document.getElementById("shape-empty-state").hidden = !!shape;
    document.getElementById("shape-detail").hidden = !shape;
    if (!shape) {
      ShapePreview.setSelectedShape(null, null);
      lastSelectedId = null;
      return;
    }
    // Selecting a shape that's outside its own time window seeks the playhead to its start so
    // it's visible and editable on stage — mirrors panel-image-box.js's same behavior.
    if (shape.id !== lastSelectedId) {
      const t = Preview.currentTimelineTime();
      if (t < shape.start || t >= shape.start + shape.duration) {
        Preview.seek(shape.start);
        renderTimeline();
      }
    }
    lastSelectedId = shape.id;
    renderDetail(shape);
  }

  window.ShapePanel.render = render;
  window.ShapePanel.createShape = createShape;
})();
```

Add `<script src="/static/panel-shape.js"></script>` to `static/index.html` directly after `<script src="/static/shape-preview.js"></script>`, if not already present from Task 8/9.

- [ ] **Step 3: Manual verification**

This panel isn't reachable yet (no rail entry, Task 11 adds that) — defer full manual verification to Task 11's step, which wires the rail entry that actually opens `#panel-shape`.

- [ ] **Step 4: Commit**

```bash
git add static/panel-shape.js static/index.html
git commit -m "Add panel-shape.js: Box/Style/Time tabs for the shape overlay panel"
```

---

### Task 11: SHAPE rail entry, selection routing, undo/redo restore

**Files:**
- Modify: `static/panel-nav.js`

**Interfaces:**
- Consumes: `ShapePanel.{render, createShape}` (Task 10).
- Produces: extends `showPanel`'s panel-type list, `onTimelineSelect`, `PANEL_NAV_BOTTOM_ITEMS`, `PANEL_NAV_HANDLERS`, `reRenderAfterRestore` to cover `"shape"`.

- [ ] **Step 1: Manual verification plan**

No automated test exists for `panel-nav.js`'s wiring (it's classic-script DOM glue reaching into `editor.js`'s globals, same category as the rest of this file). Verification is manual, at the end of this task.

- [ ] **Step 2: Update `showPanel`'s panel-type list**

In `static/panel-nav.js`, change:

```js
  ["files", "video", "text", "captions", "video-box", "image-box", "settings", "export", "projects", "audio"].forEach((t) => {
```

to:

```js
  if (type !== "shape") ShapePreview.setSelectedShape(null, null);
  ["files", "video", "text", "captions", "video-box", "image-box", "settings", "export", "projects", "audio", "shape"].forEach((t) => {
```

(Add the `ShapePreview.setSelectedShape(null, null)` line alongside the existing `if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);` / `if (type !== "image-box") ImageBoxPreview.setSelectedImageBox(null, null);` lines already in `showPanel`, right after the `image-box` one.)

- [ ] **Step 3: Add the `"shape"` case to `onTimelineSelect`**

In `static/panel-nav.js`, add an `else if` branch to `onTimelineSelect` right after the existing `image-box` branch:

```js
  } else if (type === "image-box") {
    showPanel("image-box");
    ImageBoxPanel.render(item.id);
  } else if (type === "shape") {
    showPanel("shape");
    ShapePanel.render(item.id);
  }
```

- [ ] **Step 4: Add the SHAPE rail entry**

In `static/panel-nav.js`, add a new entry to `PANEL_NAV_BOTTOM_ITEMS`, right after the `"text"` entry:

```js
const PANEL_NAV_BOTTOM_ITEMS = [
  {
    value: "text",
    label: "TEXT",
    icon: UI.icon("type", { size: 20 }),
  },
  {
    value: "shape",
    label: "SHAPE",
    icon: UI.icon("square", { size: 20 }),
  },
  {
    value: "captions",
```

- [ ] **Step 5: Add `openShapePanel` and register it in `PANEL_NAV_HANDLERS`**

Add a new function right after `openImageBoxPanel`:

```js
function openShapePanel() {
  selected = { type: "shape", item: null };
  showPanel("shape");
  ShapePanel.render(null);
  renderTimeline();
}
```

Update `PANEL_NAV_HANDLERS`:

```js
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, "image-box": openImageBoxPanel, shape: openShapePanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel };
```

- [ ] **Step 6: Add the `"shape"` case to `reRenderAfterRestore`**

Add an `else if` branch right after the existing `image-box` branch:

```js
  } else if (t === "image-box") {
    const box = project.image_boxes.find((b) => selected.item && b.id === selected.item.id);
    if (box) onTimelineSelect({ type: "image-box", item: box }); else openFilesPanel();
  } else if (t === "shape") {
    const shape = project.shapes.find((s) => selected.item && s.id === selected.item.id);
    if (shape) onTimelineSelect({ type: "shape", item: shape }); else openFilesPanel();
  } else if (t === "text") {
```

- [ ] **Step 7: Manual verification**

Start the dev server, open a throwaway project in the browser:
1. Click the new SHAPE rail entry (between TEXT and CAPTIONS). Confirm `#panel-shape` opens showing an "ADD SHAPE" dashed button.
2. Click "ADD SHAPE". Confirm a 300x300 blue rounded-rect-free (0 radius) square appears centered on the stage, and the panel switches to its Box tab showing X/Y/WIDTH/HEIGHT.
3. Drag the shape on stage — confirm it moves, and the X/Y fields update after drop.
4. Resize it via a corner handle — confirm WIDTH/HEIGHT update independently (no aspect lock).
5. Switch to the Style tab: change the fill color, drag opacity down to ~50%, set corner radius to 40. Confirm the on-stage shape updates live for each.
6. Switch to the Time tab: change START/DURATION. Confirm the shape's lane appears in the timeline's unified overlay row labeled "SHAPE" (this part will only render correctly once Task 12 lands — if it doesn't show yet, that's expected and fixed there).
7. Click Delete. Confirm the shape disappears from stage and the panel falls back to the empty "ADD SHAPE" state.
8. Add a shape again, reload the page (or trigger undo/redo with Ctrl+Z/Ctrl+Y after another edit) — confirm the shape and its selection survive.

- [ ] **Step 8: Commit**

```bash
git add static/panel-nav.js
git commit -m "Add SHAPE rail entry and selection routing for the shape overlay panel"
```

---

### Task 12: Shape lane in the timeline's overlay row

**Files:**
- Modify: `static/timeline.js`

**Interfaces:**
- Consumes: `OverlayLayers.mergedEntries` (Task 7, now includes `kind: "shape"` entries).
- Produces: `renderOverlaysRow` renders a "SHAPE" label + resizable block for shape entries; `setRowVisible("overlays", ...)`'s condition includes `project.shapes`.

- [ ] **Step 1: Manual verification plan**

`timeline.js`'s rendering functions are DOM-bound (same category as the rest of this file — no dedicated test file exists for `renderOverlaysRow` today). Verification is manual, at the end of this task, continuing from Task 11's Step 7.6 above.

- [ ] **Step 2: Update the lane label**

In `static/timeline.js`, inside `renderOverlaysRow`, change:

```js
      text.textContent = entry.kind === "text" ? "TEXT" : entry.kind === "video_box" ? "VIDEO BOX" : "IMAGE BOX";
```

to:

```js
      text.textContent = entry.kind === "text" ? "TEXT" : entry.kind === "video_box" ? "VIDEO BOX" : entry.kind === "image_box" ? "IMAGE BOX" : "SHAPE";
```

- [ ] **Step 3: Add the shape branch to the lane-content `if`/`else if` chain**

Change the final `else {` (currently handling `image_box`) to an `else if (entry.kind === "image_box") {`, and add a new `else {` branch for `"shape"` after it:

```js
      } else if (entry.kind === "image_box") {
        const b = entry.item;
        const isSel = !!selected && selected.type === "image-box" && !!selected.item && selected.item.id === b.id;
        const name = b.file_path.split(/[\\/]/).pop();
        addBlock(laneTrack, b.start * px, b.duration * px, name, isSel,
          () => onSelect({ type: "image-box", item: b }), { resizable: true });
        laneTrack.lastElementChild.dataset.blockId = b.id;
      } else {
        const s = entry.item;
        const isSel = !!selected && selected.type === "shape" && !!selected.item && selected.item.id === s.id;
        addBlock(laneTrack, s.start * px, s.duration * px, "Shape", isSel,
          () => onSelect({ type: "shape", item: s }), { resizable: true });
        laneTrack.lastElementChild.dataset.blockId = s.id;
      }
```

- [ ] **Step 4: Update `setRowVisible("overlays", ...)`'s condition**

Change:

```js
    setRowVisible("overlays", (project.text_blocks || []).length > 0 || (project.video_boxes || []).length > 0 || (project.image_boxes || []).length > 0);
```

to:

```js
    setRowVisible("overlays", (project.text_blocks || []).length > 0 || (project.video_boxes || []).length > 0 || (project.image_boxes || []).length > 0 || (project.shapes || []).length > 0);
```

- [ ] **Step 5: Update the file's overlay-row header comment**

Find the comment block starting `// lanes inside #row-overlays (top = highest z_index = frontmost)...` above `renderOverlaysRow` and update the label list it mentions:

```js
  // lanes inside #row-overlays (top = highest z_index = frontmost), replacing the old separate
  // TEXT/VIDEO BOX rows. Each lane still renders its item exactly as before (time-positioned
  // block, resize handle for text/image boxes/shapes, drag-to-timeline for video boxes) — only
  // the vertical grouping/order changed. #label-overlays gets one
  // "TEXT"/"VIDEO BOX"/"IMAGE BOX"/"SHAPE" label per lane, height-matched to its lane.
  // Reordering (drag handle) is wired in static/timeline-overlay-layer-drag.js via
  // OverlayLayers.mergedEntries/renumber.
```

- [ ] **Step 6: Manual verification**

Continue the Task 11 manual test: with a shape added and its START/DURATION set, confirm its lane appears in the unified overlay row labeled "SHAPE", with a resize handle at each end (drag one to change duration) and a drag grip to reorder it against other overlay layers (text blocks/boxes).

- [ ] **Step 7: Commit**

```bash
git add static/timeline.js
git commit -m "Render shape layers in the timeline's unified overlay row"
```

---

### Task 13: Wire shape rendering into the stage's playback pipeline

**Files:**
- Modify: `static/preview.js`
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: `ShapePreview.{render, setOnActivate}` (Task 9).
- Produces: shapes repaint on every timeupdate/seek/virtual-clock tick and on `Preview.load()`; a Select-tool click on an unselected shape opens its panel, mirroring the existing `VideoBoxPreview.setOnActivate`/`ImageBoxPreview.setOnActivate` wiring.

- [ ] **Step 1: Manual verification plan**

Covered by Task 11's Step 7 manual test (drag/resize/style edits only repaint correctly once this task's render calls are in place) — if Task 11's stage interactions didn't visually update live before this task, they will after.

- [ ] **Step 2: Add `ShapePreview.render` calls in `preview.js`**

In `static/preview.js`, update `renderOverlaysAt`:

```js
  function renderOverlaysAt(timelineTime) {
    timeEl.textContent = timelineTime.toFixed(1);
    if (textProject) renderText(textProject, textPresets, timelineTime);
    if (textProject) renderCaptions(textProject, textPresets, timelineTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], timelineTime);
    if (textProject) ImageBoxPreview.render(textProject.image_boxes || [], timelineTime);
    if (textProject) ShapePreview.render(textProject.shapes || [], timelineTime);
  }
```

And `virtualTick`:

```js
    if (textProject) renderText(textProject, textPresets, virtualTime);
    if (textProject) renderCaptions(textProject, textPresets, virtualTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
    if (textProject) ImageBoxPreview.render(textProject.image_boxes || [], virtualTime);
    if (textProject) ShapePreview.render(textProject.shapes || [], virtualTime);
```

- [ ] **Step 3: Wire `ShapePreview.setOnActivate` in `editor.js`**

In `static/editor.js`, add directly after the existing `ImageBoxPreview.setOnActivate(...)` block:

```js
// Same wiring as VideoBoxPreview.setOnActivate/ImageBoxPreview.setOnActivate above, mirrored
// for shapes.
ShapePreview.setOnActivate((shapeId) => {
  const shape = project.shapes.find((s) => s.id === shapeId);
  if (!shape) return;
  onTimelineSelect({ type: "shape", item: shape });
  ShapePreview.render(project.shapes, Preview.currentTimelineTime());
});
```

- [ ] **Step 4: Manual verification**

Repeat Task 11's Step 7 manual test end-to-end: adding, dragging, resizing, styling, timing, and deleting a shape should all now visibly repaint correctly, including a plain stage click on an unselected shape (with Select tool active) opening its panel. Also verify: undo (Ctrl+Z) after deleting a shape brings it back on stage.

- [ ] **Step 5: Commit**

```bash
git add static/preview.js static/editor.js
git commit -m "Wire ShapePreview into the stage playback/render pipeline"
```

---

### Task 14: Update the CLAUDE.md codebase map

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: an updated File structure tree (new files: `app/shape_render.py`, `static/shape-defaults.js`, `static/shape-color.js`, `static/shape-preview.js`, `static/panel-shape.js`, `static/css/components/shape-panel.css`) and a new "Vector shapes" entry in the Inventory section, following the existing "Video & image boxes" section's format and level of detail.

- [ ] **Step 1: Write the map update**

Add one-line entries for each new file to the File structure tree (`app/` section: `shape_render.py` after `mask_image.py`; `static/` section: `shape-defaults.js`/`shape-color.js` after the other pure-module entries near `format-run-write.js`, `shape-preview.js` after `image-box-preview.js`, `panel-shape.js` after `panel-image-box.js`; `static/css/components/` section: `shape-panel.css` after `image-box-panel.css`).

Add a new subsection to the Inventory, after "Video & image boxes" and before "Box edge mask" (or after "Box edge mask" — either placement is fine, pick whichever reads better against the current file since both features touch the same box panels):

```markdown
### Vector shapes (overlay layer)

A free-form rectangle overlay with fill color, opacity, and corner radius — a full citizen of the unified overlay z-order stack, added via a dedicated SHAPE rail entry (no add-from-media picker, no edge-mask tab — corner radius already covers its shaping need).

- `ShapeLayer` in `app/models.py` — `start`/`duration` timeline seconds (same convention as `ImageBoxLayer`), `x`/`y`/`width`/`height` px on the 1080x1920 canvas (free-form — no aspect lock, unlike `VideoBoxLayer`/`ImageBoxLayer`), `fill_color`, `opacity` (0.0-1.0), `corner_radius` px, `z_index: int = -1` (same convention as the other box layers).
- `app/shape_render.py` — `write_shape_png(path, width, height, fill_color, opacity, corner_radius)`: rasterizes a filled rounded-rect RGBA PNG via Pillow, alpha = `round(opacity * 255)` inside the rect (clamped `corner_radius` to `min(width, height) / 2`), 0 outside.
- `app/timeline.py` — `shape_end(s)` (mirrors `image_box_end`); `banded_layers()` includes a `"shape"` band per `ShapeLayer`, sorted into the same z-order chain as text/video-box/image-box bands.
- `app/ffmpeg_cmd.py` — a `"shape"` band composites its pre-rendered PNG directly via `overlay` (no scale/alphamerge step — the PNG is already exactly the shape's own size with its fill/opacity baked into its own alpha).
- `app/main.py` — the export route always rasterizes one `{name}-{id[:8]}-band{i}-shape.png` sidecar per `ShapeLayer` (not optional, unlike the edge-mask feature's mask PNGs) and includes `p.shapes` in the banded-export trigger condition.
- `static/shape-defaults.js` — `ShapeDefaults.centeredShape()`: the one place default field values for a newly-created shape live (300x300, centered, `#4C6FFF`, full opacity, no radius, 3s duration).
- `static/shape-color.js` — `ShapeColor.toRgba(hex, opacity)`: pure hex+opacity -> CSS `rgba()` string, used for the stage's live fill.
- `static/shape-preview.js` — `window.ShapePreview.{render, setSelectedShape, setOnActivate}`: mounts one `<div class="shape-box">` per visible shape into `#overlay`, mirrors `image-box-preview.js` minus mask-guide handling; resize is free-form (no aspect lock).
- `static/panel-shape.js` — `window.ShapePanel.{render, createShape}`: the `#panel-shape` context section — Box (X/Y/WIDTH/HEIGHT)/Style (fill color, opacity, corner radius)/Time (START/DURATION) tabs, Delete footer; mirrors `panel-image-box.js` minus the add-picker and Mask tab.
- `static/panel-nav.js` — SHAPE rail entry (between TEXT and CAPTIONS) opens `#panel-shape` via `openShapePanel()`; `onTimelineSelect`/`reRenderAfterRestore` handle `type: "shape"` the same way they handle `"image-box"`.
- `static/timeline.js` — `renderOverlaysRow` renders a shape's lane labeled "SHAPE" with a resize handle (start/duration), alongside text/video-box/image-box lanes in the unified overlay z-order row.
- `static/timeline-overlay-layers.js` — `mergedEntries`/`renumber` include shapes in the cross-layer z-order list.
- `static/css/components/shape-panel.css` — `#panel-shape`'s internal layout, mirrors `image-box-panel.css`.
- `static/css/components/stage.css` — `.shape-box` base styling (position/box-sizing), alongside `.video-box`/`.image-box`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md map for the vector shape overlay feature"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), rasterization (Task 2), export banding (Tasks 3-5), stage rendering/drag/resize (Tasks 9, 13), panel Box/Style/Time tabs (Task 10), SHAPE rail entry (Task 11), unified overlay z-order + timeline lane (Tasks 7, 12), CLAUDE.md map (Task 14) — every spec section has a task.
- **Deviation from the original spec's "Add entry point" wording:** the spec (written before this plan's codebase read-through) described the rail entry as immediately inserting a shape, mirroring what TEXT's rail entry *used* to do. A closer look at `static/panel-nav.js` showed TEXT's rail entry no longer inserts immediately — it arms `ToolMode` instead (`remove-text-tool-top-bar`, 2026-07-30) — so no other rail entry in this codebase does an immediate-insert-on-click today. This plan instead has the SHAPE rail entry open `#panel-shape` (showing an "ADD SHAPE" dashed button when nothing's selected), exactly matching how the VIDEO BOX and IMAGE BOX rail entries already behave. This is a closer fit to current conventions than the spec's literal wording and doesn't change the feature's actual capability (one click still creates a shape — it's two clicks instead of one, consistent with every other box-layer type).
- **Placeholder scan:** no TBD/TODO; every step has complete code.
- **Type consistency:** `ShapeLayer`'s field names (`fill_color`, `opacity`, `corner_radius`, `start`, `duration`, `x`, `y`, `width`, `height`, `z_index`) are used identically across Tasks 1-13, including in `ShapeDefaults.centeredShape()`'s returned object shape (Task 6) and `panel-shape.js`'s field reads/writes (Task 10). `window.ShapePanel.{render, createShape}` and `window.ShapePreview.{render, setSelectedShape, setOnActivate}` names match between their defining tasks (9, 10) and every consumer (11, 12, 13).
