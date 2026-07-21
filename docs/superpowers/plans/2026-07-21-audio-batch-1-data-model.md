# Audio Batch 1: Data Model + Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ClipLayer.volume`/`muted`, `MediaItem.kind`, and a new `MusicTrack` entity on `Project.music` — the foundation every later audio batch builds on.

**Architecture:** Pure Pydantic model additions in `app/models.py`, all with defaults so existing saved-project JSON loads unchanged. No route or persistence-code changes needed — `app/store.py`'s `save_project`/`load_project` already round-trip the whole `Project` via `model_dump_json`/`model_validate_json`, so new fields are automatically included.

**Tech Stack:** Pydantic v2, pytest.

> **Re-verified 2026-07-21 against current `main`:** this branch was cut before two unrelated
> features merged — image/photo clips and background export-progress jobs. The image-clips
> feature already added `MediaItem.kind: str = "video"` (values `"video"`/`"image"`), so Task 2
> below only extends that field's documented values rather than adding it. `ClipLayer` and
> `Project` are otherwise unchanged from this plan's assumptions — Tasks 1 and 3 apply as written.

## Global Constraints

(See [master plan](2026-07-21-audio-subsystem-master.md) for the full list — this batch touches only the model-level constraints below.)

- `ClipLayer.volume: float = 1.0` (0.0–2.0) and `ClipLayer.muted: bool = False` — defaults preserve existing saved-project behavior.
- `MediaItem.kind: str = "video"` **(field already exists on `main`, values `"video"`/`"image"`)** — this batch adds `"audio"` as a third value for imported music files.
- `MusicTrack(id: str, media_id: str, volume: float = 0.3, muted: bool = False)`, `Project.music: MusicTrack | None = None`.

---

### Task 1: `ClipLayer.volume` and `ClipLayer.muted`

**Files:**
- Modify: `app/models.py:25-33` (`ClipLayer` class)
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `ClipLayer.volume: float` (default `1.0`), `ClipLayer.muted: bool` (default `False`) — consumed by Batch 2 (export) and Batch 4 (preview) and Batch 6 (VIDEO panel UI).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_clip_layer_volume_and_muted_defaults():
    from app.models import ClipLayer
    c = ClipLayer(media_id="m1", file_path="a.mp4", out_point=2, order=0)
    assert c.volume == 1.0
    assert c.muted is False

def test_clip_layer_volume_and_muted_round_trip():
    from app.models import ClipLayer
    c = ClipLayer(media_id="m1", file_path="a.mp4", out_point=2, order=0, volume=1.5, muted=True)
    loaded = ClipLayer.model_validate_json(c.model_dump_json())
    assert loaded.volume == 1.5
    assert loaded.muted is True

def test_clip_layer_old_saved_json_without_volume_fields_loads_with_defaults():
    from app.models import ClipLayer
    import json
    old_json = json.dumps({"id": "x", "media_id": "m1", "file_path": "a.mp4", "out_point": 2, "order": 0})
    loaded = ClipLayer.model_validate_json(old_json)
    assert loaded.volume == 1.0
    assert loaded.muted is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k volume_and_muted -v`
Expected: FAIL — `AttributeError` or Pydantic validation error, `volume`/`muted` not defined on `ClipLayer`.

- [ ] **Step 3: Add the fields**

In `app/models.py`, `ClipLayer` (around line 33, after `speed`):

```python
class ClipLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    in_point: float = 0.0   # seconds into source
    out_point: float        # seconds into source (exclusive end)
    order: int
    fill_mode: str = "fit"  # "fit" (letterbox, default) or "fill" (center-crop, no padding)
    speed: float = Field(default=1.0, gt=0)  # playback speed multiplier (UI clamps 0.5-2.0); gt=0 guards clip_duration's divide. timeline duration = (out-in)/speed
    volume: float = Field(default=1.0, ge=0.0, le=2.0)  # UI clamps 0.0-2.0; export volume=<v> filter, preview clamps to <=1.0 (HTML5 audio cap)
    muted: bool = False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k volume_and_muted -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add ClipLayer.volume/muted fields"
```

---

### Task 2: `MediaItem.kind` gains `"audio"`

> **Re-verified 2026-07-21 against current `main`:** an unrelated image-clips feature already
> landed `MediaItem.kind: str = "video"` (values `"video"`/`"image"`) before this branch existed.
> This task is now "add the `"audio"` value to an existing field," not "add the field" — the
> code and tests below reflect that; do not re-add the field itself.

**Files:**
- Modify: `app/models.py` (the `kind` field's inline comment only — the field itself already exists)
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: nothing new — `MediaItem.kind: str` already exists and already accepts any string value; this task only documents `"audio"` as a third supported value and proves it round-trips. Consumed by Batch 2/3 (export, to know which media are audio-only) and Batch 7 (AUDIO panel picker, to filter/label music files).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_media_item_kind_accepts_audio():
    from app.models import MediaItem
    m = MediaItem(file_path="song.mp3", duration=120, kind="audio")
    loaded = MediaItem.model_validate_json(m.model_dump_json())
    assert loaded.kind == "audio"
```

