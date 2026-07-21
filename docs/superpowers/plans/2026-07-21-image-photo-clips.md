# Image/Photo Clips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add a still image (jpg/png/webp) as a timeline clip with a chosen duration, and have it play back correctly in both the live preview and the exported mp4, mixed freely among video clips.

**Architecture:** `MediaItem` gains a `kind` field (`"video"` default, `"image"` new value) detected by file extension at import time. The export command (`app/ffmpeg_cmd.py`) prepends `-loop 1 -t <duration>` to an image clip's ffmpeg input, reusing every other stage of the existing per-clip trim/scale/pad/concat chain and the existing synthesized-silent-audio branch (images always report `has_audio=False`). The live preview (`static/preview.js`) hands off between the existing `<video>` element and a new sibling `<img>` element per active clip, driven by a new small DOM-free timer module (`static/image-clip-playback.js`) that mirrors the shape of `preview.js`'s existing zero-clip virtual clock but is scoped to a single clip's duration so it can sit inside a mixed video/image sequence.

**Tech Stack:** FastAPI/Pydantic backend (`app/`), vanilla JS frontend (`static/`, no build step), pytest, ffmpeg/ffprobe on PATH.

## Global Constraints

- No JS build step — hand-written `<script>` tags in `static/index.html`, one function/concern per file (see `static/index.html:608-671` for load order).
- No inline `style="..."` in HTML or JS-rendered markup — all styling via `static/css/**` classes.
- Every `static/*.js` and `static/css/**/*.css` file opens with a one/two-line purpose comment.
- Backend logic must be pytest-covered; JS UI wiring is the accepted untested layer (per CLAUDE.md's carve-out), verified manually instead — kept as thin as possible, with duration/timing math isolated where practical.
- Run `.venv/Scripts/python -m pytest -q` before declaring any task done.
- Live-verify preview/export changes only on a throwaway project — never the user's real project data (native image import can't be automated in this environment; inject a synthetic image `ClipLayer`/`MediaItem` via the browser console or a direct project-JSON edit instead).
- Update the codebase map (project `CLAUDE.md`) and this plan's checkboxes as files are added/changed.

---

## File Structure

- Modify `app/models.py` — add `MediaItem.kind: str = "video"`.
- Modify `app/media.py` — add `is_image_path(path) -> bool` (pure); wire it into a `probe()`-equivalent branch; extend `pick_file()`'s dialog filetypes.
- Modify `app/main.py` — `GET /api/probe` route (`probe()`) branches on `is_image_path()`; skips ffprobe for images, returns `kind`.
- Modify `app/ffmpeg_cmd.py` — `build_export_cmd()`'s per-clip loop prepends `-loop 1 -t <duration>` to `-i` for image clips.
- Create `static/image-clip-playback.js` — `window.ImageClipPlayback`, DOM-free per-clip timer.
- Modify `static/preview.js` — image/video hand-off in `load`/`playClipAt`/`computeTimelineTime`/`doPlay`/`doPause`/`doRestart`/`isPaused`/`seek`; new `renderOverlaysAt()` helper.
- Modify `static/index.html` — add `<img id="image-player">`; add `<script src="/static/image-clip-playback.js">` before `preview.js`.
- Modify `static/css/components/stage.css` — extend `#player` sizing rule to `#image-player`; add `.stage-hidden`.
- Modify `static/clip-sequence.js` — `addClip()` branches on probed `kind` for default duration and stores `kind`/`duration`/`has_audio` on the new `MediaItem`.
- Modify `tests/test_models.py`, `tests/test_media.py`, `tests/test_main.py`, `tests/test_ffmpeg_cmd.py` — new coverage per task below.
- Modify project `CLAUDE.md` — codebase map/inventory updates for every file above (final task).

---

### Task 1: `MediaItem.kind` field

**Files:**
- Modify: `app/models.py:10-15` (the `MediaItem` class)
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `MediaItem.kind: str`, default `"video"`. Consumed by Task 2 (probe), Task 4 (export), Task 7 (client import).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:

```python
def test_media_item_kind_defaults_to_video():
    from app.models import MediaItem
    m = MediaItem(file_path="a.mp4", duration=2.0)
    assert m.kind == "video"

def test_media_item_kind_accepts_image():
    from app.models import MediaItem
    m = MediaItem(file_path="a.jpg", duration=0.0, has_audio=False, kind="image")
    assert m.kind == "image"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k kind -v`
Expected: FAIL — `MediaItem` has no field `kind` (pydantic ignores unknown kwargs by default only if configured; here it will raise or the attribute access will fail with `AttributeError`).

