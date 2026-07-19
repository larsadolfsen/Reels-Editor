# Phase 6 — Export Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final pass across the whole editor: confirm preview/export parity per layer type, fix the two remaining known limitations (video-only clips breaking export, a preview clip-join hiccup), and verify the whole milestone end-to-end with a real multi-layer reel.

**Architecture:** No new subsystems. Task 1 is a manual verification pass against the existing app. Task 2 adds a `has_audio` flag to `MediaItem`, probed via a new `ffprobe`-based helper, and threads it through `build_export_cmd`'s filter graph so a video-only clip gets a synthesized silent audio track (`anullsrc`) instead of breaking the concat filter. Task 3 investigates and fixes a preview-only playback issue in `static/preview.js`. Task 4 is a manual end-to-end pass plus one new automated smoke test exercising the full export pipeline (`app/main.py`'s `export_project`) with every layer type combined.

**Tech Stack:** FastAPI/Pydantic backend, vanilla-JS frontend (no build step), ffmpeg/ffprobe, pytest.

## Global Constraints

- No JS build step/bundler — vanilla JS only, existing file-per-component pattern.
- `static/*.js` and `static/css/**/*.css` files each open with a purpose comment; update it if a file's role changes.
- No inline `style="..."` in HTML/JS-rendered markup — styling lives in `static/css/**`.
- Backend: `MediaItem`/other Pydantic model changes must default cleanly so existing saved `data/projects/*.json` files keep loading without migration.
- Tests: `.venv/Scripts/python -m pytest -q` must pass before each commit that touches code.
- Follow existing test patterns exactly (see `tests/test_media.py`, `tests/test_ffmpeg_cmd.py`, `tests/test_main.py`) — route functions are called directly with `unittest.mock.patch`, not via `TestClient`.

---

## Task 1: Preview/export parity spot-checks

**Files:** none (manual verification; produces a bugfix task only if a mismatch is found — not scoped here).

**Interfaces:**
- Consumes: the running app (`.venv/Scripts/python -m uvicorn app.main:app --reload`), the export pipeline as it exists today.
- Produces: a pass/fail note per layer type, reported back before starting Task 2.

- [ ] **Step 1: Start the app and open it**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`.

- [ ] **Step 2: Text block + box parity**

Create or open a project with a styled text block (box background, border, some bold/italic/highlighted text via a `FormatRun`). Pause the preview at 2 timestamps within the block's `[start, end)` window. Note the on-screen position, size, and colors. Export the project (EXPORT panel → Export button). Use `ffprobe`/a media player to seek the exported mp4 to the same timestamps and screenshot or eyeball the frame. Confirm position/size/colors agree closely (visual-trust level, not pixel-perfect, per the original plan's accepted bar).

- [ ] **Step 3: Captions parity**

Same as Step 2, but for a project with transcribed/edited captions using both `current_word` and `progressive_fill` highlight modes. Pause at a timestamp mid-word for each mode, compare against the exported frame at that timestamp.

- [ ] **Step 4: Video box parity**

Same as Step 2, but for a project with a video box (position, size, start/end window). Pause at a timestamp inside the box's visible window, compare against the exported frame.

- [ ] **Step 5: Report findings**

If all three agree, note "parity confirmed" and proceed to Task 2. If any layer type shows a real mismatch (not just visual-trust-level fuzziness), stop and report it — it becomes its own bugfix task, scoped once the mismatch is understood, before continuing to Task 2.

---

## Task 2: Audio-stream fix — synthesize silent audio for video-only clips

**Files:**
- Modify: `app/models.py:10-13` (`MediaItem`)
- Modify: `app/media.py` (add `has_audio_stream`)
- Modify: `app/main.py:54-56` (`probe` route)
- Modify: `app/ffmpeg_cmd.py:12-24` (`build_export_cmd`)
- Modify: `static/api-probe-media.js` (doc comment only — response shape changes)
- Modify: `static/editor.js:641-664` (`addClip`)
- Test: `tests/test_media.py`
- Test: `tests/test_main.py`
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `app.media._resolve_cmd`, `app.media._refreshed_path` (existing, unchanged).
- Produces: `MediaItem.has_audio: bool` (new field, default `True`); `app.media.has_audio_stream(path: str) -> bool`; `GET /api/probe` now returns `{"duration": float, "has_audio": bool}`; `build_export_cmd` unchanged signature, but now looks up `p.media_library` to decide per-clip whether to synthesize silent audio.

- [ ] **Step 1: Add `has_audio` to `MediaItem`**

In `app/models.py`, change:
```python
class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    duration: float
```
to:
```python
class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    duration: float
    has_audio: bool = True
