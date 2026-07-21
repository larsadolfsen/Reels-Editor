# Audio Batch 5: Peaks Route + Waveform Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `app/waveform.py` module decodes a media file to real peak-amplitude data (cached to disk), served via `GET /api/media/{media_id}/peaks`, and the timeline AUDIO row renders real per-clip waveforms (trimmed to each clip's in/out, scaled to zoom) plus the music track's waveform, replacing today's dummy pseudo-random bars.

**Architecture:** Backend half mirrors `app/media.py`'s existing ffprobe-resolution pattern (`_resolve_cmd`/`_refreshed_path`) for a new ffmpeg PCM-decode call, with a pure downsampling function tested independently of subprocess. Frontend half is a new `static/timeline-audio-row.js` file (one subfeature, one file, per project convention) that `static/timeline.js`'s `render()` delegates to instead of calling `renderAudioTrack` — canvases per clip (and one for music) drawn from peaks fetched via a new `static/api-get-media-peaks.js`, with a client-side in-memory cache so each media id is fetched once per page load.

**Tech Stack:** Python `struct` module for raw PCM parsing (no numpy dependency — codebase has none), ffmpeg subprocess (mocked in tests), pytest; vanilla JS `<canvas>` 2D rendering (no chart library — codebase has no JS dependencies at all).

> **Re-verified 2026-07-21 against current `main` — two things changed:**
> 1. `app/main.py` now imports `from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs` (an unrelated background export-progress-job feature added `export_jobs`) — Task 2's import-line edit below has been updated to append `waveform` to this current line, not the shorter one originally assumed.
> 2. `static/timeline.js` gained **real zoom** since this plan was written (`#zoom-in`/`#zoom-out` toolbar buttons now work; the old fixed `const PX_PER_SEC = 60` is gone, replaced by a zoom-aware `currentPxPerSecond()` function and a live `Timeline.PX_PER_SEC` getter). This plan's original "zoom is unwired, skip that check" note is now **wrong** — zoom is real, and Task 4 has been updated to pass the render-local `px` variable (not a module constant) into `TimelineAudioRow.render`, and to verify waveforms rescale correctly when zooming.

## Global Constraints

**Requires Batch 1** (`MediaItem.kind`, `Project.music`) **merged first.** Independent of Batches 2-4.

- Peaks cache: `data/peaks/{media_id}.json`, gitignored, invalidated by absence only (confirmed decision — media files are immutable once imported).
- `samples_per_second=10` default resolution (per spec).
- A clip whose media has no audio (`has_audio=False`) draws a flat line, not an error.
- Single AUDIO row in v1 — the music waveform renders in the same row as clip waveforms (spec: "beneath/behind"), not a separate row.
- No new JS dependency — plain `<canvas>` 2D context, matching this codebase's zero-build-step, zero-library convention.

---

### Task 1: `app/waveform.py` — pure downsampling + cache-aware `peaks_for_media`

**Files:**
- Create: `app/waveform.py`
- Test: `tests/test_waveform.py`

**Interfaces:**
- Consumes: `app.media._resolve_cmd`, `app.media._refreshed_path` (already defined, `app/media.py:13-34`).
- Produces: `downsample_pcm16(pcm_bytes: bytes, sample_rate: int, samples_per_second: int) -> list[float]` (pure), `peaks_for_media(media_id: str, file_path: str, data_dir, samples_per_second: int = 10) -> list[float]` (cache-aware, subprocess-backed) — consumed by Task 2 (the `/api/media/{id}/peaks` route).

- [ ] **Step 1: Write the failing tests for the pure downsampler**

Create `tests/test_waveform.py`:

```python
# Tests for app.waveform: pure PCM downsampling (no ffmpeg) + cache-aware peaks_for_media
# (ffmpeg subprocess mocked, matching tests/test_media.py's pattern).
import json
import struct
from unittest.mock import patch, MagicMock
from app.waveform import downsample_pcm16, peaks_for_media

def _pcm16(samples: list[int]) -> bytes:
    return struct.pack(f"<{len(samples)}h", *samples)

def test_downsample_silence_gives_zero_peaks():
    pcm = _pcm16([0] * 8000)  # 1 second of silence at 8000 Hz
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert len(peaks) == 10
    assert all(p == 0.0 for p in peaks)

def test_downsample_full_scale_gives_peak_one():
    pcm = _pcm16([32767] * 800)  # one bucket's worth at 8000Hz/10sps = 800 samples/bucket
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert len(peaks) == 1
    assert peaks[0] == 1.0

def test_downsample_takes_max_abs_per_bucket():
    samples = [0] * 799 + [-16384]  # one bucket, one loud negative sample
    pcm = _pcm16(samples)
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert peaks[0] == 16384 / 32768.0

def test_downsample_bucket_count_matches_duration():
    pcm = _pcm16([100] * 8000 * 3)  # 3 seconds
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert len(peaks) == 30

def test_downsample_empty_pcm_gives_empty_peaks():
    assert downsample_pcm16(b"", sample_rate=8000, samples_per_second=10) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_waveform.py -v`
