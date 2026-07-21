# Clip Speed Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-clip playback speed (0.5×–2.0×) that is honored consistently in timeline math, live preview, and mp4 export.

**Architecture:** A new `ClipLayer.speed: float = 1.0` field. The two pure timeline functions (`clip_duration`, `locate`, mirrored in JS) become speed-aware — this is the intended single source of truth. But several JS call sites compute `out_point - in_point` *inline*, bypassing the pure `clipDuration()`, so those must be fixed by hand too. Export gains `setpts`/`atempo`, both **gated on `speed != 1.0`** so a 1.0× clip produces byte-identical output to today (preserving all existing tests). Preview sets `player.playbackRate`.

**Tech Stack:** Python 3 / Pydantic / FastAPI (backend), vanilla JS (frontend), ffmpeg (export), pytest (tests). No JS test harness exists — JS layers are verified live in-browser.

## Global Constraints

- Speed range is **0.5–2.0** (single-`atempo` range; no filter chaining). Enforced only in the UI control (`min`/`max`); math must not assume it.
- **At `speed == 1.0`, every export command string and every timeline value MUST be identical to today.** Speed filters are added only when `speed != 1.0`. This keeps all existing `test_ffmpeg_cmd.py` / `test_timeline.py` assertions green.
- **Domain discipline:** `out_point`/`in_point`/`player.currentTime` are **source-time** (seconds into the media file). Timeline-time is source-time compressed by speed: `timeline_duration = (out_point - in_point) / speed`; converting a timeline offset to a source offset multiplies by speed. The `clipDurations` JS cache (`editor.js:5`) holds the **full source file duration** (a trim clamp bound) — it is source-domain and must NOT be divided by speed.
- New/edited source files get a 2–3 line header comment per `CLAUDE.md`; update the header when a file's role changes.
- Every commit that changes a file's role updates the codebase map in `CLAUDE.md` in the same commit (done in Task 4).
- Use `float`; JS reads `c.speed || 1` everywhere so in-memory clips created before a save (which lack the field) behave as 1.0×.
- Run the full backend suite with `.venv/Scripts/python -m pytest -q`.

---

### Task 1: Model field + speed-aware pure timeline math

**Files:**
- Modify: `app/models.py` (add field to `ClipLayer`, ~line 32)
- Modify: `app/timeline.py:7-20` (`clip_duration`, `locate`)
- Test: `tests/test_timeline.py`

**Interfaces:**
- Produces: `ClipLayer.speed: float = 1.0`. `clip_duration(c) -> (c.out_point - c.in_point) / c.speed`. `locate(clips, t) -> (clip, source_time)` where `source_time = clip.in_point + (t - acc) * clip.speed`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_timeline.py` (the `c(...)` helper there does not set speed; add a speed-aware helper):

```python
def cs(i, o, order, speed): return ClipLayer(media_id=f"m{order}", file_path=f"{order}.mp4", in_point=i, out_point=o, order=order, speed=speed)

def test_clip_duration_is_speed_scaled():
    assert clip_duration(cs(0, 4, 0, 2.0)) == 2.0   # 4s source at 2x = 2s timeline
    assert clip_duration(cs(0, 4, 0, 0.5)) == 8.0   # 4s source at 0.5x = 8s timeline
    assert clip_duration(cs(0, 4, 0, 1.0)) == 4.0   # unchanged at 1x

def test_sequence_duration_speed_scaled():
    assert sequence_duration([cs(0, 4, 0, 2.0), cs(0, 4, 1, 1.0)]) == 6.0  # 2 + 4

def test_locate_maps_timeline_to_source_with_speed():
    clips = [cs(0, 4, 0, 2.0), cs(0, 4, 1, 1.0)]     # timeline durations 2 and 4
    clip, src = locate(clips, 1.0);  assert (clip.order, src) == (0, 2.0)   # 1s timeline into 2x clip = 2s source
    clip, src = locate(clips, 2.0);  assert (clip.order, src) == (1, 0.0)   # boundary -> next clip start
    clip, src = locate(clips, 5.0);  assert (clip.order, src) == (1, 3.0)   # 3s into the 1x second clip
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -q`
Expected: FAIL — `ClipLayer` has no `speed` field (`ValidationError`/`TypeError`), and `clip_duration`/`locate` ignore speed.

- [ ] **Step 3: Add the model field**

In `app/models.py`, in `class ClipLayer`, after the `fill_mode` line:

```python
    speed: float = 1.0      # playback speed multiplier (0.5-2.0); timeline duration = (out-in)/speed