- [ ] **Step 3: Add the field**

In `app/models.py`, inside `class MediaItem(BaseModel):` (currently lines 10-15), add the field after `has_audio`:

```python
class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    name: str = ""
    duration: float
    has_audio: bool = True
    kind: str = "video"  # "video" or "image"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k kind -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run full backend suite (fast sanity check nothing else broke)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: add MediaItem.kind field (video/image)"
```

---

### Task 2: Extension-based image detection + probe route + picker filter

**Files:**
- Modify: `app/media.py` (add `is_image_path`)
- Modify: `app/main.py:75-77` (the `probe()` route)
- Modify: `app/media.py:64-76` (`pick_file()`)
- Test: `tests/test_media.py`, `tests/test_main.py`

**Interfaces:**
- Consumes: nothing new (pure path-string check).
- Produces: `is_image_path(path: str) -> bool` in `app/media.py`. `GET /api/probe` now returns `{"duration": float, "has_audio": bool, "kind": str}` — Task 7's client code relies on the `kind` key.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_media.py`:

```python
from app.media import is_image_path

def test_is_image_path_true_for_known_image_extensions():
    assert is_image_path("C:/photos/a.jpg") is True
    assert is_image_path("C:/photos/a.JPEG") is True
    assert is_image_path("C:/photos/a.png") is True
    assert is_image_path("C:/photos/a.webp") is True

def test_is_image_path_false_for_video_extensions():
    assert is_image_path("C:/clips/a.mp4") is False
    assert is_image_path("C:/clips/a.mov") is False
```

Add to `tests/test_main.py` (near the existing `test_probe_route_includes_has_audio`, `app/main.py:114-118`):

```python
def test_probe_route_includes_kind_video():
    with patch("app.main.media.probe_duration", return_value=5.0), \
         patch("app.main.media.has_audio_stream", return_value=True):
        result = probe("c.mp4")
    assert result == {"duration": 5.0, "has_audio": True, "kind": "video"}

def test_probe_route_skips_ffprobe_for_images():
    with patch("app.main.media.probe_duration") as pd, \
         patch("app.main.media.has_audio_stream") as ha:
        result = probe("c.jpg")
    pd.assert_not_called()
    ha.assert_not_called()
    assert result == {"duration": 0.0, "has_audio": False, "kind": "image"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_media.py tests/test_main.py -k "image_path or kind" -v`
Expected: FAIL — `is_image_path` doesn't exist; `probe()` doesn't return `kind` and always calls ffprobe.

- [ ] **Step 3: Implement `is_image_path` in `app/media.py`**

Add near the top of `app/media.py`, after the imports:

```python
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

def is_image_path(path: str) -> bool:
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS
```

- [ ] **Step 4: Update the probe route in `app/main.py`**

Replace the existing route (`app/main.py:75-77`):

```python
@app.get("/api/probe")
def probe(path: str) -> dict:
    if media.is_image_path(path):
        return {"duration": 0.0, "has_audio": False, "kind": "image"}
    return {"duration": media.probe_duration(path), "has_audio": media.has_audio_stream(path), "kind": "video"}
```

- [ ] **Step 5: Update `pick_file()`'s filetypes in `app/media.py`**

Replace the `filetypes` line inside `pick_file()` (`app/media.py:71-73`):

```python
    path = filedialog.askopenfilename(
        title="Choose a clip",
        filetypes=[
            ("Media files", "*.mp4 *.mov *.mkv *.jpg *.jpeg *.png *.webp"),
            ("Video files", "*.mp4 *.mov *.mkv"),
            ("Image files", "*.jpg *.jpeg *.png *.webp"),
            ("All files", "*.*"),
        ],
    )
```

- [ ] **Step 6: Update the module docstring**

`app/media.py`'s header comment (line 1-2) currently reads:
```python
# Media helpers: ffprobe command building/duration parsing, serves media files
# Exposes ffprobe_cmd, probe_duration, has_audio_stream, media_response, run_export, pick_file. Depends on ffprobe on PATH and tkinter.
```
Update to:
```python
# Media helpers: ffprobe command building/duration parsing, extension-based image detection, serves media files
# Exposes ffprobe_cmd, probe_duration, has_audio_stream, is_image_path, media_response, run_export, pick_file. Depends on ffprobe on PATH and tkinter.
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_media.py tests/test_main.py -v`
Expected: all pass, including the two new ones per file and the pre-existing `test_probe_route_includes_has_audio` (which must now be updated — see next step).

- [ ] **Step 8: Fix the now-outdated existing probe test**