```

- [ ] **Step 2: Write the failing test for `has_audio_stream`**

Add to `tests/test_media.py`:
```python
from app.media import ffprobe_cmd, probe_duration, has_audio_stream

def test_has_audio_stream_true_when_ffprobe_reports_a_stream():
    with patch("app.media.subprocess.run") as r:
        r.return_value.stdout = "audio\n"
        assert has_audio_stream("c.mp4") is True

def test_has_audio_stream_false_when_ffprobe_reports_no_stream():
    with patch("app.media.subprocess.run") as r:
        r.return_value.stdout = ""
        assert has_audio_stream("c.mp4") is False
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: FAIL with `ImportError: cannot import name 'has_audio_stream'`

- [ ] **Step 4: Implement `has_audio_stream`**

In `app/media.py`, add after `probe_duration`:
```python
def has_audio_stream(path: str) -> bool:
    cmd = ["ffprobe", "-v", "error", "-select_streams", "a",
           "-show_entries", "stream=codec_type", "-of", "csv=p=0", path]
    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    out = subprocess.run(resolved, capture_output=True, text=True, check=True, env=env)
    return bool(out.stdout.strip())
```
Update the file's header comment (line 1-2) to also mention `has_audio_stream`.

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing test for the `/api/probe` route**

Add to `tests/test_main.py`:
```python
from app.main import probe

def test_probe_route_includes_has_audio():
    with patch("app.main.media.probe_duration", return_value=5.0), \
         patch("app.main.media.has_audio_stream", return_value=False):
        result = probe("c.mp4")
    assert result == {"duration": 5.0, "has_audio": False}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k probe_route -v`
Expected: FAIL — `result` only has `"duration"`, no `"has_audio"` key.

- [ ] **Step 8: Update the `/api/probe` route**

In `app/main.py`, change:
```python
@app.get("/api/probe")
def probe(path: str) -> dict:
    return {"duration": media.probe_duration(path)}
```
to:
```python
@app.get("/api/probe")
def probe(path: str) -> dict:
    return {"duration": media.probe_duration(path), "has_audio": media.has_audio_stream(path)}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k probe_route -v`
Expected: PASS

- [ ] **Step 10: Write the failing tests for `build_export_cmd`'s audio synthesis**

Add to `tests/test_ffmpeg_cmd.py` (add `MediaItem` to the existing `from app.models import Project, ClipLayer, VideoBoxLayer` import line):
```python
def test_video_only_clip_gets_synthesized_silent_audio():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=False)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0)])
    cmd = build_export_cmd(p, "out.mp4")
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc
    assert "concat=n=1:v=1:a=1" in fc

def test_mixed_audio_clips_input_indices_do_not_collide():
    p = Project(name="r", media_library=[
        MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=False),
        MediaItem(id="m1", file_path="b.mp4", duration=2, has_audio=True),
    ], clips=[
        ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0),
        ClipLayer(media_id="m1", file_path="b.mp4", in_point=0, out_point=2, order=1),
    ])
    cmd = build_export_cmd(p, "out.mp4")
    # input order must be: clip0 video/audio file, then the synthesized silence for clip0,
    # then clip1's file (which supplies both its own video and audio streams)
    ia, ilavfi, ib = cmd.index("a.mp4"), cmd.index("anullsrc=channel_layout=stereo:sample_rate=44100"), cmd.index("b.mp4")
    assert ia < ilavfi < ib
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[0:v]trim=start=0:end=2" in fc      # clip0 video reads real input 0
    assert "[1:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc  # clip0 audio reads synthesized input 1
    assert "[2:v]trim=start=0:end=2" in fc      # clip1 video reads real input 2
    assert "[2:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS[a1]" in fc  # clip1 audio reads its own input 2

def test_clip_with_no_media_library_entry_defaults_to_has_audio():
    # proj() in this file builds clips with media_id referencing MediaItems that don't exist
    # in an empty media_library — must not raise, must behave as if has_audio=True (today's behavior).
    cmd = build_export_cmd(proj(), "out.mp4")
    assert "anullsrc" not in " ".join(cmd)
```

