# Audio Batch 4: Preview — Clip Volume/Mute + Music `<audio>` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stage `<video>` reflects each active clip's `volume`/`muted`, and a new module-level `<audio>` element plays `Project.music` in sync with the timeline clock (play/pause/seek/restart), stopping at the reel's end.

**Architecture:** New file `static/preview-audio.js` (module `window.PreviewAudio`) owns one `<audio>` element and exposes `load(project)`/`play()`/`pause()`/`seek(t)` — same extraction pattern already used for `preview-text.js`/`preview-captions.js`. `static/preview.js` calls these as thin delegating wrappers at every point it already drives clip playback (load, doPlay/doPause/doRestart, seek, the clip-boundary `timeupdate` handler, and `virtualTick` for text/caption-only projects). Clip volume/mute is set directly on the existing `#player` element in the two places `player.src` already changes for a new clip (`playClipAt`, `seek`'s clip-switch branch) — same insertion points `applyFillModeClass` already uses.

**Tech Stack:** Vanilla JS, HTML5 `<audio>`/`<video>` elements. No backend changes. No JS test framework exists in this repo (no jest/vitest) — this batch is UI wiring, verified manually per CLAUDE.md's "thin layer, verify manually" allowance, never on real project data (throwaway project only).

> **Re-verified 2026-07-21 against current `main` — `static/preview.js` changed substantially:**
> an unrelated image-clips feature landed a full `<video>`/`<img>` hand-off (module-level
> `mediaById` Map, `imagePlayer`/`clipKind`/`isImageActive`, `window.ImageClipPlayback` for
> per-clip image timing, a shared `renderOverlaysAt(timelineTime)` helper, and an `autoplay`
> parameter on `playClipAt`). Every function this batch touches — `load`, `playClipAt`, `seek`,
> `doPlay`/`doPause`/`doRestart`, the `timeupdate` listener — now has image-clip branches that
> didn't exist when this plan was first written. Task 2 and Task 3 below have been rewritten
> against the current file; do not use the original line-number citations as ground truth, only
> the code shown. The core design is unchanged: `PreviewAudio` calls slot in at the same
> conceptual points (load, play, pause, seek, sequence-end), and clip volume/mute
> (`applyClipAudio`) only applies to the real `<video>` path — image clips have no audio track
> (`has_audio` is always `False` for `MediaItem.kind == "image"`), so there's nothing to mute.

## Global Constraints

**Requires Batch 1** (`ClipLayer.volume`/`muted`, `MusicTrack`/`Project.music`) **merged first.** Batches 2/3 (export) are independent of this batch and don't need to land first, but merging them first keeps export/preview visibly consistent.

- HTML5 `<audio>`/`<video>` volume caps at 1.0 — clip/music volume > 1.0 is clamped to 1.0 in preview only; export (Batches 2/3) applies the exact ffmpeg `volume` filter value. Note this discrepancy is expected, not a bug.
- Music starts at timeline t=0 and is cut at reel end (no looping) — achieved by HTML5 `<audio>`'s native end-of-file pause plus this batch's own pause-at-sequence-end calls; no manual duration math needed beyond what already exists (`Preview.sequenceDuration`/`zeroClipDuration`).
- Never live-verify on a real project — create or reuse a throwaway project for manual checks (per user's established convention).

---

### Task 1: `static/preview-audio.js` — the music `<audio>` element

**Files:**
- Create: `static/preview-audio.js`
- Modify: `static/index.html` (add `<script src="/static/preview-audio.js"></script>` right before the existing `<script src="/static/preview.js"></script>` tag — on current `main` that's preceded by `preview-text.js`, `preview-captions.js`, and `image-clip-playback.js`, in that order; find the exact line by searching for the `preview.js` tag rather than trusting a line number, since other batches/features have shifted it since this plan was written)

**Interfaces:**
- Consumes: `Project.music: MusicTrack | null` (Batch 1) with fields `media_id`, `volume`, `muted`; `Project.media_library` to resolve `media_id` to a `file_path`.
- Produces: `window.PreviewAudio.{load(project), play(), pause(), seek(t)}` — consumed by Task 2 (this batch) inside `static/preview.js`.

- [ ] **Step 1: Create the file**

`static/preview-audio.js`:

```javascript
// Music-track playback: one <audio> element kept in sync with the timeline clock for
// Project.music. Exposes window.PreviewAudio.{load, play, pause, seek}. HTML5 audio's own
// end-of-file behavior stops playback at the music file's end (no looping in v1); volume/mute
// come from MusicTrack, clamped to <=1.0 for the same HTML5-volume-cap reason preview.js
// clamps clip volume (export applies the exact value via ffmpeg's volume filter instead).
window.PreviewAudio = (() => {
  const audioEl = document.createElement("audio");
  audioEl.preload = "auto";
  document.body.appendChild(audioEl);
  let music = null;

  function load(project) {
    music = project.music || null;
    if (!music) {
      audioEl.pause();
      audioEl.removeAttribute("src");
      return;
    }
    const media = (project.media_library || []).find((m) => m.id === music.media_id);
    if (!media) {
      audioEl.pause();
      audioEl.removeAttribute("src");
      music = null;
      return;
    }
    audioEl.src = "/media?path=" + encodeURIComponent(media.file_path);
    audioEl.volume = Math.max(0, Math.min(music.volume, 1));
    audioEl.muted = !!music.muted;
    audioEl.currentTime = 0;
  }

  function play() {
    if (music) audioEl.play().catch(() => {});
  }

  function pause() {
    if (music) audioEl.pause();
  }

  function seek(t) {
    if (music) audioEl.currentTime = Math.max(0, t);
  }

  return { load, play, pause, seek };
})();
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, insert immediately before the existing `<script src="/static/preview.js"></script>` tag:

```html
<script src="/static/preview-audio.js"></script>
```

(`preview.js` must load after `preview-audio.js` since it calls `PreviewAudio.*` at parse time via top-level `player.addEventListener` wiring in Task 2 — it must also still load after `preview-text.js`, `preview-captions.js`, and `image-clip-playback.js`, which is already guaranteed as long as this new tag is inserted right before `preview.js`'s existing tag rather than at some other fixed position.)

- [ ] **Step 3: Manual sanity check — file loads with no console errors**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open a throwaway project in the browser, open devtools console. Confirm no `PreviewAudio is not defined` or similar script-load errors. (Full behavioral verification happens after Task 2 wires it in — an unused module with no callers can't yet be exercised.)

- [ ] **Step 4: Commit**

```bash
git add static/preview-audio.js static/index.html
git commit -m "feat: add PreviewAudio module for music playback"
```

---

### Task 2: Clip `volume`/`muted` applied to the stage `<video>` (image clips excluded — no audio track)

**Files:**
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `ClipLayer.volume: float`, `ClipLayer.muted: bool` (Batch 1); `applyFillModeClass(clip, el)` (existing, now takes an element parameter — see current code below); `clipKind(c)` (existing helper resolving a clip's `MediaItem.kind` via the module-level `mediaById` Map).
- Produces: `applyClipAudio(clip)` — a new local helper in `preview.js`, called only from the non-image branches of `playClipAt` and `seek` (referenced by Task 3).

- [ ] **Step 1: Add the `applyClipAudio` helper next to `applyFillModeClass`**

In `static/preview.js`, right after the existing `applyFillModeClass` function:

```javascript
  // Toggles the CSS class stage.css uses to switch the given element between letterboxed (FIT,
  // object-fit: contain) and cropped-to-fill (FILL, object-fit: cover) per ClipLayer.fill_mode.
  function applyFillModeClass(clip, el = player) {
    el.classList.toggle("fill-mode-fill", clip.fill_mode === "fill");
  }

  // Sets #player's volume/mute from the active clip's ClipLayer.volume/muted. HTML5 <video>
  // volume caps at 1.0 — a volume > 1.0 (export's exact ffmpeg gain) is clamped here, same
  // approximation the VOLUME UI documents. Only called for real video clips (see playClipAt/
  // seek below) — image clips (MediaItem.kind === "image") never have an audio track, so there
  // is nothing to mute/adjust.
  function applyClipAudio(clip) {
    player.volume = Math.max(0, Math.min(clip.volume ?? 1, 1));
    player.muted = !!clip.muted;
  }
```

(`applyFillModeClass` itself is shown only for placement context — its body is unchanged, don't modify it.)

- [ ] **Step 2: Call it from `playClipAt`'s non-image branch**

In `static/preview.js`, `playClipAt(index, autoplay = true)` currently reads:

```javascript
  function playClipAt(index, autoplay = true) {
    ImageClipPlayback.stop();
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

Change the image branch's `onDone` to also pause music when the sequence ends on an image clip, and add `applyClipAudio(c)` to the non-image (video) branch:

```javascript
  function playClipAt(index, autoplay = true) {
    ImageClipPlayback.stop();
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
        else { setPlayingIcon(false); PreviewAudio.pause(); }
      };
      if (autoplay) {
        setPlayingIcon(true);
        ImageClipPlayback.start(c, 0, { onTick, onDone });
      } else {
        ImageClipPlayback.start(c, 0, { onTick, onDone });
        ImageClipPlayback.pause();
        onTick(0);
      }
      return;
    }
    imagePlayer.classList.add("stage-hidden");
    player.classList.remove("stage-hidden");
    applyFillModeClass(c, player);
    applyClipAudio(c);
    player.src = "/media?path=" + encodeURIComponent(c.file_path);
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.playbackRate = c.speed || 1;
      if (autoplay) player.play();
    };
    maybePreloadNext(index);
  }
```

- [ ] **Step 3: Run the full pytest suite (regression check — this batch is JS-only)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add static/preview.js
git commit -m "feat: apply clip volume/mute to the stage video (image clips excluded)"
```

---

### Task 3: Wire `PreviewAudio` into `preview.js`'s full playback lifecycle (video + image clips, zero-clip virtual clock)

**Files:**
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `window.PreviewAudio.{load, play, pause, seek}` (Task 1); `isImageActive()`, `computeTimelineTime()`, `ImageClipPlayback.{resume, pause}` (existing).

- [ ] **Step 1: Call `PreviewAudio.load` in `load(project)`**

`load(project)` currently reads:

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

Add one `PreviewAudio.load(project)` call, right after `preloadedIndex = -1;`:

```javascript
  function load(project) {
    clips = ordered(project.clips || []);
    mediaById = new Map((project.media_library || []).map((m) => [m.id, m]));
    activeIndex = -1;
    cancelVirtualPlayback();
    virtualTime = 0;
    preloadedIndex = -1;
    PreviewAudio.load(project);
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

- [ ] **Step 2: Call `PreviewAudio.play`/`pause`/`seek` in `doPlay`/`doPause`/`doRestart`, including the image-clip branches**

These three functions currently read:

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
```

Change to:

```javascript
  function doPlay() {
    if (clips.length === 0) {
      if (virtualTime >= zeroClipDuration()) virtualTime = 0;
      startVirtualPlayback();
      PreviewAudio.seek(virtualTime);
      PreviewAudio.play();
      return;
    }
    if (isImageActive()) {
      ImageClipPlayback.resume();
      setPlayingIcon(true);
      PreviewAudio.seek(computeTimelineTime());
      PreviewAudio.play();
      return;
    }
    const atEnd = activeIndex >= 0 && activeIndex === clips.length - 1
      && player.currentTime >= clips[activeIndex].out_point;
    if (atEnd) playClipAt(0);
    else player.play();
    PreviewAudio.seek(computeTimelineTime());
    PreviewAudio.play();
  }
  function doPause() {
    PreviewAudio.pause();
    if (clips.length === 0) { cancelVirtualPlayback(); setPlayingIcon(false); return; }
    if (isImageActive()) { ImageClipPlayback.pause(); setPlayingIcon(false); return; }
    player.pause();
  }
  function doRestart() {
    PreviewAudio.seek(0);
    if (clips.length === 0) { virtualTime = 0; startVirtualPlayback(); PreviewAudio.play(); return; }
    playClipAt(0);
    PreviewAudio.play();
  }
```

- [ ] **Step 3: Call `PreviewAudio.seek` in `seek(t)`, covering the zero-clip, image-clip, and video-clip branches**

`seek(t)` currently reads:

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

Add a `PreviewAudio.seek(t)` call at the top (fires for every branch), the same `onDone` music-pause fix as Task 2's image branch, and `applyClipAudio(loc.clip)` in the video (non-image) clip-switch branch:

```javascript
  function seek(t) {
    PreviewAudio.seek(t);
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
          else { setPlayingIcon(false); PreviewAudio.pause(); }
        };
        ImageClipPlayback.start(loc.clip, elapsed, { onTick, onDone });
        ImageClipPlayback.pause();
        renderOverlaysAt(computeTimelineTime());
      } else {
        imagePlayer.classList.add("stage-hidden");
        player.classList.remove("stage-hidden");
        applyFillModeClass(loc.clip, player);
        applyClipAudio(loc.clip);
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

- [ ] **Step 4: Pause music when video-clip playback reaches the sequence end**

The `timeupdate` listener currently reads:

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

Add `PreviewAudio.pause()` to the sequence-end branch:

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
        PreviewAudio.pause();
      }
    }
  });
```

(The image-clip equivalents were already covered in Task 2 Step 2 and this task's Step 3 — both `playClipAt`'s and `seek`'s image-branch `onDone` callbacks.)

- [ ] **Step 5: Pause music when the zero-clip virtual clock reaches its end**

`virtualTick` currently reads (unaffected by the image-clips feature — this function is unchanged from this plan's original assumption):

```javascript
  function virtualTick(now) {
    if (!virtualPlaying) return;
    const dt = (now - virtualLastTs) / 1000;
    virtualLastTs = now;
    virtualTime += dt;
    if (virtualTime >= zeroClipDuration()) {
      virtualTime = zeroClipDuration();
      virtualPlaying = false;
      setPlayingIcon(false);
    }
    timeEl.textContent = virtualTime.toFixed(1);
    if (textProject) renderText(textProject, textPresets, virtualTime);
    if (textProject) renderCaptions(textProject, textPresets, virtualTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
    Timeline.tick(virtualTime);
    if (virtualPlaying) virtualRafId = requestAnimationFrame(virtualTick);
  }
```

Add `PreviewAudio.pause()` right after `setPlayingIcon(false);`:

```javascript
  function virtualTick(now) {
    if (!virtualPlaying) return;
    const dt = (now - virtualLastTs) / 1000;
    virtualLastTs = now;
    virtualTime += dt;
    if (virtualTime >= zeroClipDuration()) {
      virtualTime = zeroClipDuration();
      virtualPlaying = false;
      setPlayingIcon(false);
      PreviewAudio.pause();
    }
    timeEl.textContent = virtualTime.toFixed(1);
    if (textProject) renderText(textProject, textPresets, virtualTime);
    if (textProject) renderCaptions(textProject, textPresets, virtualTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
    Timeline.tick(virtualTime);
    if (virtualPlaying) virtualRafId = requestAnimationFrame(virtualTick);
  }
```

- [ ] **Step 6: Run the full pytest suite (regression check — this batch is JS-only)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add static/preview.js
git commit -m "feat: sync music playback with video/image/zero-clip preview lifecycle"
```

---

### Task 4: Manual live-verify on a throwaway project

**Files:** none (manual browser check only)

- [ ] **Step 1: Create or open a throwaway project** — never a real project's data.

- [ ] **Step 2: Add two clips with real audio.** Open the VIDEO panel for one clip; since Batch 6 (VIDEO panel VOLUME UI) hasn't landed yet, set `volume`/`muted` directly via devtools console for this manual check: e.g. `project.clips[0].muted = true; Preview.load(project)`. Confirm that clip plays silently and the other plays normally.

- [ ] **Step 3: Set a volume above 1.0** (e.g. `project.clips[0].volume = 1.8; project.clips[0].muted = false; Preview.load(project)`) and confirm the preview plays at full (capped) volume without throwing — this only proves the clamp doesn't error; the audible loudness difference from export's exact gain isn't observable in preview by design.

- [ ] **Step 4: Simulate a music track.** Import an audio file's `MediaItem` manually via console (no picker UI yet — Batch 7 adds that): 
```javascript
project.media_library.push({id: "music1", file_path: "<path to a real mp3 on disk>", duration: 30, has_audio: true, kind: "audio"});
project.music = {id: "m1", media_id: "music1", volume: 0.5, muted: false};
Preview.load(project);
```
Click play. Confirm music audibly plays alongside the video, pausing/seeking in sync with the transport controls (step back/forward, scrub the playhead, restart).

- [ ] **Step 5: Confirm music stops at its own end** if shorter than the reel, and does not error when the reel ends before the music (playback pauses cleanly, no console errors).

- [ ] **Step 6: Report findings.** If any step fails, fix the underlying code in `static/preview-audio.js`/`static/preview.js` before proceeding to Batch 5. Do not skip this — this is the only verification this batch gets (no automated JS tests in this repo).

---

## Batch 4 Definition of Done

- [ ] `.venv/Scripts/python -m pytest -q` passes (no backend regressions).
- [ ] Manual live-verify (Task 4) passed on a throwaway project.
- [ ] All changes committed.

Next: [Batch 5: Peaks route + waveform row](2026-07-21-audio-batch-5-peaks-waveform.md).