Expected: FAIL — `app.waveform` module doesn't exist yet (`ModuleNotFoundError`).

- [ ] **Step 3: Write the pure downsampler**

Create `app/waveform.py`:

```python
# Waveform peak extraction for the timeline AUDIO row. downsample_pcm16 is a pure function
# (no I/O); peaks_for_media decodes a media file to mono 16-bit PCM via ffmpeg and caches the
# downsampled result as JSON at data/peaks/{media_id}.json — gitignored, invalidated by absence
# only (media files are immutable once imported, so no mtime/hash check is needed).
# Exposes downsample_pcm16, peaks_for_media. Depends on app.media's registry-PATH ffmpeg resolution.
import json
import struct
import subprocess
from pathlib import Path
from app.media import _resolve_cmd, _refreshed_path

PCM_SAMPLE_RATE = 8000  # decode target rate; low enough that even long files decode fast

def downsample_pcm16(pcm_bytes: bytes, sample_rate: int, samples_per_second: int) -> list[float]:
    """Pure: little-endian 16-bit mono PCM -> per-bucket peak amplitude, normalized 0..1."""
    n = len(pcm_bytes) // 2
    if n == 0:
        return []
    samples = struct.unpack(f"<{n}h", pcm_bytes[: n * 2])
    bucket_size = max(1, sample_rate // samples_per_second)
    peaks = []
    for i in range(0, len(samples), bucket_size):
        bucket = samples[i:i + bucket_size]
        peak = max(abs(s) for s in bucket) / 32768.0
        peaks.append(min(peak, 1.0))
    return peaks

def _ffmpeg_pcm_cmd(path: str) -> list[str]:
    return ["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(PCM_SAMPLE_RATE), "-"]

def _decode_pcm(path: str) -> bytes:
    cmd, env = _resolve_cmd(_ffmpeg_pcm_cmd(path), _refreshed_path())
    out = subprocess.run(cmd, capture_output=True, check=True, env=env)
    return out.stdout

def _cache_path(media_id: str, data_dir) -> Path:
    d = Path(data_dir) / "peaks"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{media_id}.json"

def peaks_for_media(media_id: str, file_path: str, data_dir, samples_per_second: int = 10) -> list[float]:
    cache_file = _cache_path(media_id, data_dir)
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    pcm = _decode_pcm(file_path)
    peaks = downsample_pcm16(pcm, sample_rate=PCM_SAMPLE_RATE, samples_per_second=samples_per_second)
    cache_file.write_text(json.dumps(peaks), encoding="utf-8")
    return peaks
```

- [ ] **Step 4: Run the pure-downsampler tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_waveform.py -v`
Expected: PASS (all 5 tests — `peaks_for_media` isn't tested yet, only imported successfully).

- [ ] **Step 5: Write the failing tests for `peaks_for_media`'s cache + subprocess behavior**

Add to `tests/test_waveform.py`:

```python
def test_peaks_for_media_decodes_and_caches(tmp_path):
    pcm = _pcm16([32767] * 800)
    with patch("app.waveform.subprocess.run") as run:
        run.return_value = MagicMock(stdout=pcm, returncode=0)
        peaks = peaks_for_media("media1", "song.mp3", tmp_path, samples_per_second=10)
    assert peaks == [1.0]
    cache_file = tmp_path / "peaks" / "media1.json"
    assert cache_file.exists()
    assert json.loads(cache_file.read_text()) == [1.0]

def test_peaks_for_media_uses_cache_without_calling_ffmpeg(tmp_path):
    cache_dir = tmp_path / "peaks"
    cache_dir.mkdir()
    (cache_dir / "media1.json").write_text(json.dumps([0.5, 0.6]))
    with patch("app.waveform.subprocess.run") as run:
        peaks = peaks_for_media("media1", "song.mp3", tmp_path, samples_per_second=10)
    run.assert_not_called()
    assert peaks == [0.5, 0.6]
