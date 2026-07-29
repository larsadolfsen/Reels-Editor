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

CLIP_PATH_DRIVER = """
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const window = {};
eval(src);
const cases = JSON.parse(process.argv[3]);
console.log(JSON.stringify(cases.map(c => window.BoxMask.clipPath(c))));
"""

# Test cases for clipPath: each is a box object, paired with expected CSS output.
CLIP_PATH_CASES = [
    ({"width": 100, "height": 200, "mask_enabled": False, "mask_angle": 0, "mask_offset": 0, "mask_flip": False}, ""),
    ({"width": 100, "height": 200, "mask_enabled": True, "mask_angle": 0, "mask_offset": 0, "mask_flip": False}, "polygon(0.0000% 0.0000%, 50.0000% 0.0000%, 50.0000% 100.0000%, 0.0000% 100.0000%)"),
    ({"width": 100, "height": 200, "mask_enabled": True, "mask_angle": 0, "mask_offset": 1000, "mask_flip": False}, "polygon(0.0000% 0.0000%, 100.0000% 0.0000%, 100.0000% 100.0000%, 0.0000% 100.0000%)"),
    ({"width": 100, "height": 200, "mask_enabled": True, "mask_angle": 0, "mask_offset": -1000, "mask_flip": False}, "polygon(0% 0%, 0% 0%, 0% 0%)"),
    ({"width": 100, "height": 200, "mask_enabled": True, "mask_angle": 45, "mask_offset": 0, "mask_flip": False}, "polygon(0.0000% 0.0000%, 100.0000% 0.0000%, 100.0000% 25.0000%, 0.0000% 75.0000%)"),
    ({"width": 100, "height": 200, "mask_enabled": True}, "polygon(0.0000% 0.0000%, 50.0000% 0.0000%, 50.0000% 100.0000%, 0.0000% 100.0000%)"),
]

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


def test_js_clip_path_returns_exact_css_strings(tmp_path):
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not installed; JS clipPath coverage not checked")
    driver = tmp_path / "driver.js"
    driver.write_text(CLIP_PATH_DRIVER, encoding="utf-8")

    boxes = [case[0] for case in CLIP_PATH_CASES]
    proc = subprocess.run(
        [node, str(driver), str(BOX_MASK_JS), json.dumps(boxes)],
        capture_output=True, text=True, check=True)
    js_results = json.loads(proc.stdout)

    assert len(js_results) == len(CLIP_PATH_CASES)
    for (box, expected_css), actual_css in zip(CLIP_PATH_CASES, js_results):
        assert actual_css == expected_css, f"clipPath output differs for {box}: got {actual_css!r}"