```

- [ ] **Step 4: Make the pure functions speed-aware**

In `app/timeline.py` replace `clip_duration` and the mapping line in `locate`:

```python
def clip_duration(c: ClipLayer) -> float:
    return (c.out_point - c.in_point) / c.speed

def locate(clips: list[ClipLayer], t: float) -> tuple[ClipLayer, float]:
    acc = 0.0
    for c in ordered(clips):
        d = clip_duration(c)
        if t < acc + d:
            return c, c.in_point + (t - acc) * c.speed
        acc += d
    raise ValueError(f"t={t} beyond sequence end {acc}")
```

- [ ] **Step 5: Run the timeline tests + full suite**

Run: `.venv/Scripts/python -m pytest tests/test_timeline.py -q` — Expected: PASS.
Run: `.venv/Scripts/python -m pytest -q` — Expected: PASS (existing tests unaffected; default speed 1.0 leaves all math identical).

- [ ] **Step 6: Commit**

```bash
git add app/models.py app/timeline.py tests/test_timeline.py
git commit -m "feat: ClipLayer.speed + speed-aware timeline math"
```

---

### Task 2: Speed in the export commands

**Files:**
- Modify: `app/ffmpeg_cmd.py:30-50` (video setpts, real-audio atempo, silence duration) and `:99-113` (`build_audio_cmd`)
- Modify header comment at top of `app/ffmpeg_cmd.py` (mention speed)
- Test: `tests/test_ffmpeg_cmd.py`

**Interfaces:**
- Consumes: `ClipLayer.speed` (Task 1).
- Produces: no signature change. Behavior: video chain gets `setpts=(PTS-STARTPTS)/<speed>` when `speed != 1.0` (else the existing `setpts=PTS-STARTPTS`); real-audio chain appends `,atempo=<speed>` when `speed != 1.0`; synthesized-silence duration becomes `(out-in)/speed`. Same in `build_audio_cmd`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ffmpeg_cmd.py`:

```python
def test_speed_2x_video_setpts_and_audio_atempo():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=2.0)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "setpts=(PTS-STARTPTS)/2" in fc
    assert "atempo=2" in fc

def test_speed_half_video_setpts_and_audio_atempo():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=0.5)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "setpts=(PTS-STARTPTS)/0.5" in fc
    assert "atempo=0.5" in fc

def test_speed_1x_export_unchanged_no_atempo():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=1.0)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "setpts=PTS-STARTPTS," in fc     # the plain reset, not the /speed form
    assert "atempo" not in fc

def test_speed_scales_synthesized_silence_duration():
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=False)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=2.0)])
    fc = build_export_cmd(p, "out.mp4")[build_export_cmd(p, "out.mp4").index("-filter_complex") + 1]
    assert "atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0]" in fc   # 4s source / 2x = 2s silence

def test_build_audio_cmd_applies_atempo_for_speed():
    from app.ffmpeg_cmd import build_audio_cmd
    p = Project(name="r",
                media_library=[MediaItem(id="m0", file_path="a.mp4", duration=4, has_audio=True)],
                clips=[ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, speed=2.0)])
    fc = build_audio_cmd(p, "out.wav")[build_audio_cmd(p, "out.wav").index("-filter_complex") + 1]
    assert "atempo=2" in fc
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -q`
Expected: FAIL on the new speed tests (setpts/atempo not emitted).

- [ ] **Step 3: Implement video setpts + silence duration in `build_export_cmd`**

In `app/ffmpeg_cmd.py`, inside the `for i, c in enumerate(clips):` loop, replace the `trim_prefix` line and the silence-branch `duration` line:

```python
        setpts = f"(PTS-STARTPTS)/{_num(c.speed)}" if c.speed != 1.0 else "PTS-STARTPTS"
        trim_prefix = f"[{v_idx}:v]trim=start={_num(c.in_point)}:end={_num(c.out_point)},setpts={setpts},"
```

and in the real-audio branch replace the `parts.append(...)` for `[a{i}]`:

```python
        if has_audio:
            atempo = f",atempo={_num(c.speed)}" if c.speed != 1.0 else ""
            parts.append(f"[{v_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS{atempo}[a{i}];")
        else:
            a_idx = input_index
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            input_index += 1
            duration = (c.out_point - c.in_point) / c.speed
            parts.append(f"[{a_idx}:a]atrim=start=0:end={_num(duration)},asetpts=PTS-STARTPTS[a{i}];")
```

- [ ] **Step 4: Implement the same in `build_audio_cmd`**

In `build_audio_cmd`, replace the two `parts.append(...)` lines:

```python
        if has_audio:
            a_idx = input_index
            cmd += ["-i", c.file_path]
            input_index += 1
            atempo = f",atempo={_num(c.speed)}" if c.speed != 1.0 else ""
            parts.append(f"[{a_idx}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS{atempo}[a{i}];")
        else:
            a_idx = input_index
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            input_index += 1
            duration = (c.out_point - c.in_point) / c.speed
            parts.append(f"[{a_idx}:a]atrim=start=0:end={_num(duration)},asetpts=PTS-STARTPTS[a{i}];")
```

Also update the top-of-file header comment to note per-clip speed (`setpts`/`atempo`).

- [ ] **Step 5: Run the ffmpeg tests + full suite**

Run: `.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py -q` — Expected: PASS (new + all existing; existing tests use default speed 1.0, so their exact strings are unchanged).
Run: `.venv/Scripts/python -m pytest -q` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/ffmpeg_cmd.py tests/test_ffmpeg_cmd.py
git commit -m "feat: setpts/atempo per-clip speed in export + audio commands"
```

---

### Task 3: JS timeline/preview mirrors + inline bypass fixes

No JS test harness exists — this task is verified live in-browser at the end (Task 4's checkpoint) plus a console assertion below. All edits read `c.speed || 1` so pre-save clips behave as 1.0×.

**Files:**
- Modify: `static/preview.js` (`clipDuration` :53, `locate` :65, `computeTimelineTime` :175, `playClipAt` :71, `seek` clip-switch :255)
- Modify: `static/timeline.js:24` (`clipDuration`)
- Modify: `static/timeline-snap.js:24`
- Modify: `static/clip-sequence.js:19-22, 36-60` (split math + carry `speed` on new clips)
- Modify: `static/editor.js:111` (timeline-start accumulation)
- Modify: `static/panel-video.js:75, 79` (`deleteClip` timeline range math)

**Interfaces:**
- Consumes: `ClipLayer.speed` (Task 1).
- Produces: no new exports. `Preview.locate`/`Preview.sequenceDuration`/`Preview.currentTimelineTime` become speed-correct; `insertClipIntoSequence` preserves/derives `speed` on split halves and new clips.

- [ ] **Step 1: preview.js — speed-aware duration, forward + inverse mapping, playbackRate**

In `static/preview.js`:

`clipDuration` (line 53-55):
```javascript
  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }
```

`locate` mapping (line 65) — change the returned `src`:
```javascript
      if (t < acc + d) return { clip: c, src: c.in_point + (t - acc) * (c.speed || 1), acc };
```

`computeTimelineTime` inverse mapping (line 175) — divide the source offset by speed:
```javascript
    return t + (player.currentTime - c.in_point) / (c.speed || 1);
```

`playClipAt` (line 76-79) — set playbackRate once metadata is ready:
```javascript
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.playbackRate = c.speed || 1;
      player.play();
    };