(`kind` already defaults to `"video"` and already round-trips any string value with no validation — so this test technically passes without any code change. It's still worth running once to confirm that assumption holds on the current codebase before moving on, rather than trusting the read above blindly.)

- [ ] **Step 2: Run the test to confirm it already passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k media_item_kind_accepts_audio -v`
Expected: PASS (no code change needed — `kind: str` has no enum/validator restricting its values).

- [ ] **Step 3: Update the field's inline comment to document `"audio"`**

In `app/models.py`, `MediaItem`'s `kind` field currently reads:

```python
    kind: str = "video"  # "video" or "image"
```

Change the comment only:

```python
    kind: str = "video"  # "video" | "image" | "audio" — "audio" for imported music files (mp3/wav/m4a/aac/ogg/flac), decided at import time from the file extension
```

- [ ] **Step 4: Run the full model test file**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: All PASS (no regressions — this step only touched a comment).

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "docs: document MediaItem.kind='audio' for music imports"
```

---

### Task 3: `MusicTrack` entity + `Project.music`

**Files:**
- Modify: `app/models.py` (add `MusicTrack` class after `CaptionTrack`, add `music` field to `Project`)
- Test: `tests/test_models.py`

**Interfaces:**
- Consumes: `new_id()` (app/models.py:7-8, already defined).
- Produces: `MusicTrack(id: str, media_id: str, volume: float = 0.3, muted: bool = False)`, `Project.music: MusicTrack | None = None` — consumed by Batch 3 (export amix), Batch 4 (preview `<audio>` sync), Batch 7 (AUDIO panel).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_music_track_defaults():
    from app.models import MusicTrack
    t = MusicTrack(media_id="m1")
    assert t.volume == 0.3
    assert t.muted is False
    assert isinstance(t.id, str) and t.id

def test_project_music_defaults_to_none():
    from app.models import Project
    p = Project(name="r")
    assert p.music is None

def test_project_music_round_trip():
    from app.models import Project, MusicTrack
    p = Project(name="r", music=MusicTrack(media_id="m1", volume=0.5, muted=True))
    loaded = Project.model_validate_json(p.model_dump_json())
    assert loaded.music is not None
    assert loaded.music.media_id == "m1"
    assert loaded.music.volume == 0.5
    assert loaded.music.muted is True

def test_project_old_saved_json_without_music_loads_as_none():
    from app.models import Project
    import json
    old_json = json.dumps({"id": "x", "name": "r"})
    loaded = Project.model_validate_json(old_json)
    assert loaded.music is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k music -v`
Expected: FAIL — `MusicTrack` not defined / `Project.music` not defined.

- [ ] **Step 3: Add `MusicTrack` and `Project.music`**

In `app/models.py`, add a new class after `CaptionTrack` (currently ending around line 129):

```python
class MusicTrack(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str          # links to a MediaItem with kind="audio" in project.media_library
    volume: float = Field(default=0.3, ge=0.0, le=2.0)
    muted: bool = False
    # Timing is fixed: starts at timeline t=0, cut at reel end. No loop/trim/start-offset in v1.
```

Then in `Project` (currently lines 131-146), add the field after `captions`:

```python
class Project(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    name: str
    width: int = 1080
    height: int = 1920
    fps: int = 30
    media_library: list[MediaItem] = []
    clips: list[ClipLayer] = []
    video_boxes: list[VideoBoxLayer] = []
    text_blocks: list[TextBlockLayer] = []
    text_presets: dict[str, TextPreset] = {}
    captions: CaptionTrack | None = None
    music: MusicTrack | None = None
    export_filename: str = ""
    export_quality: str = "high"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k music -v`
Expected: PASS

- [ ] **Step 5: Run the full model test file**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -v`
Expected: All PASS (no regressions from the three field additions).

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add MusicTrack entity and Project.music field"
```

---

### Task 4: Update the codebase map

**Files:**
- Modify: `CLAUDE.md` (Data model & persistence section, and Media library & import section)

- [ ] **Step 1: Add the new fields to the map's entity list**

Before editing, make sure this branch's `CLAUDE.md` is current — `main` has moved since this plan was written (image/photo-clips and background export-progress-job features both landed and both updated the map), so diff against `main`'s current `CLAUDE.md` rather than trusting this worktree's copy. Then, under "### Data model & persistence", extend the `app/models.py` bullet to mention `MusicTrack`, and under "### Media library & import" note that `MediaItem.kind` gained an `"audio"` value (the field itself is already documented there for `"video"`/`"image"`). Keep it to one clause each, matching the existing terse style (e.g. `MusicTrack(id, media_id, volume, muted)` one-liner) — this map entry will be superseded by fuller detail as Batches 2-7 land, so don't over-describe behavior that doesn't exist yet.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note audio data-model fields in codebase map"
```

---

## Batch 1 Definition of Done

- [ ] `.venv/Scripts/python -m pytest -q` passes (full suite, no regressions).
- [ ] `CLAUDE.md` mentions the three new fields.
- [ ] All changes committed on the current session branch.

Next: [Batch 2: Export — per-clip volume filters](2026-07-21-audio-batch-2-export-volume.md).