`tests/test_main.py`'s `test_probe_route_includes_has_audio` asserts `result == {"duration": 5.0, "has_audio": False}` without `kind`. Update it to include `"kind": "video"`:

```python
def test_probe_route_includes_has_audio():
    with patch("app.main.media.probe_duration", return_value=5.0), \
         patch("app.main.media.has_audio_stream", return_value=False):
        result = probe("c.mp4")
    assert result == {"duration": 5.0, "has_audio": False, "kind": "video"}
```

- [ ] **Step 9: Run full backend suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass

- [ ] **Step 10: Commit**

```bash
git add app/media.py app/main.py tests/test_media.py tests/test_main.py
git commit -m "feat: detect image files by extension, skip ffprobe, expose kind via probe route"
```

---

### Task 3: Export command image-input branch

**Files:**
- Modify: `app/ffmpeg_cmd.py:22-56` (`build_export_cmd`'s per-clip loop)
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `MediaItem.kind` (Task 1).
- Produces: no new public function — `build_export_cmd` behavior extended. Nothing downstream depends on new symbols.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ffmpeg_cmd.py`:

```python
def test_image_clip_uses_loop_and_t_flags():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image")],
                clips=[ClipLayer(media_id="m0", file_path="photo.jpg", in_point=0, out_point=3, order=0)])
    cmd = build_export_cmd(p, "out.mp4")
    i = cmd.index("photo.jpg")
    assert cmd[i - 4:i] == ["-loop", "1", "-t", "3"]

def test_image_clip_still_gets_synthesized_silent_audio():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image")],
                clips=[ClipLayer(media_id="m0", file_path="photo.jpg", in_point=0, out_point=3, order=0)])
    cmd = build_export_cmd(p, "out.mp4")
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd

def test_mixed_image_and_video_sequence_only_images_get_loop_flag():
    p = Project(name="r", media_library=[
        MediaItem(id="m0", file_path="a.mp4", duration=2, has_audio=True, kind="video"),
        MediaItem(id="m1", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image"),
    ], clips=[
        ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=2, order=0),
        ClipLayer(media_id="m1", file_path="photo.jpg", in_point=0, out_point=4, order=1),
    ])
    cmd = build_export_cmd(p, "out.mp4")
    i_video = cmd.index("a.mp4")
    i_image = cmd.index("photo.jpg")
    assert "-loop" not in cmd[max(0, i_video - 4):i_video]
    assert cmd[i_image - 4:i_image] == ["-loop", "1", "-t", "4"]
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "trim=start=0:end=2" in fc  # video clip trim unchanged
    assert "trim=start=0:end=4" in fc  # image clip trim unchanged (defensive, harmless with -t)

def test_image_clip_speed_scales_loop_duration():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="photo.jpg", duration=0.0, has_audio=False, kind="image")],
                clips=[ClipLayer(media_id="m0", file_path="photo.jpg", in_point=0, out_point=4, order=0, speed=2.0)])
    cmd = build_export_cmd(p, "out.mp4")
    i = cmd.index("photo.jpg")
    assert cmd[i - 4:i] == ["-loop", "1", "-t", "2"]  # 4s / 2x speed = 2s
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -k image -v`
Expected: FAIL — no `-loop`/`-t` flags are emitted today for any input.

- [ ] **Step 3: Implement the image-input branch**

In `app/ffmpeg_cmd.py`, inside `build_export_cmd`'s per-clip loop (currently `app/ffmpeg_cmd.py:29-32`):

```python
    for i, c in enumerate(clips):
        v_idx = input_index
        media = media_by_id.get(c.media_id)
        if media and media.kind == "image":
            duration = (c.out_point - c.in_point) / c.speed
            cmd += ["-loop", "1", "-t", _num(duration), "-i", c.file_path]
        else:
            cmd += ["-i", c.file_path]
        input_index += 1
```

Note: `media = media_by_id.get(c.media_id)` was previously computed later in the loop body (`app/ffmpeg_cmd.py:45`, right before the audio branch) — move that lookup up to the top of the loop (as shown above) and delete the old `media = media_by_id.get(c.media_id)` line further down, keeping the rest of the loop (`has_audio = media.has_audio if media else True` and everything after) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -v`
Expected: all pass (including every pre-existing test in the file — the `media` lookup was only moved, not changed).

- [ ] **Step 5: Update the module header comment**