- [ ] **Step 11: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: FAIL on the 2 new synthesis tests (video-only clip currently breaks the filter graph — references a nonexistent `[0:a]` stream — and produces no `anullsrc`). The third new test should already pass (documents current behavior).

- [ ] **Step 12: Implement the audio synthesis in `build_export_cmd`**

In `app/ffmpeg_cmd.py`, replace the clip-input loop:
```python
def build_export_cmd(p: Project, out_path: str, ass_path: str | None = None, bands: list[dict] | None = None, caption_ass_path: str | None = None) -> list[str]:
    clips = ordered(p.clips)
    media_by_id = {m.id: m for m in p.media_library}
    cmd = ["ffmpeg", "-y"]
    parts = []
    input_index = 0
    for i, c in enumerate(clips):
        v_idx = input_index
        cmd += ["-i", c.file_path]
        input_index += 1
        parts.append(
            f"[{v_idx}:v]trim=start={_num(c.in_point)}:end={_num(c.out_point)},setpts=PTS-STARTPTS,"
            f"scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
            f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={p.fps}[v{i}];")
        media = media_by_id.get(c.media_id)
        has_audio = media.has_audio if media else True
        if has_audio:
            parts.append(f"[{v_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS[a{i}];")
        else:
            a_idx = input_index
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            input_index += 1
            duration = c.out_point - c.in_point
            parts.append(f"[{a_idx}:a]atrim=start=0:end={_num(duration)},asetpts=PTS-STARTPTS[a{i}];")
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"
```
This replaces the original 5-line loop (`for i, c in enumerate(clips): cmd += ["-i", c.file_path]; parts.append(...)`) and the `streams`/`fc` lines stay as they were.