```

`seek` clip-switch branch (line 258-261) — set playbackRate in both sub-branches:
```javascript
    if (loc.clip !== clips[activeIndex]) {
      activeIndex = clips.indexOf(loc.clip);
      applyFillModeClass(loc.clip);
      player.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
      player.onloadedmetadata = () => { player.currentTime = loc.src; player.playbackRate = loc.clip.speed || 1; };
    } else {
      player.currentTime = loc.src;
      player.playbackRate = loc.clip.speed || 1;
    }
```

(The clip-end check `player.currentTime >= c.out_point` at lines 188/209 is pure source-domain — leave unchanged.)

- [ ] **Step 2: timeline.js + timeline-snap.js — speed-aware clip duration**

`static/timeline.js` (line 23-25):
```javascript
  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }
```

`static/timeline-snap.js` (line 24) — this is a clip's timeline duration for boundary collection:
```javascript
      const dur = (c.out_point - c.in_point) / (c.speed || 1);
```

(Leave the video-box `v.start + (v.out_point - v.in_point)` lines in both files — video boxes have no speed.)

- [ ] **Step 3: clip-sequence.js — split math + carry speed**

In `static/clip-sequence.js`, the drop-point scan (lines 19-22) uses timeline durations; the split point converts a timeline offset to a source offset:
```javascript
  for (const c of ordered) {
    const d = (c.out_point - c.in_point) / (c.speed || 1);
    if (dropTime < acc + d) {
      splitClip = c;
      splitAt = c.in_point + (dropTime - acc) * (c.speed || 1);
      insertOrder = c.order;
      break;
    }
    acc += d;
  }
```

Carry `speed` onto `secondHalf` (after line 43, inside the split object) and `newClip` (after line 59):
```javascript
    const secondHalf = {
      id: crypto.randomUUID().replaceAll("-", ""),
      media_id: splitClip.media_id,
      file_path: splitClip.file_path,
      in_point: splitAt,
      out_point: splitClip.out_point,
      order: splitClip.order + 2,
      fill_mode: splitClip.fill_mode,
      speed: splitClip.speed || 1,
    };
```
```javascript
  const newClip = {
    id: crypto.randomUUID().replaceAll("-", ""),
    media_id: source.media_id,
    file_path: source.file_path,
    in_point: source.in_point,
    out_point: source.out_point,
    order: insertOrder,
    fill_mode: source.fill_mode || "fit",
    speed: source.speed || 1,
  };
```

Also add `speed: 1` to the clip object in `addClip()` (line 83-90) for consistency:
```javascript
  project.clips.push({
    id,
    media_id: mediaId,
    file_path: path,
    in_point: 0,
    out_point: duration,
    order: project.clips.length,
    speed: 1,
  });
```

- [ ] **Step 4: editor.js + panel-video.js — inline timeline-start accumulation**

`static/editor.js` line 111 (inside `onTimelineSelect`, computing where to seek the playhead — timeline domain):
```javascript
      start += (c.out_point - c.in_point) / (c.speed || 1);
```

`static/panel-video.js` `deleteClip` — lines 75 and 79 both compute timeline positions:
```javascript
      start += (clip.out_point - clip.in_point) / (clip.speed || 1);
```
```javascript
      return t >= start && t < start + (c.out_point - c.in_point) / (c.speed || 1);
```

(Leave `panel-video.js:17` `clipDurations[c.id] ?? c.out_point` alone — that is the source-domain trim clamp bound, not a timeline duration.)

- [ ] **Step 5: Console verification (before UI exists)**

Start the server (`preview_start`), open the app, and in the browser console confirm the mirror math with a synthetic clip (does not mutate saved data — operates on a literal):

```javascript
// paste in console
const _c = { in_point: 0, out_point: 4, speed: 2, order: 0 };
Preview.sequenceDuration([_c]);            // expect 2
Preview.locate([_c], 1).src;               // expect 2  (1s timeline into 2x clip -> 2s source)
```
Expected: `2` and `2`. If either is wrong, the mapping edits are off — fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add static/preview.js static/timeline.js static/timeline-snap.js static/clip-sequence.js static/editor.js static/panel-video.js
git commit -m "feat: speed-aware JS timeline/preview mirrors + inline call-site fixes"
```

