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