Then, further down in the same function, in the `bands` branch, change:
```python
    current = "[vc]"
    next_input_index = len(clips)
```
to:
```python
    current = "[vc]"
    next_input_index = input_index
```
(so video-box inputs added later don't collide with any synthesized-silence inputs interleaved among the clips).

Update the file's header comment (line 1-2) to mention silent-audio synthesis for video-only clips.

- [ ] **Step 13: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: PASS (all tests, old and new)

- [ ] **Step 14: Update the frontend to capture and store `has_audio`**

In `static/editor.js`, change `addClip`:
```javascript
async function addClip() {
  const path = await Api.pickFile();
  if (!path) return;
  const probeResult = await Api.probeMedia(path);
  if (!probeResult) { alert("probe failed"); return; }
  const { duration, has_audio } = probeResult;
  const mediaId = crypto.randomUUID().replaceAll("-", "");
  project.media_library.push({ id: mediaId, file_path: path, duration, has_audio });

  const id = crypto.randomUUID().replaceAll("-", "");
  clipDurations[id] = duration;
  project.clips.push({
    id,
    media_id: mediaId,
    file_path: path,
    in_point: 0,
    out_point: duration,
    order: project.clips.length,
  });
  await saveProject();
  renderMediaList();
  Preview.load(project);
  renderTimeline();
}
```
(only the `const { duration }` → `const { duration, has_audio }` line and the `media_library.push` call change).

In `static/api-probe-media.js`, update the doc comment on line 4 from `Returns { duration }, or null if the probe failed.` to `Returns { duration, has_audio }, or null if the probe failed.`

- [ ] **Step 15: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS

- [ ] **Step 16: Manual check — import a video-only clip**

Start the app (`.venv/Scripts/python -m uvicorn app.main:app --reload`), import one of the sample clips from `C:\Users\adolf\Downloads\` (or any local video-only file if you have one) alongside a clip that does have audio, and export. Confirm the export succeeds (previously this combination would fail with an ffmpeg error about mismatched stream counts).

- [ ] **Step 17: Commit**

```bash
git add app/models.py app/media.py app/main.py app/ffmpeg_cmd.py static/api-probe-media.js static/editor.js tests/test_media.py tests/test_main.py tests/test_ffmpeg_cmd.py
git commit -m "fix: synthesize silent audio for video-only clips during export"
```

---

## Task 3: Clip-join hiccup investigation and fix

**Files:**
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `Timeline.tick` (unchanged), the DOM `<video id="player">` element (unchanged id).
- Produces: no new exported functions — `window.Preview`'s public shape stays the same (`load, locate, sequenceDuration, seek, renderText, renderCaptions, currentTimelineTime, play, pause, restart, isPaused, setSelectedTextBlock, setOnStageTextActivate, getActiveFormatSelection`).

The playback code (`static/preview.js:88-96`) currently does a full `<video>` element `src` swap at every clip boundary:
```javascript
function playClipAt(index) {
  activeIndex = index;
  const c = clips[index];
  player.src = "/media?path=" + encodeURIComponent(c.file_path);
  player.onloadedmetadata = () => {
    player.currentTime = c.in_point;
    player.play();
  };
}
```
This forces the browser to issue a fresh network request and wait for `loadedmetadata` before playback can resume — the working hypothesis for the hiccup. This task verifies that hypothesis before fixing it.

- [ ] **Step 1: Reproduce and measure**

Load a project with at least 2 clips (use two of the sample clips in `C:\Users\adolf\Downloads\`: `PXL_20260708_055735958~2.mp4` and `PXL_20260708_055810626.mp4`). Play through a clip join. Open the browser DevTools Network tab, filter to `/media`, and note the timing of the second clip's request (when it starts, when it completes) relative to when the first clip's `out_point` is reached. Also watch the Performance/frame timeline for a visible stall.

- [ ] **Step 2: Confirm or reject the hypothesis**

If the Network tab shows the second clip's `/media` request starting only at the join (not before) and taking a non-trivial time (even a local static file fetch has request/response overhead) — that confirms cold-fetch-at-swap as the cause. If instead the stall appears elsewhere (e.g. in `renderText`/`renderCaptions` doing expensive DOM work on every `timeupdate`, or in the `pad`/`scale` characteristics of the source video itself), stop and use `superpowers:systematic-debugging` to chase that lead instead — the fix below assumes the cold-fetch hypothesis holds.

- [ ] **Step 3: Implement clip prefetching**

In `static/preview.js`, add a hidden preload element and prefetch logic. Add near the other module-level DOM refs (after the `const stage = ...` line):
```javascript
  const preloadPlayer = document.createElement("video");
  preloadPlayer.preload = "auto";
  preloadPlayer.muted = true;
  preloadPlayer.style.display = "none";
  document.body.appendChild(preloadPlayer);
  let preloadedIndex = -1;
```
Add a helper near `playClipAt`:
```javascript
  function maybePreloadNext(index) {
    const nextIndex = index + 1;
    if (nextIndex >= clips.length || nextIndex === preloadedIndex) return;
    preloadedIndex = nextIndex;
    preloadPlayer.src = "/media?path=" + encodeURIComponent(clips[nextIndex].file_path);
  }
```
Call it once right after each `playClipAt` call succeeds — at the end of `playClipAt` itself:
```javascript
  function playClipAt(index) {
    activeIndex = index;
    const c = clips[index];
    player.src = "/media?path=" + encodeURIComponent(c.file_path);
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.play();
    };
    maybePreloadNext(index);
  }