```

- [ ] **Step 6: Run tests to verify they fail, then pass**

Run: `.venv/Scripts/python -m pytest tests/test_waveform.py -v`
Expected: first run FAILs only if `peaks_for_media` has a bug; given Step 3's implementation, these should already PASS — run once to confirm, since `peaks_for_media` was written in Step 3 before these tests existed. If it fails, fix `app/waveform.py` before proceeding.

- [ ] **Step 7: Commit**

```bash
git add app/waveform.py tests/test_waveform.py
git commit -m "feat: add app.waveform peaks extraction + disk cache"
```

---

### Task 2: `GET /api/media/{media_id}/peaks` route

**Files:**
- Modify: `app/main.py` (imports at top, add route near the existing `GET /api/probe` route)
- Test: `tests/test_main.py`

**Interfaces:**
- Consumes: `app.waveform.peaks_for_media` (Task 1).
- Produces: route `GET /api/media/{media_id}/peaks?path=<file_path>` returning `list[float]` — consumed by Task 3 (`static/api-get-media-peaks.js`). Mirrors the existing `GET /api/probe?path=...` pattern (id + path both come from the client, no project lookup needed).

- [ ] **Step 1: Write the failing test**

`tests/test_main.py` calls route functions directly (no `TestClient`/`client` fixture in this codebase — see e.g. `test_export_writes_ass_file_and_burns_it_in`, which imports the route function straight from `app.main` and calls it). Follow that exact pattern:

```python
def test_media_peaks_route_returns_peaks(monkeypatch):
    from app.main import media_peaks
    monkeypatch.setattr("app.main.waveform.peaks_for_media",
                         lambda media_id, file_path, data_dir, samples_per_second=10: [0.1, 0.2, 0.3])
    result = media_peaks("abc123", "song.mp3")
    assert result == [0.1, 0.2, 0.3]
```

Also add `media_peaks` to the existing `from app.main import ...` line at the top of `tests/test_main.py` (currently line 4) if you prefer a module-level import over the inline one above — match whichever style the rest of the file already uses for newly-tested route functions.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k media_peaks -v`
Expected: FAIL — 404, route doesn't exist yet.

- [ ] **Step 3: Add the route**

In `app/main.py`, add `waveform` to the existing import line — on current `main` this is `from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs` (the `export_jobs` name comes from an unrelated background export-progress-job feature; keep it):

```python
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform
```

Then add the route near `GET /api/probe`:

```python
@app.get("/api/media/{media_id}/peaks")
def media_peaks(media_id: str, path: str) -> list[float]:
    return waveform.peaks_for_media(media_id, path, DATA_DIR)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k media_peaks -v`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_main.py
git commit -m "feat: add GET /api/media/{id}/peaks route"
```

---

### Task 3: `static/api-get-media-peaks.js`

**Files:**
- Create: `static/api-get-media-peaks.js`
- Modify: `static/index.html` (add script tag alongside the other `api-*.js` tags, right after the existing `api-export-project.js` tag — find it by name, its line number has drifted since this plan was written)

**Interfaces:**
- Produces: `window.Api.getMediaPeaks(mediaId, filePath) -> Promise<number[]>` — consumed by Task 4.

- [ ] **Step 1: Create the file**

`static/api-get-media-peaks.js`:

```javascript
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.

// Fetches real waveform peak data for a media item. Returns number[] (0..1 per bucket), or [] if
// the request failed (caller falls back to drawing a flat line, same as no-audio media).
window.Api.getMediaPeaks = async function getMediaPeaks(mediaId, filePath) {
  const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/peaks?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) return [];
  return res.json();
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, insert after the existing `<script src="/static/api-export-project.js"></script>` line (its exact line number has drifted since this plan was written — find it by tag name):

```html
<script src="/static/api-get-media-peaks.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add static/api-get-media-peaks.js static/index.html
git commit -m "feat: add Api.getMediaPeaks"
```

---

### Task 4: `static/timeline-audio-row.js` — real waveform rendering

