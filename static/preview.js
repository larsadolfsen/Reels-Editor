// Preview stage playback: plays a project's clips back-to-back in timeline order, drives the
// virtual clock for text/caption-only projects, and delegates the text-block overlay (see
// preview-text.js/window.PreviewText) and caption overlay (see preview-captions.js/
// window.PreviewCaptions) rendering to their own modules. Text/caption divs and video-box <video>
// elements (see video-box-preview.js) are siblings inside #overlay and each set an explicit CSS
// z-index from their model's z_index field, so browser stacking follows the project's cross-layer
// z-order.
// applyFillModeClass(clip, el) toggles el's .fill-mode-fill class (stage.css) to switch between
// FIT (object-fit: contain) and FILL (object-fit: cover) per ClipLayer.fill_mode.
// Image clips (MediaItem.kind === "image") hand off between the active <video> element and
// #image-player (<img>) per-clip: playClipAt/seek show whichever element applies and drive timing
// via either the <video> element's own timeupdate event or window.ImageClipPlayback (see
// static/image-clip-playback.js) for images. renderOverlaysAt(timelineTime) is the single place
// that refreshes the time readout + text/caption/video-box overlays, shared by both paths plus
// the zero-clip virtual clock.
// Two real <video> elements (playerA = #player, playerB created here) alternate as "active"
// (visible, on-stage) and "standby" (hidden). As soon as a clip starts playing, prepareStandby()
// loads the *next* clip into the standby element and seeks it to that clip's in-point — fully
// decoded and paused, off-stage. At the clip boundary, playClipAt() swaps which element is active
// (an instant class toggle) instead of setting .src on the visible element: setting .src on a
// <video> synchronously clears its displayed frame (the "emptied" event), which is what caused
// the black flash between cuts even with a warm HTTP cache. If the standby element isn't ready in
// time (e.g. a very short clip), playClipAt falls back to the old direct-swap-on-active path.
// Because "active" moves between two physical elements, editor.js can no longer bind listeners to
// one DOM node directly — it subscribes via Preview.onTimeUpdate/onPlayStateChange instead, which
// this module fires from whichever element is currently active.
// Exposes window.Preview.{load, seek, renderText, renderCaptions, currentTimelineTime, play, pause, restart, isPaused, setSelectedTextBlock, setOnStageTextActivate, getActiveFormatSelection, enterTextEditMode, getTextBoxSize, getCaptionBoxSize, onTimeUpdate, onPlayStateChange}. Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
// getTextBoxSize(blockId)/getCaptionBoxSize() are thin delegating wrappers onto
// PreviewText.getBoxSizeCanvasPx/PreviewCaptions.getBoxSizeCanvasPx, used by the POSITION
// anchor-grid shortcut (text-panel-position.js/caption-panel-box.js) to compute edge-flush x/y
// from the block's actual on-stage rendered size.
// enterTextEditMode(blockId) is a thin delegating wrapper onto PreviewText.enterEditMode, used to
// drop a newly-created text block straight into on-stage contentEditable edit mode.
// renderText/renderCaptions/setSelectedTextBlock/getActiveFormatSelection/setOnStageTextActivate
// are thin delegating wrappers onto PreviewText/PreviewCaptions (kept here so no external caller
// changes); textProject/textPresets stay in this file too since virtualTick/zeroClipDuration read
// them directly.
// When project.clips is empty, playback runs on an internal virtual clock (performance.now()-based)
// instead of the <video> element's timeupdate/play/pause events, so text/caption-only projects
// stay scrubbable/playable in preview. Preview.isPaused() abstracts over both modes for callers.
window.Preview = (() => {
  let clips = [];
  let activeIndex = -1;
  let mediaById = new Map();
  let textProject = null;
  let textPresets = {};
  // Virtual clock driving playback when there are zero video clips (text/captions-only
  // projects) — the video element has no src/timeupdate events to drive off of in that case.
  let virtualTime = 0;
  let virtualPlaying = false;
  let virtualRafId = null;
  let virtualLastTs = 0;
  const imagePlayer = document.getElementById("image-player");
  const timeEl = document.getElementById("time");
  const stage = document.getElementById("stage");
  // Two real <video> elements alternate as "active" (on-stage) and "standby" (hidden,
  // preloading + pre-seeked to the next clip's in-point) — see file header for why.
  const playerA = document.getElementById("player");
  const playerB = document.createElement("video");
  playerB.className = "stage-media stage-hidden";
  playerA.after(playerB);
  let activePlayer = playerA;
  let standbyPlayer = playerB;
  let standbyReadyIndex = -1;
  let standbySeeked = false;

  const timeUpdateListeners = [];
  const playStateListeners = [];
  function onTimeUpdate(fn) { timeUpdateListeners.push(fn); }
  function onPlayStateChange(fn) { playStateListeners.push(fn); }

  function installPlayerListeners(el) {
    el.addEventListener("seeked", () => {
      if (el === standbyPlayer && standbyReadyIndex >= 0) standbySeeked = true;
    });
    el.addEventListener("timeupdate", () => {
      if (el !== activePlayer || activeIndex < 0 || isImageActive()) return;
      const c = clips[activeIndex];
      const timelineTime = computeTimelineTime();
      renderOverlaysAt(timelineTime);
      timeUpdateListeners.forEach((fn) => fn(timelineTime));
      if (el.currentTime >= c.out_point) {
        if (activeIndex + 1 < clips.length) {
          playClipAt(activeIndex + 1);
        } else {
          el.pause();
          PreviewAudio.pause();
        }
      }
    });
    el.addEventListener("play", () => {
      if (el !== activePlayer) return;
      setPlayingIcon(true);
      playStateListeners.forEach((fn) => fn(true));
    });
    el.addEventListener("pause", () => {
      if (el !== activePlayer || isImageActive()) return;
      setPlayingIcon(false);
      playStateListeners.forEach((fn) => fn(false));
    });
  }
  installPlayerListeners(playerA);
  installPlayerListeners(playerB);

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
  }

  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }

  function sequenceDuration(list) {
    return list.reduce((sum, c) => sum + clipDuration(c), 0);
  }

  function locate(list, t) {
    let acc = 0;
    for (const c of ordered(list)) {
      const d = clipDuration(c);
      if (t < acc + d) return { clip: c, src: c.in_point + (t - acc) * (c.speed || 1), acc };
      acc += d;
    }
    return null;
  }

  function clipKind(c) {
    const m = mediaById.get(c.media_id);
    return (m && m.kind) || "video";
  }

  function isImageActive() {
    return activeIndex >= 0 && clipKind(clips[activeIndex]) === "image";
  }

  function renderOverlaysAt(timelineTime) {
    timeEl.textContent = timelineTime.toFixed(1);
    if (textProject) renderText(textProject, textPresets, timelineTime);
    if (textProject) renderCaptions(textProject, textPresets, timelineTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], timelineTime);
  }

  function playClipAt(index, autoplay = true) {
    ImageClipPlayback.stop();
    const c = clips[index];
    if (clipKind(c) === "image") {
      activeIndex = index;
      activePlayer.pause();
      activePlayer.classList.add("stage-hidden");
      standbyPlayer.classList.add("stage-hidden");
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
        // start()+pause() (rather than just seekTo) so ImageClipPlayback has this clip's
        // duration loaded — a bare seekTo() with no clip loaded would clamp against a stale
        // duration, and a later resume() would no-op with no clip loaded at all.
        ImageClipPlayback.start(c, 0, { onTick, onDone });
        ImageClipPlayback.pause();
        onTick(0);
      }
      return;
    }
    if (standbyReadyIndex === index && standbySeeked) {
      // Standby already has this clip decoded and paused at its in-point — swap which element
      // is on-stage instead of touching .src, so no frame is ever cleared.
      const oldActive = activePlayer;
      activeIndex = index;
      activePlayer = standbyPlayer;
      standbyPlayer = oldActive;
      imagePlayer.classList.add("stage-hidden");
      activePlayer.classList.remove("stage-hidden");
      applyFillModeClass(c, activePlayer);
      applyClipAudio(c);
      oldActive.pause();
      oldActive.classList.add("stage-hidden");
      standbyReadyIndex = -1;
      standbySeeked = false;
      if (autoplay) activePlayer.play();
    } else {
      // Standby wasn't ready in time (e.g. a very short clip) — fall back to swapping .src
      // directly on the active element, same as before this feature existed.
      activeIndex = index;
      imagePlayer.classList.add("stage-hidden");
      activePlayer.classList.remove("stage-hidden");
      applyFillModeClass(c, activePlayer);
      applyClipAudio(c);
      activePlayer.src = "/media?path=" + encodeURIComponent(c.file_path);
      activePlayer.onloadedmetadata = () => {
        activePlayer.currentTime = c.in_point;
        activePlayer.playbackRate = c.speed || 1;
        if (autoplay) activePlayer.play();
      };
    }
    prepareStandby(index + 1);
  }

  // Toggles the CSS class stage.css uses to switch the given element between letterboxed (FIT,
  // object-fit: contain) and cropped-to-fill (FILL, object-fit: cover) per ClipLayer.fill_mode.
  function applyFillModeClass(clip, el) {
    el.classList.toggle("fill-mode-fill", clip.fill_mode === "fill");
  }

  // Sets the active element's volume/mute from the clip's ClipLayer.volume/muted. HTML5 <video>
  // volume caps at 1.0 — a volume > 1.0 (export's exact ffmpeg gain) is clamped here, same
  // approximation the VOLUME UI documents. Only called for real video clips — image clips
  // (MediaItem.kind === "image") never have an audio track, so there is nothing to mute/adjust.
  function applyClipAudio(clip) {
    activePlayer.volume = Math.max(0, Math.min(clip.volume ?? 1, 1));
    activePlayer.muted = !!clip.muted;
  }

  // Loads the given clip into the standby (off-stage) <video> element and seeks it to that
  // clip's in-point, so playClipAt can swap it in instantly at the boundary. No-ops for an
  // image clip (images hand off through #image-player, not the dual-video buffer) and for a
  // clip already prepared.
  function prepareStandby(nextIndex) {
    if (nextIndex < 0 || nextIndex >= clips.length || clipKind(clips[nextIndex]) === "image") {
      standbyReadyIndex = -1;
      standbySeeked = false;
      return;
    }
    if (standbyReadyIndex === nextIndex) return;
    standbyReadyIndex = nextIndex;
    standbySeeked = false;
    const nextClip = clips[nextIndex];
    standbyPlayer.pause();
    standbyPlayer.src = "/media?path=" + encodeURIComponent(nextClip.file_path);
    standbyPlayer.playbackRate = nextClip.speed || 1;
    standbyPlayer.onloadedmetadata = () => { standbyPlayer.currentTime = nextClip.in_point; };
  }

  function zeroClipDuration() {
    if (!textProject) return 0;
    let maxEnd = 0;
    for (const b of (textProject.text_blocks || [])) maxEnd = Math.max(maxEnd, b.end || 0);
    if (textProject.captions && textProject.captions.words) {
      for (const w of textProject.captions.words) maxEnd = Math.max(maxEnd, w.t_end || 0);
    }
    return maxEnd;
  }

  function cancelVirtualPlayback() {
    if (virtualRafId) { cancelAnimationFrame(virtualRafId); virtualRafId = null; }
    virtualPlaying = false;
  }

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

  function startVirtualPlayback() {
    virtualPlaying = true;
    virtualLastTs = performance.now();
    setPlayingIcon(true);
    virtualRafId = requestAnimationFrame(virtualTick);
  }

  function load(project) {
    clips = ordered(project.clips || []);
    mediaById = new Map((project.media_library || []).map((m) => [m.id, m]));
    activeIndex = -1;
    cancelVirtualPlayback();
    virtualTime = 0;
    standbyReadyIndex = -1;
    standbySeeked = false;
    PreviewAudio.load(project);
    if (clips.length > 0) {
      playClipAt(0, false);
    } else {
      activePlayer.removeAttribute("src");
      activePlayer.load();
      standbyPlayer.removeAttribute("src");
      standbyPlayer.classList.add("stage-hidden");
      imagePlayer.classList.add("stage-hidden");
      activePlayer.classList.remove("stage-hidden");
      timeEl.textContent = "0.0";
    }
  }

  function renderText(project, presets, timelineTime) {
    textProject = project;
    textPresets = presets;
    PreviewText.renderText(project, presets, timelineTime);
  }

  function renderCaptions(project, presets, timelineTime) {
    PreviewCaptions.renderCaptions(project, presets, timelineTime);
  }

  function setOnStageTextActivate(fn) { PreviewText.setOnStageTextActivate(fn); }

  function setSelectedTextBlock(blockId, callbacks) { PreviewText.setSelectedTextBlock(blockId, callbacks); }

  function getActiveFormatSelection() { return PreviewText.getActiveFormatSelection(); }

  function enterTextEditMode(blockId) { PreviewText.enterEditMode(blockId); }

  function getTextBoxSize(blockId) { return PreviewText.getBoxSizeCanvasPx(blockId); }

  function getCaptionBoxSize() { return PreviewCaptions.getBoxSizeCanvasPx(); }

  // The active video element's raw currentTime in source-clip coordinates (not timeline time) —
  // used by the VIDEO panel's Set In/Set Out buttons. Only meaningful for a real video clip.
  function currentSourceTime() { return activePlayer.currentTime; }

  function computeTimelineTime() {
    if (clips.length === 0) return virtualTime;
    if (activeIndex < 0) return 0;
    const c = clips[activeIndex];
    let t = 0;
    for (let i = 0; i < activeIndex; i++) t += clipDuration(clips[i]);
    if (isImageActive()) return t + ImageClipPlayback.getElapsed();
    return t + (activePlayer.currentTime - c.in_point) / (c.speed || 1);
  }

  new ResizeObserver(() => {
    if (textProject) renderText(textProject, textPresets, computeTimelineTime());
    if (textProject) renderCaptions(textProject, textPresets, computeTimelineTime());
  }).observe(stage);

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
      && activePlayer.currentTime >= clips[activeIndex].out_point;
    if (atEnd) playClipAt(0);
    else activePlayer.play();
    PreviewAudio.seek(computeTimelineTime());
    PreviewAudio.play();
  }
  function doPause() {
    PreviewAudio.pause();
    if (clips.length === 0) { cancelVirtualPlayback(); setPlayingIcon(false); return; }
    if (isImageActive()) { ImageClipPlayback.pause(); setPlayingIcon(false); return; }
    activePlayer.pause();
  }
  function doRestart() {
    PreviewAudio.seek(0);
    if (clips.length === 0) { virtualTime = 0; startVirtualPlayback(); PreviewAudio.play(); return; }
    playClipAt(0);
    PreviewAudio.play();
  }
  function isPaused() {
    if (clips.length === 0) return !virtualPlaying;
    if (isImageActive()) return !ImageClipPlayback.isPlaying();
    return activePlayer.paused;
  }

  document.getElementById("play-pause").addEventListener("click", () => {
    if (isPaused()) doPlay(); else doPause();
  });
  document.getElementById("restart").addEventListener("click", doRestart);

  // Icon swap driven by the video element's own play/pause events, so it stays correct
  // regardless of what triggered the state change (buttons, keyboard, end of clip).
  // Toggles the .icon-hidden class rather than the `hidden` attribute: browsers don't
  // reliably apply the UA `[hidden] { display: none }` rule to SVG elements, so both
  // icons stayed visible at once when toggled via setAttribute("hidden", "").
  const iconPlay = document.querySelector("#play-pause .icon-play");
  const iconPause = document.querySelector("#play-pause .icon-pause");
  function setPlayingIcon(isPlaying) {
    iconPlay.classList.toggle("icon-hidden", isPlaying);
    iconPause.classList.toggle("icon-hidden", !isPlaying);
  }

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
      if (isImageActive()) ImageClipPlayback.stop(); else activePlayer.pause();
      activeIndex = newIndex;
      if (clipKind(loc.clip) === "image") {
        activePlayer.classList.add("stage-hidden");
        standbyPlayer.classList.add("stage-hidden");
        imagePlayer.classList.remove("stage-hidden");
        applyFillModeClass(loc.clip, imagePlayer);
        imagePlayer.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
        const elapsed = loc.src - loc.clip.in_point;
        const onTick = (e) => renderOverlaysAt(computeTimelineTime());
        const onDone = () => {
          if (activeIndex + 1 < clips.length) playClipAt(activeIndex + 1, true);
          else { setPlayingIcon(false); PreviewAudio.pause(); }
        };
        // start()+pause() rather than a bare seekTo(): this clip has never been loaded into
        // ImageClipPlayback before, so seekTo() alone would clamp against a stale duration
        // from whatever clip was loaded previously.
        ImageClipPlayback.start(loc.clip, elapsed, { onTick, onDone });
        ImageClipPlayback.pause();
        renderOverlaysAt(computeTimelineTime());
      } else {
        imagePlayer.classList.add("stage-hidden");
        activePlayer.classList.remove("stage-hidden");
        applyFillModeClass(loc.clip, activePlayer);
        applyClipAudio(loc.clip);
        activePlayer.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
        activePlayer.onloadedmetadata = () => { activePlayer.currentTime = loc.src; activePlayer.playbackRate = loc.clip.speed || 1; };
      }
      // A scrub jump invalidates whatever the standby element was prepared for.
      prepareStandby(newIndex + 1);
    } else if (isImageActive()) {
      ImageClipPlayback.seekTo(loc.src - loc.clip.in_point);
      renderOverlaysAt(computeTimelineTime());
    } else {
      activePlayer.currentTime = loc.src;
      activePlayer.playbackRate = loc.clip.speed || 1;
    }
  }

  return { load, locate, sequenceDuration, seek, renderText, renderCaptions, currentTimelineTime: computeTimelineTime, currentSourceTime, play: doPlay, pause: doPause, restart: doRestart, isPaused, setSelectedTextBlock, setOnStageTextActivate, getActiveFormatSelection, enterTextEditMode, getTextBoxSize, getCaptionBoxSize, onTimeUpdate, onPlayStateChange };
})();