```
And reset `preloadedIndex = -1` in `load()` alongside the other state resets (`activeIndex = -1; cancelVirtualPlayback(); virtualTime = 0;`).

This primes the browser's HTTP cache for the next clip's file as soon as the current one starts playing, so the real `player.src` swap at the join hits a warm cache instead of a cold network fetch. Update the file's header comment to mention the prefetch behavior.

- [ ] **Step 4: Manual verification**

Restart the app, load the same 2-clip project from Step 1, play through the join again with the Network tab open. Confirm the next clip's `/media` request now starts well before the join (right after the current clip begins playing) and that the visible stall at the join is gone or clearly reduced.

- [ ] **Step 5: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS (this task touches no Python files, but confirms nothing else broke)

- [ ] **Step 6: Commit**

```bash
git add static/preview.js
git commit -m "fix: prefetch next clip during playback to smooth preview clip joins"
```

---

## Task 4: Whole-milestone end-to-end verification + smoke test

**Files:**
- Test: `tests/test_export_smoke.py` (new)

**Interfaces:**
- Consumes: `app.main.export_project(pid: str) -> dict` (existing, unchanged signature), `app.store.save_project`/`load_project` (existing), all models from `app.models`.
- Produces: nothing new — this is a verification-only task.

- [ ] **Step 1: Manual assembly**

Using the app (`.venv/Scripts/python -m uvicorn app.main:app --reload`) and the 3 sample clips in `C:\Users\adolf\Downloads\` (`PXL_20260708_055735958~2.mp4`, `PXL_20260708_055810626.mp4`, `PXL_20260708_055202927.mp4`), build one project exercising every layer type:
- All 3 clips, trimmed (non-zero in/out points on at least one).
- A styled text block: a box (background + border), and at least one `FormatRun` (e.g. one word bold+highlighted).
- Captions: transcribe the clips (CAPTIONS panel → transcribe), hand-edit at least one word's text, set karaoke highlight to `progressive_fill` or `current_word`.
- A video box: add one, position/size it, set its start/end window.

- [ ] **Step 2: Export and watch**

Export the project. Watch the resulting mp4 start to finish. Confirm: all clips play in order and trimmed correctly, the text block renders with its box/border/highlighted word, captions appear with karaoke highlighting, the video box appears in its window at the right position/size, and the clip-join fix from Task 3 holds up in the real export (export was already seamless before Task 3 — confirm it still is).

- [ ] **Step 3: Write the automated smoke test**

Create `tests/test_export_smoke.py`:
```python
# Phase 6 smoke test: exercises app.main.export_project with every layer type combined
# (clips including a video-only one, a formatted text block with box, captions with
# karaoke highlight, a video box) and asserts the whole pipeline runs without raising.
from unittest.mock import patch
from app.main import export_project
from app.models import (
    Project, MediaItem, ClipLayer, TextPreset, TextBlockLayer, FormatRun,
    CaptionTrack, CaptionWord, VideoBoxLayer,
)

def test_export_smoke_all_layer_types_combined(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)

    text_preset = TextPreset(name="Heading", box_background=True, box_border_width=4, highlight=False)
    caption_preset = TextPreset(name="Captions", highlight_mode="progressive_fill")

    p = Project(
        name="smoke",
        media_library=[
            MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True),
            MediaItem(id="m1", file_path="b.mp4", duration=2, has_audio=False),
        ],
        clips=[
            ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0),
            ClipLayer(media_id="m1", file_path="b.mp4", in_point=0.5, out_point=2, order=1),
        ],
        text_blocks=[
            TextBlockLayer(
                heading="Hello world", preset_id=text_preset.id, start=0, end=3, z_index=0,
                formatting_runs=[FormatRun(start=0, end=5, weight=700, highlight=True)],
            )
        ],
        text_presets={text_preset.id: text_preset, caption_preset.id: caption_preset},
        captions=CaptionTrack(
            preset_id=caption_preset.id,
            words=[
                CaptionWord(text="Hello", t_start=0.0, t_end=0.4),
                CaptionWord(text="world", t_start=0.4, t_end=0.8),
            ],
        ),
        video_boxes=[
            VideoBoxLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=1,
                          start=0.5, x=50, y=50, width=300, height=400, z_index=-1),
        ],
    )

    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        result = export_project(p.id)

    assert "out_path" in result
    cmd = run_export.call_args[0][0]
    assert cmd[0] == "ffmpeg"
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd  # clip m1 has no audio
    assert "-filter_complex" in cmd
    assert cmd[-1].endswith(".mp4")
```

- [ ] **Step 4: Run the new test**

Run: `.venv/Scripts/python -m pytest tests/test_export_smoke.py -v`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/test_export_smoke.py
git commit -m "test: add whole-pipeline export smoke test covering every layer type"
```

---

## After this plan

Update `CLAUDE.md`'s inventory: `MediaItem.has_audio`, `app/media.py`'s `has_audio_stream`, the `/api/probe` response shape change, `build_export_cmd`'s silent-audio synthesis, `static/preview.js`'s clip prefetching, and the new `tests/test_export_smoke.py`. This is the final phase of the roadmap — after this plan's tasks are committed and passing, the milestone is complete.