**Files:**
- Create: `static/timeline-audio-row.js`
- Modify: `static/timeline.js` (remove `renderAudioTrack`, call the new module from `render()`)
- Modify: `static/index.html` (add script tag before `timeline.js`, since `timeline.js`'s `render()` will call it)
- Modify: `static/css/components/timeline.css` (AUDIO row layout: absolute-positioned canvases instead of the old flex dummy-bar row)

**Interfaces:**
- Consumes: `window.Api.getMediaPeaks` (Task 3); `ClipLayer.in_point/out_point/media_id`, `MediaItem.duration/has_audio/file_path`, `MusicTrack.media_id` (Batch 1); `Timeline`'s existing `ordered`/`clipDuration` helpers (already private to `timeline.js` — this new module needs its own copies since it doesn't have access to `timeline.js`'s closure; duplicating a 3-line helper is consistent with how `preview.js` already duplicates `ordered`/`clipDuration` from `app/timeline.py` rather than sharing state across files).
- Produces: `window.TimelineAudioRow.render(project, pxPerSec)` — called from `static/timeline.js`'s `render()` in place of the old `renderAudioTrack(contentWidth)` call.

- [ ] **Step 1: Create the file**

`static/timeline-audio-row.js`:

```javascript
// AUDIO timeline row: real per-clip waveforms (each clip's canvas is trimmed to its in/out
// range and scaled to the timeline's px/sec) plus the music track's waveform layered behind
// them in the same row (single AUDIO row in v1, no separate music row). Peaks are fetched once
// per media id via Api.getMediaPeaks and cached client-side in peaksCache; fetches are
// fire-and-forget — onReady is called once a fetch resolves so the caller can re-render with
// the now-cached data. A clip whose media has no audio (or peaks fetch failed) draws a flat line.
// Exposes window.TimelineAudioRow.render(project, pxPerSec, onReady).
window.TimelineAudioRow = (() => {
  const peaksCache = {}; // mediaId -> number[] | "loading"

  function ordered(clips) {
    return [...clips].sort((a, b) => a.order - b.order);
  }
  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }

  // Returns cached peaks synchronously if available; otherwise kicks off a fetch (once per
  // media id) and returns null. onReady fires when that fetch resolves.
  function getPeaks(mediaId, filePath, onReady) {
    const cached = peaksCache[mediaId];
    if (cached && cached !== "loading") return cached;
    if (cached !== "loading") {
      peaksCache[mediaId] = "loading";
      Api.getMediaPeaks(mediaId, filePath).then((peaks) => {
        peaksCache[mediaId] = peaks;
        onReady();
      });
    }
    return null;
  }

  function drawWaveform(canvas, peaks, alpha = 1) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = getComputedStyle(canvas).color;
    if (!peaks || peaks.length === 0) {
      ctx.fillRect(0, mid - 1, w, 2);
      return;
    }
    const barWidth = Math.max(1, w / peaks.length);
    peaks.forEach((p, i) => {
      const barH = Math.max(2, p * h);
      ctx.fillRect(i * barWidth, mid - barH / 2, Math.max(1, barWidth - 1), barH);
    });
  }

  // Slices a media file's full-duration peaks array down to the [inPoint, outPoint) window
  // a clip actually uses, proportional to the media's total duration.
  function sliceForTrim(peaks, mediaDuration, inPoint, outPoint) {
    if (!peaks || peaks.length === 0 || !mediaDuration) return peaks || [];
    const startIdx = Math.floor((inPoint / mediaDuration) * peaks.length);
    const endIdx = Math.ceil((outPoint / mediaDuration) * peaks.length);
    return peaks.slice(Math.max(0, startIdx), Math.min(peaks.length, endIdx));
  }

  function makeCanvas(className, left, width, height) {
    const canvas = document.createElement("canvas");
    canvas.className = className;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = height;
    canvas.style.left = `${left}px`;
    canvas.style.width = `${width}px`;
    return canvas;
  }

  function render(project, pxPerSec, onReady) {
    const track = document.getElementById("row-audio");
    track.innerHTML = "";
    const rowHeight = track.clientHeight || 40;

    let acc = 0;
    for (const c of ordered(project.clips || [])) {
      const d = clipDuration(c);
      const media = (project.media_library || []).find((m) => m.id === c.media_id);
      const canvas = makeCanvas("audio-clip-waveform", acc * pxPerSec, d * pxPerSec, rowHeight);
      track.appendChild(canvas);
      if (media && media.has_audio) {
        const peaks = getPeaks(media.id, media.file_path, onReady);
        drawWaveform(canvas, sliceForTrim(peaks, media.duration, c.in_point, c.out_point));
      } else {
        drawWaveform(canvas, []);
      }
      acc += d;
    }

    if (project.music) {
      const media = (project.media_library || []).find((m) => m.id === project.music.media_id);
      if (media) {
        const width = Math.max(1, acc * pxPerSec); // music is cut at the reel's end, never longer
        const canvas = makeCanvas("audio-music-waveform", 0, width, rowHeight);
        track.appendChild(canvas);
        const peaks = getPeaks(media.id, media.file_path, onReady);
        const reelFraction = media.duration > 0 ? Math.min(1, acc / media.duration) : 1;
        const sliceEnd = Math.round((peaks || []).length * reelFraction) || (peaks || []).length;
        drawWaveform(canvas, (peaks || []).slice(0, sliceEnd), 0.5);
      }
    }
  }

  return { render };
})();
```

- [ ] **Step 2: Wire it into `timeline.js`, removing the old dummy generator**

> **Re-verified 2026-07-21:** `static/timeline.js` gained real zoom since this plan was written.
> `PX_PER_SEC` is no longer a fixed module constant — `render(project, timelineTime, selected,
> onSelect, actions = {})` now computes a local `px = currentPxPerSecond()` per call (reflecting
> the current zoom level) and uses `px` everywhere a fixed pixel scale used to be assumed. Pass
> that same local `px`, not a constant, into `TimelineAudioRow.render` below — this also means
> waveforms automatically rescale on every zoom-button click, since `render()` reruns and recomputes
> `px` each time.

In `static/timeline.js`, delete the `renderAudioTrack` function entirely, and change its call site inside `render()` — currently:

```javascript
    renderAudioTrack(contentWidth);
```

to:

```javascript
    TimelineAudioRow.render(project, px, () => renderTimeline());
```

(`px` is the local variable `render()` already computes via `currentPxPerSecond()` earlier in the function — do not reintroduce a `PX_PER_SEC` constant. `renderTimeline()` is the global wrapper in `static/editor.js` that re-invokes `Timeline.render(...)` with the current playhead/selection state — calling it as the `onReady` callback re-renders the whole timeline once a peaks fetch resolves, same as any other project-state change. This is safe to call repeatedly since `TimelineAudioRow`'s `peaksCache` makes every media id's fetch fire only once.)

Also remove the now-stale header comment line "The AUDIO row is a static dummy waveform (no audio-track feature yet)" from `static/timeline.js`'s top-of-file comment, replacing it with a one-line note that the AUDIO row now renders real per-clip + music waveforms via `TimelineAudioRow` (see that file for detail).

- [ ] **Step 3: Add the script tag before `timeline.js`**

In `static/index.html`, insert before the existing `<script src="/static/timeline.js"></script>` line (its exact line number has drifted since this plan was written — find it by tag name; it must still load after `preview.js` and `preview-audio.js` per Batch 4):

```html
<script src="/static/timeline-audio-row.js"></script>
```

- [ ] **Step 4: Update CSS — AUDIO row switches from flex dummy-bars to absolute-positioned canvases**

In `static/css/components/timeline.css`, replace the "AUDIO row: dummy static waveform placeholder" block (currently lines 221-234):

```css
/* AUDIO row: real per-clip + music waveforms, absolutely positioned canvases (same
   coordinate system as .timeline-block in the other rows) so they line up with clip
   boundaries and scale with zoom. */
.timeline-row[data-row="audio"] .row-track {
  position: relative;
  padding: 0;
}

.audio-clip-waveform,
.audio-music-waveform {
  position: absolute;
  top: 0;
  height: 100%;
  color: var(--text-dim);
  pointer-events: none;
}

.audio-music-waveform {
  color: var(--accent);
  z-index: 0;
}

.audio-clip-waveform {
  z-index: 1;
}
```

- [ ] **Step 5: Manual live-verify on a throwaway project (no automated JS test exists for canvas rendering)**

Open a throwaway project with at least one clip that has real audio, one video-only clip (no audio track — confirm it draws a flat line), and (via the same console-based simulation as Batch 4 Task 4) a `project.music` entry. Confirm:
- Each clip's waveform segment lines up with that clip's block in the VIDEO row above it (same x position and width).
- Trimming a clip's IN/OUT (via the VIDEO panel) changes which portion of the waveform shows.
- Zoom is implemented (`#zoom-in`/`#zoom-out` toolbar buttons) — click both and confirm the AUDIO row's waveforms rescale in lockstep with the VIDEO row's clip blocks above them, not just the blocks alone.
- The music waveform renders behind/beneath the clip waveforms in the same row and is visually distinguishable (different color/opacity).
- No console errors; peaks fetch happens once per media id (check Network tab — not once per render call).

- [ ] **Step 6: Run the full pytest suite (regression check)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS (this task is frontend-only).

- [ ] **Step 7: Commit**

```bash
git add static/timeline-audio-row.js static/timeline.js static/index.html static/css/components/timeline.css
git commit -m "feat: replace dummy AUDIO row waveform with real per-clip + music peaks"
```

---

## Batch 5 Definition of Done

- [ ] `.venv/Scripts/python -m pytest -q` passes (full suite, including new `tests/test_waveform.py`).
- [ ] Manual live-verify (Task 4 Step 5) passed on a throwaway project.
- [ ] `data/peaks/` is gitignored (confirm `.gitignore` already covers `data/` broadly — check before adding a redundant entry).
- [ ] All changes committed.

Next: [Batch 6: VIDEO panel VOLUME group](2026-07-21-audio-batch-6-video-panel-volume.md).