`app/ffmpeg_cmd.py`'s header (lines 1-7) should note the new branch. Update line 1-2 from:
```python
# Pure ffmpeg export-command builder: per-clip trim/scale/pad-or-crop (branched on ClipLayer.fill_mode:
# "fit" letterboxes, "fill" center-crops), concat with silent-audio synthesis for video-only clips,
```
to:
```python
# Pure ffmpeg export-command builder: per-clip trim/scale/pad-or-crop (branched on ClipLayer.fill_mode:
# "fit" letterboxes, "fill" center-crops), concat with silent-audio synthesis for video-only clips,
# image clips (MediaItem.kind == "image") get `-loop 1 -t <duration>` prepended to their input,
```

- [ ] **Step 6: Run full backend suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py
git commit -m "feat: export image clips via -loop 1 -t, reusing existing trim/scale/silence chain"
```

---

### Task 4: `image-clip-playback.js` — DOM-free per-clip timer

**Files:**
- Create: `static/image-clip-playback.js`
- Modify: `static/index.html` (add the `<script>` tag)

**Interfaces:**
- Produces: `window.ImageClipPlayback` with:
  - `start(clip, startElapsed, { onTick, onDone })` — `clip` is a `ClipLayer`-shaped object with `in_point`, `out_point`, `speed`. Begins a `requestAnimationFrame` loop; calls `onTick(elapsed)` every frame with elapsed seconds since `startElapsed` began (clamped to `[0, duration]`); calls `onDone()` exactly once when `elapsed` reaches the clip's duration (`(out_point - in_point) / (speed || 1)`), after the final `onTick(duration)`.
  - `resume()` — resumes from the current elapsed value if a clip is loaded and not already playing; no-op otherwise.
  - `pause()` — cancels the animation frame, keeps `elapsed` as-is.
  - `seekTo(t)` — sets `elapsed` directly (clamped to `[0, duration]`); does not start/stop the frame loop.
  - `stop()` — pauses and clears the loaded clip/elapsed back to 0.
  - `isPlaying() -> bool`, `getElapsed() -> number`.
- Consumed by: Task 5 (`static/preview.js`).

- [ ] **Step 1: Create the file**

`static/image-clip-playback.js`:

```javascript
// Per-clip virtual playback clock for image clips on the stage: drives a duration-bounded timer
// via requestAnimationFrame, independent of any DOM element, so preview.js can hand off between
// the <video> element (real clips) and the <img> element (image clips) without losing timing.
// Exposes window.ImageClipPlayback.{start, resume, pause, stop, seekTo, isPlaying, getElapsed}.
window.ImageClipPlayback = (() => {
  let clip = null;
  let duration = 0;
  let elapsed = 0;
  let playing = false;
  let rafId = null;
  let lastTs = 0;
  let callbacks = { onTick: () => {}, onDone: () => {} };

  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }

  function tick(now) {
    if (!playing) return;
    const dt = (now - lastTs) / 1000;
    lastTs = now;
    elapsed = Math.min(elapsed + dt, duration);
    if (elapsed >= duration) {
      playing = false;
      callbacks.onTick(elapsed);
      callbacks.onDone();
      return;
    }
    callbacks.onTick(elapsed);
    rafId = requestAnimationFrame(tick);
  }

  function start(c, startElapsed, cbs) {
    clip = c;
    duration = clipDuration(c);
    elapsed = Math.max(0, Math.min(startElapsed, duration));
    callbacks = cbs;
    playing = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function resume() {
    if (!clip || playing) return;
    playing = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function stop() {
    pause();
    clip = null;
    elapsed = 0;
  }

  function seekTo(t) {
    elapsed = Math.max(0, Math.min(t, duration));
  }

  function isPlaying() { return playing; }
  function getElapsed() { return elapsed; }

  return { start, resume, pause, stop, seekTo, isPlaying, getElapsed };
})();
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, add a new line immediately before the existing `preview.js` tag (`static/index.html:665`):

```html
<script src="/static/image-clip-playback.js"></script>
<script src="/static/preview.js"></script>
```

- [ ] **Step 3: Manual sanity check (no JS test harness exists in this repo)**

Open the app in a browser (`.venv/Scripts/python -m uvicorn app.main:app --reload`, then http://127.0.0.1:8000), open the browser console, and run:

```javascript
let ticks = [];
ImageClipPlayback.start({ in_point: 0, out_point: 1, speed: 1 }, 0, {
  onTick: (e) => ticks.push(e),
  onDone: () => console.log("done, elapsed:", ImageClipPlayback.getElapsed(), "ticks:", ticks.length),
});
```

Expected: after ~1 second, the console logs `done, elapsed: 1 ticks: <n>` where `n` is roughly 60 (one tick per animation frame).

- [ ] **Step 4: Commit**

```bash
git add static/image-clip-playback.js static/index.html
git commit -m "feat: add ImageClipPlayback, a DOM-free per-clip timer for image playback"
```

---

### Task 5: `preview.js` image/video hand-off

**Files:**
- Modify: `static/preview.js` (see interfaces below for exact touch points)
- Modify: `static/index.html` (add `<img id="image-player">`)
- Modify: `static/css/components/stage.css` (sizing + hidden-state classes)

**Interfaces:**
- Consumes: `window.ImageClipPlayback` (Task 4); `MediaItem.kind` via `project.media_library` (Task 1).
- Produces: no new public `window.Preview` methods — existing `window.Preview.*` surface is unchanged; internal behavior now handles image clips anywhere in `project.clips`.

- [ ] **Step 1: Add the `<img>` element to the stage**

In `static/index.html`, the stage markup currently reads (line ~39-41):

```html
        <div id="stage">
          <video id="player"></video>
          <div id="overlay"></div>
```

Change to:

```html
        <div id="stage">
          <video id="player"></video>
          <img id="image-player" class="stage-hidden">
          <div id="overlay"></div>
```

- [ ] **Step 2: Extend `stage.css`**

In `static/css/components/stage.css`, replace:

```css
#player { width: 100%; height: 100%; object-fit: contain; }
#player.fill-mode-fill { object-fit: cover; }
```

with:

```css
#player, #image-player { width: 100%; height: 100%; object-fit: contain; }
#player.fill-mode-fill, #image-player.fill-mode-fill { object-fit: cover; }
.stage-hidden { display: none; }
```

- [ ] **Step 3: Add `mediaById`/`clipKind` to `preview.js`**

In `static/preview.js`, add a module-scope map next to the existing `clips`/`activeIndex` declarations (`static/preview.js:26-27`):

```javascript
  let clips = [];
  let activeIndex = -1;
  let mediaById = new Map();
```

Add a helper function near `ordered`/`clipDuration` (`static/preview.js:49-59`):

```javascript
  function clipKind(c) {
    const m = mediaById.get(c.media_id);
    return (m && m.kind) || "video";
  }

  function isImageActive() {
    return activeIndex >= 0 && clipKind(clips[activeIndex]) === "image";
  }
```

- [ ] **Step 4: Grab the `<img>` element and add `renderOverlaysAt`**

Add next to the existing `player`/`timeEl`/`stage` const declarations (`static/preview.js:36-38`):

```javascript
  const player = document.getElementById("player");
  const imagePlayer = document.getElementById("image-player");
  const timeEl = document.getElementById("time");
  const stage = document.getElementById("stage");
```

Add a new helper function (place it right after `applyFillModeClass`, `static/preview.js:86-88`):

```javascript
  function renderOverlaysAt(timelineTime) {
    timeEl.textContent = timelineTime.toFixed(1);
    if (textProject) renderText(textProject, textPresets, timelineTime);
    if (textProject) renderCaptions(textProject, textPresets, timelineTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], timelineTime);
  }
```

- [ ] **Step 5: Update `applyFillModeClass` to take a target element**

Replace (`static/preview.js:86-88`):

```javascript
  function applyFillModeClass(clip) {
    player.classList.toggle("fill-mode-fill", clip.fill_mode === "fill");
  }
```

with:

```javascript
  function applyFillModeClass(clip, el = player) {
    el.classList.toggle("fill-mode-fill", clip.fill_mode === "fill");
  }
```

- [ ] **Step 6: Rewrite `playClipAt` with the image branch**

Replace the whole function (`static/preview.js:71-82`):

```javascript
  function playClipAt(index, autoplay = true) {
    activeIndex = index;
    const c = clips[index];
    if (clipKind(c) === "image") {
      player.pause();
      player.classList.add("stage-hidden");
      imagePlayer.classList.remove("stage-hidden");
      applyFillModeClass(c, imagePlayer);
      imagePlayer.src = "/media?path=" + encodeURIComponent(c.file_path);
      const onTick = (elapsed) => renderOverlaysAt(computeTimelineTime());
      const onDone = () => {
        if (activeIndex + 1 < clips.length) playClipAt(activeIndex + 1, true);
        else setPlayingIcon(false);
      };
      if (autoplay) {
        setPlayingIcon(true);
        ImageClipPlayback.start(c, 0, { onTick, onDone });
      } else {
        // start()+pause() (rather than just seekTo) so ImageClipPlayback has this clip's
        // duration loaded — a bare seekTo() with no clip loaded would clamp against a stale
        // duration, and a later resume() would no-op with no clip loaded at all.
        ImageClipPlayback.start(c, 0, { onTick, onDone });
        ImageClipPlayback.pause();
        onTick(0);
      }
      return;
    }
    imagePlayer.classList.add("stage-hidden");
    player.classList.remove("stage-hidden");
    applyFillModeClass(c, player);
    player.src = "/media?path=" + encodeURIComponent(c.file_path);
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.playbackRate = c.speed || 1;
      if (autoplay) player.play();
    };
    maybePreloadNext(index);
  }
```

- [ ] **Step 7: Skip preloading images**

Replace (`static/preview.js:90-95`):

```javascript
  function maybePreloadNext(index) {
    const nextIndex = index + 1;
    if (nextIndex >= clips.length || nextIndex === preloadedIndex) return;
    preloadedIndex = nextIndex;
    preloadPlayer.src = "/media?path=" + encodeURIComponent(clips[nextIndex].file_path);
  }
```

with:

```javascript
  function maybePreloadNext(index) {
    const nextIndex = index + 1;
    if (nextIndex >= clips.length || nextIndex === preloadedIndex) return;
    if (clipKind(clips[nextIndex]) === "image") return;
    preloadedIndex = nextIndex;
    preloadPlayer.src = "/media?path=" + encodeURIComponent(clips[nextIndex].file_path);
  }
```

- [ ] **Step 8: Update `load()` to build `mediaById` and pass `autoplay = false`**

Replace (`static/preview.js:137-150`):

```javascript
  function load(project) {
    clips = ordered(project.clips || []);
    mediaById = new Map((project.media_library || []).map((m) => [m.id, m]));
    activeIndex = -1;
    cancelVirtualPlayback();
    virtualTime = 0;
    preloadedIndex = -1;
    if (clips.length > 0) {
      playClipAt(0, false);
    } else {
      player.removeAttribute("src");
      player.load();
      imagePlayer.classList.add("stage-hidden");
      player.classList.remove("stage-hidden");
      timeEl.textContent = "0.0";
    }
  }
```

- [ ] **Step 9: Update `computeTimelineTime`**

Replace (`static/preview.js:170-177`):

```javascript
  function computeTimelineTime() {
    if (clips.length === 0) return virtualTime;
    if (activeIndex < 0) return 0;
    const c = clips[activeIndex];
    let t = 0;
    for (let i = 0; i < activeIndex; i++) t += clipDuration(clips[i]);
    if (isImageActive()) return t + ImageClipPlayback.getElapsed();
    return t + (player.currentTime - c.in_point) / (c.speed || 1);
  }
```

- [ ] **Step 10: Update `doPlay`/`doPause`/`doRestart`/`isPaused`**

Replace (`static/preview.js:203-224`):

```javascript
  function doPlay() {
    if (clips.length === 0) {
      if (virtualTime >= zeroClipDuration()) virtualTime = 0;
      startVirtualPlayback();
      return;
    }
    if (isImageActive()) {
      ImageClipPlayback.resume();
      setPlayingIcon(true);
      return;
    }
    const atEnd = activeIndex >= 0 && activeIndex === clips.length - 1
      && player.currentTime >= clips[activeIndex].out_point;
    if (atEnd) playClipAt(0);
    else player.play();
  }
  function doPause() {
    if (clips.length === 0) { cancelVirtualPlayback(); setPlayingIcon(false); return; }
    if (isImageActive()) { ImageClipPlayback.pause(); setPlayingIcon(false); return; }
    player.pause();
  }
  function doRestart() {
    if (clips.length === 0) { virtualTime = 0; startVirtualPlayback(); return; }
    playClipAt(0);
  }
  function isPaused() {
    if (clips.length === 0) return !virtualPlaying;
    if (isImageActive()) return !ImageClipPlayback.isPlaying();
    return player.paused;
  }
```

Note: the image branch of `doRestart` and the `atEnd` branch of `doPlay` both call `playClipAt(0)` with its default `autoplay = true`, which is correct (both are user-initiated "start playing" actions).

- [ ] **Step 11: Update the video `timeupdate` listener to use `renderOverlaysAt`**

Replace (`static/preview.js:179-196`):

```javascript
  player.addEventListener("timeupdate", () => {
    if (activeIndex < 0 || isImageActive()) return;
    const c = clips[activeIndex];
    const timelineTime = computeTimelineTime();
    renderOverlaysAt(timelineTime);

    if (player.currentTime >= c.out_point) {
      if (activeIndex + 1 < clips.length) {
        playClipAt(activeIndex + 1);
      } else {
        player.pause();
      }
    }
  });
```

(The `isImageActive()` guard prevents a stray `timeupdate` from a previous video element's src swap from firing overlay updates while an image clip is actually active.)

- [ ] **Step 12: Update `seek`**

Replace (`static/preview.js:245-265`):

```javascript
  function seek(t) {
    if (clips.length === 0) {
      virtualTime = Math.max(0, Math.min(t, zeroClipDuration()));
      renderOverlaysAt(virtualTime);
      return;
    }
    const loc = locate(clips, t);
    if (!loc) return;
    const newIndex = clips.indexOf(loc.clip);
    if (newIndex !== activeIndex) {
      if (isImageActive()) ImageClipPlayback.stop(); else player.pause();
      activeIndex = newIndex;
      if (clipKind(loc.clip) === "image") {
        player.classList.add("stage-hidden");
        imagePlayer.classList.remove("stage-hidden");
        applyFillModeClass(loc.clip, imagePlayer);
        imagePlayer.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
        const elapsed = loc.src - loc.clip.in_point;
        const onTick = (e) => renderOverlaysAt(computeTimelineTime());
        const onDone = () => {
          if (activeIndex + 1 < clips.length) playClipAt(activeIndex + 1, true);
          else setPlayingIcon(false);
        };
        // start()+pause() rather than a bare seekTo(): this clip has never been loaded into
        // ImageClipPlayback before, so seekTo() alone would clamp against a stale duration
        // from whatever clip was loaded previously.
        ImageClipPlayback.start(loc.clip, elapsed, { onTick, onDone });
        ImageClipPlayback.pause();
        renderOverlaysAt(computeTimelineTime());
      } else {
        imagePlayer.classList.add("stage-hidden");
        player.classList.remove("stage-hidden");
        applyFillModeClass(loc.clip, player);
        player.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
        player.onloadedmetadata = () => { player.currentTime = loc.src; player.playbackRate = loc.clip.speed || 1; };
      }
    } else if (isImageActive()) {
      ImageClipPlayback.seekTo(loc.src - loc.clip.in_point);
      renderOverlaysAt(computeTimelineTime());
    } else {
      player.currentTime = loc.src;
      player.playbackRate = loc.clip.speed || 1;
    }
  }
```

- [ ] **Step 13: Update the file header comment**

`static/preview.js`'s header (lines 1-24) should mention the new hand-off. After the existing line about `applyFillModeClass` (line 8-10), add:

```javascript
// Image clips (MediaItem.kind === "image") hand off between #player (<video>) and #image-player
// (<img>) per-clip: playClipAt/seek show whichever element applies and drive timing via either
// the <video> element's own timeupdate event or window.ImageClipPlayback (see
// static/image-clip-playback.js) for images. renderOverlaysAt(timelineTime) is the single place
// that refreshes the time readout + text/caption/video-box overlays, shared by both paths plus
// the zero-clip virtual clock.
```

- [ ] **Step 14: Run the full backend suite (guards against unrelated regressions from any accidental Python edits)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass (this task touches no Python files, so this is a no-op sanity check)

- [ ] **Step 15: Manual verification on a throwaway project**

1. Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open http://127.0.0.1:8000.
2. Create a new project via the picker ("+ NEW PROJECT") — this is the throwaway project; do not use any existing real project.
3. Import two short video clips via "+" in the MEDIA panel (native file picker).
4. Open the browser console and inject a synthetic image clip between them (adjust `media_id`/`order`/paths to match what's actually in your test project — use any small `.jpg`/`.png` file path on disk that ffprobe/the browser can load):

```javascript
project.media_library.push({ id: "img1", file_path: "C:/Windows/Web/Wallpaper/Windows/img0.jpg", name: "test image", duration: 0, has_audio: false, kind: "image" });
project.clips.forEach(c => { if (c.order >= 1) c.order += 1; });
project.clips.push({ id: "imgclip1", media_id: "img1", file_path: "C:/Windows/Web/Wallpaper/Windows/img0.jpg", in_point: 0, out_point: 3, order: 1, fill_mode: "fit", speed: 1 });
Preview.load(project); renderTimeline();
```
5. Click play. Verify: first video plays, then the image appears and holds for 3 seconds (time readout keeps advancing), then the second video plays.
6. While the image is showing, click pause — playback should freeze on the image with the time readout stopped. Click play again — it should resume from where it left off, not restart.
7. Drag the timeline playhead into the middle of the image block, then out again into the following video clip — the stage should show the image while scrubbed into its range, and the video once scrubbed past it.
8. Confirm no errors appear in the browser console (`read_console_messages` or DevTools) during any of the above.

- [ ] **Step 16: Commit**

```bash
git add static/preview.js static/index.html static/css/components/stage.css
git commit -m "feat: hand off between <video> and <img> per-clip in the stage preview for image clips"
```

---

### Task 6: Client-side import — default duration + `kind` on `addClip()`

**Files:**
- Modify: `static/clip-sequence.js:74-98` (`addClip()`)

**Interfaces:**
- Consumes: `Api.probeMedia(path)` now resolving to `{ duration, has_audio, kind }` (Task 2).
- Produces: no new symbols — `project.media_library`/`project.clips` entries now carry `kind`, and image entries get a 3-second default `out_point` instead of `duration` (which is `0` for images).

- [ ] **Step 1: Update `addClip()`**

Replace (`static/clip-sequence.js:74-98`):

```javascript
const DEFAULT_IMAGE_DURATION = 3.0;

async function addClip() {
  const path = await Api.pickFile();
  if (!path) return;
  const probeResult = await Api.probeMedia(path);
  if (!probeResult) { alert("probe failed"); return; }
  const { duration, has_audio, kind } = probeResult;
  const mediaId = crypto.randomUUID().replaceAll("-", "");
  project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind });

  const clipDuration = kind === "image" ? DEFAULT_IMAGE_DURATION : duration;
  const id = crypto.randomUUID().replaceAll("-", "");
  clipDurations[id] = clipDuration;
  project.clips.push({
    id,
    media_id: mediaId,
    file_path: path,
    in_point: 0,
    out_point: clipDuration,
    order: project.clips.length,
    speed: 1,
  });
  await saveProject();
  MediaPanel.render();
  Preview.load(project);
  renderTimeline();
}

document.getElementById("add-clip").addEventListener("click", addClip);
```

- [ ] **Step 2: Update the file header comment**

`static/clip-sequence.js`'s header (lines 1-4) currently reads:
```javascript
// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed), converting a video box into a sequence clip, and
// importing a new media file via the native file picker. Plain globals shared with editor.js's
// drag/drop wiring; reaches into editor.js's `project`/`clipDurations`/`saveProject` globals.
```
Update to:
```javascript
// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed), converting a video box into a sequence clip, and
// importing a new media file via the native file picker (image imports default to a 3s clip
// duration since MediaItem.duration is 0 for images). Plain globals shared with editor.js's
// drag/drop wiring; reaches into editor.js's `project`/`clipDurations`/`saveProject` globals.
```

- [ ] **Step 3: Manual verification**

1. On the same throwaway project from Task 5, click "+" in the MEDIA panel and pick a real `.jpg`/`.png` file via the native dialog (confirm the "Media files" filter shows it, and that picking it doesn't error).
2. Confirm the new clip appears in the timeline with a 3.0s duration and plays correctly in the stage per Task 5's hand-off.
3. Open the VIDEO panel for that clip and change TRIM out to e.g. 5.0s; confirm the image now displays for 5 seconds in preview.

- [ ] **Step 4: Commit**

```bash
git add static/clip-sequence.js
git commit -m "feat: default imported image clips to a 3s duration and record MediaItem.kind"
```

---

### Task 7: Codebase map update + final full-suite verification

**Files:**
- Modify: project `CLAUDE.md` (codebase map / inventory)

- [ ] **Step 1: Update the "Media library & import" inventory section**

In project `CLAUDE.md`, under "### Media library & import", update the `MediaItem` bullet to mention `kind`, and add a line for `is_image_path`/the probe route's new `kind` field, `pick_file()`'s extended filetypes, and `clip-sequence.js`'s `DEFAULT_IMAGE_DURATION` branch. Follow the existing terse, dated-note style used throughout the file (e.g. "`kind: str = \"video\"` (added 2026-07-21, image/photo clips): ...").

- [ ] **Step 2: Add a "Preview hand-off" note under Timeline or a new "Image clips" subsection**

Add a short entry documenting `static/image-clip-playback.js` (`window.ImageClipPlayback`) and the `preview.js` per-clip `<img>`/`<video>` hand-off, following the existing File structure tree's one-line-per-file convention, plus one line in the tree itself for `image-clip-playback.js`.

- [ ] **Step 3: Update `app/ffmpeg_cmd.py`'s and `app/media.py`'s File structure tree lines** (if their one-line summaries no longer match — the module header comments from Tasks 2/3 should already be reflected here since the tree lines mirror those headers).

- [ ] **Step 4: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for image/photo clips (kind, probe, export, preview hand-off)"
```

---

## Final Review

After Task 7, use superpowers:requesting-code-review before merging to main, covering the full diff across all 7 tasks (backend model/probe/export + frontend timer/hand-off/import).
