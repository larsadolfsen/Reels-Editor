### Task 1: Backend data model

**Status:** not started

**Files:**
- Modify: `app/models.py`
- Modify: `app/timeline.py`
- Test: `tests/test_models.py`
- Test: `tests/test_timeline.py`

**Interfaces:**
- Produces: `app.models.VideoBoxLayer` (fields: `id, media_id, file_path, in_point, out_point, start, x, y, width, height, z_index`), `app.models.Project.video_boxes: list[VideoBoxLayer]`, `app.models.TextBlockLayer.z_index: int`, `app.models.CaptionTrack.z_index: int`, `app.timeline.video_box_end(v) -> float`, `app.timeline.banded_layers(project) -> list[dict]`.

- [ ] **Step 1: Write failing model tests**

Add to `tests/test_models.py`:

```python
from app.models import VideoBoxLayer

def test_video_box_layer_defaults():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920)
    assert v.in_point == 0.0
    assert v.start == 0.0
    assert (v.x, v.y, v.width) == (0, 0, 1080)
    assert v.z_index == -1
    assert len(v.id) == 32

def test_video_box_layer_round_trip():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", in_point=1.0, out_point=5.0,
                       start=2.0, x=10, y=20, width=400, height=711, z_index=3)
    assert VideoBoxLayer.model_validate_json(v.model_dump_json()) == v

def test_project_video_boxes_default_empty():
    p = Project(name="reel1")
    assert p.video_boxes == []

def test_project_with_video_box_round_trip():
    p = Project(name="reel1", video_boxes=[VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920)])
    assert Project.model_validate_json(p.model_dump_json()) == p

def test_text_block_layer_z_index_defaults_zero():
    t = TextBlockLayer(heading="H", preset_id="x")
    assert t.z_index == 0

def test_caption_track_z_index_defaults_zero():
    c = CaptionTrack()
    assert c.z_index == 0
```

Update the existing `test_project_defaults` test (same file) to also assert `p.video_boxes == []`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'VideoBoxLayer'` and `AttributeError` on `.video_boxes`/`.z_index`.

- [ ] **Step 3: Add VideoBoxLayer and z_index fields to app/models.py**

Add this class after `ClipLayer` in `app/models.py`:

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
```

Add `z_index: int = 0` as a field on `TextBlockLayer` (after `end: float = 3.0`) and on `CaptionTrack` (after `words: list[CaptionWord] = []`).

Add `video_boxes: list[VideoBoxLayer] = []` to `Project`, right after `clips: list[ClipLayer] = []`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add VideoBoxLayer model and z_index fields for cross-layer ordering"
```

- [ ] **Step 6: Write failing timeline tests**

`tests/test_timeline.py` currently starts with `from app.models import ClipLayer` and `from app.timeline import ordered, clip_duration, sequence_duration, locate` — change these two lines to:

```python
from app.models import ClipLayer, VideoBoxLayer, TextBlockLayer, Project
from app.timeline import ordered, clip_duration, sequence_duration, locate, video_box_end, banded_layers
```

Then add to `tests/test_timeline.py`:

```python

def test_video_box_end_derived_from_trim():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", in_point=1.0, out_point=4.0, start=2.0, height=1920)
    assert video_box_end(v) == 5.0  # 2.0 + (4.0 - 1.0)

def test_banded_layers_no_video_boxes_is_one_text_band():
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="A", preset_id="p1", z_index=0)])
    bands = banded_layers(p)
    assert len(bands) == 1
    assert bands[0]["kind"] == "text"
    assert bands[0]["text_blocks"] == p.text_blocks

def test_banded_layers_no_text_no_video_boxes_is_empty():
    p = Project(name="r")
    assert banded_layers(p) == []

def test_banded_layers_video_box_between_two_text_blocks():
    low = TextBlockLayer(heading="LOW", preset_id="p1", z_index=0)
    high = TextBlockLayer(heading="HIGH", preset_id="p2", z_index=10)
    box = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920, z_index=5)
    p = Project(name="r", text_blocks=[low, high], video_boxes=[box])
    bands = banded_layers(p)
    assert [b["kind"] for b in bands] == ["text", "video_box", "text"]
    assert bands[0]["text_blocks"] == [low]
    assert bands[1]["video_box"] == box
    assert bands[2]["text_blocks"] == [high]

def test_banded_layers_video_box_below_all_text():
    text = TextBlockLayer(heading="A", preset_id="p1", z_index=0)
    box = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920, z_index=-1)
    p = Project(name="r", text_blocks=[text], video_boxes=[box])
    bands = banded_layers(p)
    assert [b["kind"] for b in bands] == ["video_box", "text"]
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -v`
Expected: FAIL — `ImportError: cannot import name 'video_box_end'`

- [ ] **Step 8: Implement video_box_end and banded_layers in app/timeline.py**

Add to `app/timeline.py` (needs `VideoBoxLayer` and `Project` imported — update its top import line to `from app.models import ClipLayer, VideoBoxLayer, Project`):

```python
def video_box_end(v: VideoBoxLayer) -> float:
    return v.start + (v.out_point - v.in_point)

def banded_layers(project: Project) -> list[dict]:
    """Partitions text blocks and video boxes into z-order bands for export compositing:
    consecutive text blocks accumulate into one 'text' band; each video box is its own
    'video_box' band. Consumed by app.main's export route to decide how many ASS files to
    render, and by app.ffmpeg_cmd to build the alternating ass-burn/overlay filter chain."""
    entries = sorted(
        [("text", b) for b in project.text_blocks] + [("video_box", v) for v in project.video_boxes],
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
            bands.append({"kind": "video_box", "video_box": item})
    if pending_text:
        bands.append({"kind": "text", "text_blocks": pending_text})
    return bands
```

Also update `app/timeline.py`'s header comment (line 1) to: `# Pure timeline math: order clips, durations, map timeline time to (clip, source time), and merge text/video-box layers into z-order export bands.`

- [ ] **Step 9: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py tests/test_models.py -v`
Expected: PASS (all)

- [ ] **Step 10: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (no regressions elsewhere)

- [ ] **Step 11: Commit**

```bash
git add app/timeline.py tests/test_timeline.py
git commit -m "feat: add video_box_end and banded_layers for cross-layer z-order export"
```

**Next session:** Task 2 depends on nothing but this task's model shape (for markup/wiring field names). Dispatch as a subagent (subagent-driven): "Implement Task 2 (frontend scaffolding) from `docs/superpowers/plans/2026-07-19-phase-3-video-box/task-2-scaffolding.md` — Task 1 (backend data model) is complete and merged."
