# Timeline VIDEO-row Thumbnails (Filmstrip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a real filmstrip (sampled source-video frames) inside each VIDEO-row timeline clip block, redrawing with more/fewer distinct frames as timeline zoom changes.

**Architecture:** Backend generates one cached horizontal sprite-sheet JPEG per media file (`data/filmstrips/{media_id}.jpg`, one sampled frame per `frame_interval` seconds, tiled via ffmpeg's `tile` filter). Frontend derives the same frame layout from `MediaItem.duration` (already known client-side) via a pure JS mirror of the two Python layout functions, fetches the sprite once per media id, and draws per-clip `<canvas>` slices of it inside each timeline block, resampled on every re-render (including zoom changes).

**Tech Stack:** FastAPI route + ffmpeg subprocess (Python), vanilla JS + Canvas 2D (frontend). No new dependencies.

## Global Constraints

- Sprite frame size: `FRAME_W = 40`, `FRAME_H = 60` px (2:3 aspect), defined once in `app/filmstrip.py` and mirrored as constants in `static/filmstrip-layout.js` — keep both files' header comments cross-referencing each other so a future edit to one is a visible prompt to check the other.
- Max sampled frames per sprite: `120` (bounds ffmpeg cost/sprite width for long source clips).
- Cache invalidation: by absence only (same convention as `data/thumbnails/` and `data/peaks/`) — no mtime/hash checks.
- Follow existing patterns exactly: `app/filmstrip.py` mirrors `app/waveform.py`'s shape; `static/timeline-video-row.js` mirrors `static/timeline-audio-row.js`'s shape; `static/api-get-media-filmstrip.js` mirrors `static/api-get-media-thumbnail.js` verbatim except for the endpoint path.
- Every new/edited `static/*.js` and `app/*.py` file gets a 2-3 line header comment per this repo's convention (see any existing file for the pattern).
- No inline `style="..."` attributes — all new CSS lives in `static/css/components/timeline.css`.

---

### Task 1: Pure frame-layout functions (`app/filmstrip.py`)

**Files:**
- Create: `app/filmstrip.py`
- Test: `tests/test_filmstrip.py`

**Interfaces:**
- Produces: `frame_interval(duration: float, max_frames: int = 120) -> float`, `frame_count(duration: float, interval: float) -> int`. Task 2 and Task 4 both depend on these exact names/signatures (Task 4's JS mirror must match this logic exactly).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_filmstrip.py`:

```python
from app.filmstrip import frame_interval, frame_count

def test_frame_interval_is_one_second_under_the_cap():
    assert frame_interval(45.0) == 1.0
    assert frame_interval(120.0) == 1.0

def test_frame_interval_scales_up_past_the_cap():
    # 240s at max_frames=120 must yield an interval that keeps frame_count <= 120
    interval = frame_interval(240.0, max_frames=120)
    assert interval == 2.0

def test_frame_interval_handles_zero_or_negative_duration():
    assert frame_interval(0.0) == 1.0
    assert frame_interval(-5.0) == 1.0

def test_frame_count_matches_expected_sampling():
    assert frame_count(45.0, 1.0) == 45
    assert frame_count(0.4, 1.0) == 1  # always at least 1 frame

def test_frame_count_never_zero():
    assert frame_count(0.0, 1.0) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_filmstrip.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.filmstrip'`

- [ ] **Step 3: Write the implementation**

Create `app/filmstrip.py`:

```python
# Timeline VIDEO-row filmstrip generation: pure frame-layout math (frame_interval,
# frame_count) plus generate_filmstrip, which extracts sampled frames from a source
# media file and tiles them into one cached horizontal sprite-sheet JPEG via ffmpeg.
# Exposes frame_interval, frame_count, generate_filmstrip, FRAME_W, FRAME_H.
# Depends on app.media's registry-PATH ffmpeg resolution and is_image_path.
# frame_interval/frame_count are mirrored byte-for-byte in static/filmstrip-layout.js —
# keep both in sync.
import math
import subprocess
from pathlib import Path
from app.media import _resolve_cmd, _refreshed_path

FRAME_W = 40
FRAME_H = 60

def frame_interval(duration: float, max_frames: int = 120) -> float:
    if duration <= 0:
        return 1.0
    return max(1.0, duration / max_frames)

def frame_count(duration: float, interval: float) -> int:
    if duration <= 0:
        return 1
    return max(1, math.ceil(duration / interval))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_filmstrip.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/filmstrip.py tests/test_filmstrip.py
git commit -m "feat: add pure frame-layout math for timeline filmstrips"
```

---

### Task 2: Sprite-sheet generation (`generate_filmstrip`)

**Files:**
- Modify: `app/filmstrip.py`
- Test: `tests/test_filmstrip.py`

**Interfaces:**
- Consumes: `frame_interval`, `frame_count`, `FRAME_W`, `FRAME_H` (Task 1); `app.media._resolve_cmd`, `app.media._refreshed_path`, `app.media.is_image_path` (existing).
- Produces: `generate_filmstrip(media_id: str, file_path: str, data_dir: Path) -> Path`. Task 3 depends on this exact signature.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_filmstrip.py`:

```python
from unittest.mock import patch
from app.filmstrip import generate_filmstrip

def test_generate_filmstrip_video_samples_and_tiles_frames(tmp_path, monkeypatch):
    captured_cmd = {}
    def fake_run(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        (tmp_path / "filmstrips" / "media-1.jpg").write_bytes(b"fake-sprite")
    monkeypatch.setattr("app.filmstrip.subprocess.run", fake_run)
    monkeypatch.setattr("app.filmstrip.probe_duration", lambda path: 45.0)

    result = generate_filmstrip("media-1", "c.mp4", tmp_path)

    assert result == tmp_path / "filmstrips" / "media-1.jpg"
    cmd_str = " ".join(captured_cmd["cmd"])
    assert "fps=1/1.0" in cmd_str
    assert "tile=45x1" in cmd_str

def test_generate_filmstrip_image_yields_single_frame_sprite(tmp_path, monkeypatch):
    captured_cmd = {}
    def fake_run(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        (tmp_path / "filmstrips" / "media-2.jpg").write_bytes(b"fake-sprite")
    monkeypatch.setattr("app.filmstrip.subprocess.run", fake_run)
    monkeypatch.setattr("app.filmstrip.probe_duration", lambda path: 0.0)

    generate_filmstrip("media-2", "c.jpg", tmp_path)

    cmd_str = " ".join(captured_cmd["cmd"])
    assert "tile=1x1" in cmd_str

def test_generate_filmstrip_reuses_cached_file(tmp_path, monkeypatch):
    filmstrip_dir = tmp_path / "filmstrips"
    filmstrip_dir.mkdir()
    cached = filmstrip_dir / "media-3.jpg"
    cached.write_bytes(b"already-cached")

    def fake_run(cmd, **kwargs):
        raise AssertionError("should not invoke ffmpeg when a cached filmstrip exists")
    monkeypatch.setattr("app.filmstrip.subprocess.run", fake_run)

    result = generate_filmstrip("media-3", "c.mp4", tmp_path)
    assert result == cached
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_filmstrip.py -v`
Expected: FAIL with `ImportError: cannot import name 'generate_filmstrip'`

- [ ] **Step 3: Write the implementation**

Append to `app/filmstrip.py` (add these imports to the top alongside the existing ones — replace the existing `import subprocess` / `from pathlib import Path` / `from app.media import ...` line with):

```python
import math
import subprocess
from pathlib import Path
from app.media import _resolve_cmd, _refreshed_path, is_image_path, probe_duration
```

Then append:

```python
def generate_filmstrip(media_id: str, file_path: str, data_dir: Path) -> Path:
    """Generate a horizontal sprite-sheet JPEG of sampled frames for a media file.
    For videos, samples one frame every frame_interval() seconds up to frame_count()
    frames; for images, ffmpeg's fps filter naturally yields a single tile. Returns
    the path to the cached sprite."""
    filmstrip_dir = Path(data_dir) / "filmstrips"
    filmstrip_dir.mkdir(parents=True, exist_ok=True)
    filmstrip_path = filmstrip_dir / f"{media_id}.jpg"

    if filmstrip_path.exists():
        return filmstrip_path

    duration = 0.0 if is_image_path(file_path) else probe_duration(file_path)
    interval = frame_interval(duration)
    count = frame_count(duration, interval)

    scale_pad = f"scale={FRAME_W}:-1:force_original_aspect_ratio=decrease,pad={FRAME_W}:{FRAME_H}:(ow-iw)/2:(oh-ih)/2"
    vf = f"fps=1/{interval},{scale_pad},tile={count}x1"
    cmd = ["ffmpeg", "-y", "-i", file_path, "-vf", vf, "-frames:v", "1", "-q:v", "5", str(filmstrip_path)]

    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    subprocess.run(resolved, capture_output=True, check=True, env=env)
    return filmstrip_path
```

Update the module header comment (top of file) to:

```python
# Timeline VIDEO-row filmstrip generation: pure frame-layout math (frame_interval,
# frame_count) plus generate_filmstrip, which extracts sampled frames from a source
# media file and tiles them into one cached horizontal sprite-sheet JPEG via ffmpeg,
# cached at data/filmstrips/{media_id}.jpg (invalidated by absence only, same
# convention as app/media.py's thumbnail cache and app/waveform.py's peaks cache).
# Exposes frame_interval, frame_count, generate_filmstrip, FRAME_W, FRAME_H.
# Depends on app.media's registry-PATH ffmpeg resolution, is_image_path, probe_duration.
# frame_interval/frame_count are mirrored byte-for-byte in static/filmstrip-layout.js —
# keep both in sync.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_filmstrip.py -v`
Expected: PASS (8 tests total)

- [ ] **Step 5: Commit**

```bash
git add app/filmstrip.py tests/test_filmstrip.py
git commit -m "feat: generate cached filmstrip sprite sheets for timeline clips"
```

---

### Task 3: `GET /api/media/{media_id}/filmstrip` route

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_main.py`

**Interfaces:**
- Consumes: `filmstrip.generate_filmstrip(media_id, path, data_dir)` (Task 2).
- Produces: route function `media_filmstrip(media_id: str, path: str) -> FileResponse`, mounted at `GET /api/media/{media_id}/filmstrip`. Task 5's `Api.getMediaFilmstrip` depends on this exact URL shape.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_main.py` (near the existing `test_media_peaks_route_returns_peaks`):

```python
def test_media_filmstrip_route_returns_file_response(monkeypatch, tmp_path):
    from app.main import media_filmstrip
    fake_path = tmp_path / "sprite.jpg"
    fake_path.write_bytes(b"fake-sprite")
    monkeypatch.setattr("app.main.filmstrip.generate_filmstrip",
                         lambda media_id, path, data_dir: fake_path)
    result = media_filmstrip("abc123", "clip.mp4")
    assert result.path == str(fake_path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py::test_media_filmstrip_route_returns_file_response -v`
Expected: FAIL with `ImportError: cannot import name 'media_filmstrip'`

- [ ] **Step 3: Write the implementation**

In `app/main.py`, change the import line (line 10):

```python
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform, filmstrip
```

Then add this route directly below the existing `media_thumbnail` route (after line 130's closing of that function):

```python
@app.get("/api/media/{media_id}/filmstrip")
def media_filmstrip(media_id: str, path: str) -> FileResponse:
    filmstrip_path = filmstrip.generate_filmstrip(media_id, path, DATA_DIR)
    return FileResponse(filmstrip_path)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_main.py::test_media_filmstrip_route_returns_file_response -v`
Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass, no regressions

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_main.py
git commit -m "feat: add GET /api/media/{id}/filmstrip route"
```

---

### Task 4: `static/filmstrip-layout.js` (pure JS mirror)

**Files:**
- Create: `static/filmstrip-layout.js`
- Modify: `static/index.html`

**Interfaces:**
- Produces: `window.Filmstrip.frameInterval(duration, maxFrames = 120)`, `window.Filmstrip.frameCount(duration, interval)`, `window.Filmstrip.FRAME_W`, `window.Filmstrip.FRAME_H`. Task 6 depends on all four.

- [ ] **Step 1: Write the implementation**

Create `static/filmstrip-layout.js`:

```javascript
// Pure JS mirror of app/filmstrip.py's frame_interval/frame_count/FRAME_W/FRAME_H —
// lets the client compute a media file's cached filmstrip sprite layout from
// MediaItem.duration alone, with no extra network round trip. Keep this file's
// logic identical to app/filmstrip.py; a change to one should prompt a check of
// the other. Exposes window.Filmstrip.{frameInterval, frameCount, FRAME_W, FRAME_H}.
window.Filmstrip = (() => {
  const FRAME_W = 40;
  const FRAME_H = 60;

  function frameInterval(duration, maxFrames = 120) {
    if (duration <= 0) return 1.0;
    return Math.max(1.0, duration / maxFrames);
  }

  function frameCount(duration, interval) {
    if (duration <= 0) return 1;
    return Math.max(1, Math.ceil(duration / interval));
  }

  return { frameInterval, frameCount, FRAME_W, FRAME_H };
})();
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, add this line immediately before the existing `<script src="/static/timeline-audio-row.js"></script>` (around line 784):

```html
<script src="/static/filmstrip-layout.js"></script>
```

- [ ] **Step 3: Manually verify it loads with no console errors**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000` in the browser, open devtools console, confirm no errors and `window.Filmstrip.frameInterval(45)` (typed into the console) returns `1`.

- [ ] **Step 4: Commit**

```bash
git add static/filmstrip-layout.js static/index.html
git commit -m "feat: add pure JS mirror of filmstrip frame-layout math"
```

---

### Task 5: `static/api-get-media-filmstrip.js`

**Files:**
- Create: `static/api-get-media-filmstrip.js`
- Modify: `static/index.html`

**Interfaces:**
- Consumes: `GET /api/media/{media_id}/filmstrip?path=...` (Task 3).
- Produces: `Api.getMediaFilmstrip(mediaId, filePath) -> Promise<string | null>`. Task 6 depends on this.

- [ ] **Step 1: Write the implementation**

Create `static/api-get-media-filmstrip.js` (mirrors `static/api-get-media-thumbnail.js` verbatim except the endpoint path):

```javascript
// Get a media item's timeline filmstrip sprite sheet — returns a data URL or null on error.
window.Api = window.Api || {};
window.Api.getMediaFilmstrip = async (mediaId, filePath) => {
  try {
    const resp = await fetch(`/api/media/${encodeURIComponent(mediaId)}/filmstrip?path=${encodeURIComponent(filePath)}`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, add this line immediately after the existing `<script src="/static/api-get-media-thumbnail.js"></script>` (line 736):

```html
<script src="/static/api-get-media-filmstrip.js"></script>
```

- [ ] **Step 3: Manually verify it loads with no console errors**

Reload the app in the browser, open devtools console, confirm no errors and `typeof Api.getMediaFilmstrip === "function"` (typed into the console) returns `true`.

- [ ] **Step 4: Commit**

```bash
git add static/api-get-media-filmstrip.js static/index.html
git commit -m "feat: add Api.getMediaFilmstrip client fetch helper"
```

---

### Task 6: `static/timeline-video-row.js` — draw filmstrip canvases into VIDEO-row blocks

**Files:**
- Create: `static/timeline-video-row.js`
- Modify: `static/timeline.js:237-247`, `static/index.html`

**Interfaces:**
- Consumes: `window.Filmstrip.{frameInterval, frameCount, FRAME_W, FRAME_H}` (Task 4), `Api.getMediaFilmstrip` (Task 5), a `ClipLayer`-shaped object (`media_id`, `in_point`, `out_point`, `speed`), a `MediaItem`-shaped object (`id`, `file_path`, `duration`).
- Produces: `window.TimelineVideoRow.render(blockDiv, clip, media, px, onReady)`.

- [ ] **Step 1: Write the implementation**

Create `static/timeline-video-row.js`:

```javascript
// VIDEO-row clip-block filmstrips: draws sampled source-video frames into each clip's
// timeline block by slicing the media's cached sprite sheet (see app/filmstrip.py /
// api-get-media-filmstrip.js) onto a <canvas> mounted inside the block, behind the
// existing label span. Sprites are fetched once per media id and cached client-side
// in filmstripCache; fetches are fire-and-forget — onReady fires once a fetch
// resolves so the caller can re-render with the now-cached image. A clip whose
// sprite hasn't loaded yet (or failed to fetch) is left showing the block's existing
// CSS striped-placeholder background, since no canvas is mounted in that case.
// Redrawing on every timeline render() (including zoom changes) is what makes the
// filmstrip resample to more/fewer distinct frames as px/sec changes.
// Exposes window.TimelineVideoRow.render(blockDiv, clip, media, px, onReady).
window.TimelineVideoRow = (() => {
  const filmstripCache = {}; // mediaId -> "loading" | "error" | HTMLImageElement

  // Returns a loaded sprite image synchronously if cached; otherwise kicks off a
  // fetch (once per media id) and returns null. onReady fires when that fetch
  // resolves into a usable image.
  function getFilmstripImage(mediaId, filePath, onReady) {
    const cached = filmstripCache[mediaId];
    if (cached === "loading" || cached === "error") return null;
    if (cached) return cached;
    filmstripCache[mediaId] = "loading";
    Api.getMediaFilmstrip(mediaId, filePath).then((url) => {
      if (!url) {
        filmstripCache[mediaId] = "error";
        return;
      }
      const img = new Image();
      img.onload = () => {
        filmstripCache[mediaId] = img;
        onReady();
      };
      img.onerror = () => {
        filmstripCache[mediaId] = "error";
      };
      img.src = url;
    });
    return null;
  }

  function drawFilmstrip(blockDiv, clip, media, px, img) {
    const rowHeight = blockDiv.clientHeight || 56;
    const widthPx = parseFloat(blockDiv.style.width) || 0;
    if (widthPx <= 0) return;

    const canvas = document.createElement("canvas");
    canvas.className = "video-clip-filmstrip";
    canvas.width = Math.max(1, Math.round(widthPx));
    canvas.height = rowHeight;
    blockDiv.insertBefore(canvas, blockDiv.firstChild);

    const ctx = canvas.getContext("2d");
    const interval = Filmstrip.frameInterval(media.duration);
    const count = Filmstrip.frameCount(media.duration, interval);
    const speed = clip.speed || 1;
    const frameSpanPx = Math.max(1, (interval / speed) * px);

    for (let x = 0; x < widthPx; x += frameSpanPx) {
      const sourceTime = clip.in_point + (x / px) * speed;
      const frameIndex = Math.min(count - 1, Math.max(0, Math.round(sourceTime / interval)));
      const spanW = Math.min(frameSpanPx, widthPx - x);
      ctx.drawImage(
        img,
        frameIndex * Filmstrip.FRAME_W, 0, Filmstrip.FRAME_W, Filmstrip.FRAME_H,
        x, 0, spanW, rowHeight
      );
    }
  }

  function render(blockDiv, clip, media, px, onReady) {
    if (!media) return;
    const img = getFilmstripImage(media.id, media.file_path, onReady);
    if (!img) return;
    drawFilmstrip(blockDiv, clip, media, px, img);
  }

  return { render };
})();
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, add this line immediately after the newly-added `<script src="/static/api-get-media-filmstrip.js"></script>` and before `<script src="/static/timeline-audio-row.js"></script>`:

```html
<script src="/static/timeline-video-row.js"></script>
```

- [ ] **Step 3: Call it from the VIDEO-row loop**

In `static/timeline.js`, the VIDEO-row loop currently reads (lines 237-247):

```javascript
    const videoTrack = clearTrack("row-video");
    let acc = 0;
    for (const c of clips) {
      const d = clipDuration(c);
      const media = project.media_library.find((m) => m.id === c.media_id);
      const name = (media && (media.name || media.file_path.split(/[\\/]/).pop())) || c.file_path.split(/[\\/]/).pop();
      const isSel = !!selected && selected.type === "video" && selected.item.id === c.id;
      addBlock(videoTrack, acc * px, d * px, name, isSel, () => onSelect({ type: "video", item: c }));
      videoTrack.lastElementChild.dataset.clipId = c.id;
      acc += d;
    }
```

Change it to:

```javascript
    const videoTrack = clearTrack("row-video");
    let acc = 0;
    for (const c of clips) {
      const d = clipDuration(c);
      const media = project.media_library.find((m) => m.id === c.media_id);
      const name = (media && (media.name || media.file_path.split(/[\\/]/).pop())) || c.file_path.split(/[\\/]/).pop();
      const isSel = !!selected && selected.type === "video" && selected.item.id === c.id;
      addBlock(videoTrack, acc * px, d * px, name, isSel, () => onSelect({ type: "video", item: c }));
      const blockEl = videoTrack.lastElementChild;
      blockEl.dataset.clipId = c.id;
      if (media && media.kind !== "audio") {
        TimelineVideoRow.render(blockEl, c, media, px, () => renderTimeline());
      }
      acc += d;
    }
```

(`media.kind !== "audio"` guards against a stray audio-typed `MediaItem` ever ending up referenced by a `ClipLayer` — video and image clips both get a filmstrip, since `generate_filmstrip` degenerates images to a 1-frame sprite.)

- [ ] **Step 4: Add the CSS for the filmstrip canvas and label legibility scrim**

In `static/css/components/timeline.css`, immediately after the existing block (around line 223):

```css
.timeline-row[data-row="video"] .timeline-block span {
  color: var(--text-secondary);
}
```

add:

```css
/* Filmstrip canvas (static/timeline-video-row.js): fills the block behind the label,
   which gets a bottom scrim so the filename stays legible over arbitrary video content. */
.video-clip-filmstrip {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.timeline-row[data-row="video"] .timeline-block span {
  position: relative;
  z-index: 1;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
  display: inline-block;
  width: 100%;
  padding: 2px 7px;
}
```

Note: this second rule for `.timeline-block span` overrides the existing `padding: 0 7px` declared earlier in the file for `.timeline-block span` (general rule) — the video-row-scoped rule wins by specificity, matching this file's existing pattern of row-scoped overrides.

- [ ] **Step 5: Manually verify in the browser**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`, open a project with at least one video clip on the timeline.
- Confirm the VIDEO-row clip block shows real video frames instead of the striped placeholder (may take a moment on first load while the sprite generates).
- Use the timeline's zoom +/- controls and confirm the filmstrip redraws with a different number of visible frame segments.
- Confirm the clip's filename label is still legible over the frame content.
- Import a photo/image clip and confirm its block also shows a (single, non-animating) frame rather than erroring.
- Check the browser devtools console for errors.

- [ ] **Step 6: Commit**

```bash
git add static/timeline-video-row.js static/timeline.js static/index.html static/css/components/timeline.css
git commit -m "feat: draw real filmstrips in timeline VIDEO-row clip blocks"
```

---

### Task 7: Update the codebase map

**Files:**
- Modify: `CLAUDE.md` (project root)

- [ ] **Step 1: Add entries to the File structure tree and Inventory**

In `CLAUDE.md`'s `## File structure` tree under `app/`, add a line for `filmstrip.py` (alphabetically near `waveform.py`):

```
  filmstrip.py           # timeline VIDEO-row filmstrip generation: pure frame_interval()/frame_count() + generate_filmstrip() (added 2026-07-23, timeline thumbnails): caches one horizontal sprite-sheet JPEG per media file at data/filmstrips/{media_id}.jpg, one sampled frame per frame_interval() seconds (capped at 120 frames), via ffmpeg's fps+tile filters; images degenerate to a 1-frame sprite through the same code path (no branching)
```

Under `static/`, add entries near the audio-row/thumbnail entries for `filmstrip-layout.js`, `api-get-media-filmstrip.js`, and `timeline-video-row.js`, and note the `timeline.js` VIDEO-row loop change, following the existing prose style used for similar recent additions (see the `timeline-audio-row.js` / `api-get-media-peaks.js` entries as a model).

In `## Inventory`, under the "Timeline" feature section, add a short paragraph describing the filmstrip pipeline (backend module, route, frontend fetch+draw module), cross-referencing the File structure entries above rather than duplicating their detail.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for timeline filmstrip feature"
```