---

### Task 4: VIDEO panel SPEED control + live verification + docs

**Files:**
- Modify: `static/index.html` (add a SPEED row inside `#panel-video`, between the FILL group and the delete group)
- Modify: `static/panel-video.js` (`render` — add the SPEED `UI.numberField`)
- Modify: `CLAUDE.md` (map: note `ClipLayer.speed` under Video clips + timeline math)

**Interfaces:**
- Consumes: `ClipLayer.speed` (Task 1), speed-aware preview/timeline (Task 3), `UI.numberField` (`static/ui-number-field.js`, `{label, unit, value, step, min, max, decimals, span, onChange}`).

- [ ] **Step 1: Add the SPEED row markup**

In `static/index.html`, inside `#panel-video`, insert between the FILL group (closes at the `</div>` on line 168) and the delete-button group (opens on line 170), matching the FILL group's exact `style-group-label` + `style-group` shape:

```html
        <div class="style-group-label">SPEED</div>
        <div class="style-group">
          <div id="video-speed-field"></div>
        </div>
```

- [ ] **Step 2: Wire the control in panel-video.js**

In `static/panel-video.js` `render(c)`, after the FILL `UI.buttonGroup` block and before the delete wiring, add:

```javascript
    UI.numberField(document.getElementById("video-speed-field"),
      { label: "SPEED", unit: "×", value: c.speed || 1, step: 0.1, min: 0.5, max: 2.0, decimals: 1, span: 8,
        onChange: async (v) => {
          c.speed = Math.max(0.5, Math.min(2.0, v));
          await saveProject();
          Preview.load(project);
          renderTimeline();
        } });
```

(`Preview.load` re-seats the active clip so `playbackRate` and the new timeline length take effect immediately; `renderTimeline` redraws the VIDEO row block at its new speed-scaled width.)

- [ ] **Step 3: Live verification in-browser**

With the server running and a project that has at least one clip:
1. Open the VIDEO panel for a clip; confirm a SPEED field shows `1.0 ×`.
2. Set SPEED to `2.0`. Confirm: (a) the clip's timeline block visibly shrinks to half width, (b) pressing play plays the clip roughly twice as fast, (c) the time readout still ends at the (now shorter) sequence duration, (d) `project.clips[0].speed === 2` in the console and it persisted (reload → still 2).
3. Set SPEED to `0.5`. Confirm the block doubles in width and playback is slow-mo.
4. Set back to `1.0`. Confirm block width and playback return to normal.
5. Confirm no console errors throughout.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`, under the **Video clips** inventory section, extend the `ClipLayer` line to note `speed: float = 1.0` (0.5–2.0; timeline duration = (out−in)/speed; export via setpts/atempo, preview via `playbackRate`). Under the **Timeline** section, note `clip_duration`/`locate` are speed-aware. One line each; keep it terse.

- [ ] **Step 5: Full suite + commit**

Run: `.venv/Scripts/python -m pytest -q` — Expected: PASS (unchanged count from Task 2 plus the new tests; no backend change in Tasks 3–4).

```bash
git add static/index.html static/panel-video.js CLAUDE.md
git commit -m "feat: SPEED control in the VIDEO panel + map update"
```

---

## Verification checklist (whole branch, before merge)

- [ ] `.venv/Scripts/python -m pytest -q` green.
- [ ] Speed 2×/0.5×/1× all correct in preview playback, timeline block width, and persisted model.
- [ ] A real export of a sped clip plays at the right speed with pitch-preserved audio (spot-check one export if ffmpeg is available; otherwise rely on Task 2 command-string tests).
- [ ] Drag-to-split a sped clip (drop a media item into the middle of a 2× clip): both halves keep `speed: 2` and the split lands at the right source frame.
- [ ] Delete a clip while the playhead is inside a sped clip: no crash, playhead reseeks correctly.
- [ ] `CLAUDE.md` map updated.

## Out of scope (per design doc)

- Speeds outside 0.5–2.0 (needs atempo chaining).
- Speed ramps/keyframes, freeze frames.
- Video-box (PiP) speed.
