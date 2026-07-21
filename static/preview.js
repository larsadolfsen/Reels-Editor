// Preview stage playback: plays a project's clips back-to-back in timeline order, drives the
// virtual clock for text/caption-only projects, and delegates the text-block overlay (see
// preview-text.js/window.PreviewText) and caption overlay (see preview-captions.js/
// window.PreviewCaptions) rendering to their own modules. Text/caption divs and video-box <video>
// elements (see video-box-preview.js) are siblings inside #overlay and each set an explicit CSS
// z-index from their model's z_index field, so browser stacking follows the project's cross-layer
// z-order.
// applyFillModeClass(clip) toggles #player's .fill-mode-fill class (stage.css) to switch between
// FIT (object-fit: contain) and FILL (object-fit: cover) per ClipLayer.fill_mode; called from both
// playClipAt and seek's clip-switch branch, the two places player.src changes for a new clip.
// playClipAt() also prefetches the *next* clip's file into a hidden second <video> element
// (preloadPlayer) as soon as the current clip starts, so the browser's HTTP cache is warm by the
// time the real player.src swap happens at the join — smooths the visible stall that a cold
// network fetch at the clip boundary otherwise causes.
// Exposes window.Preview.{load, seek, renderText, renderCaptions, currentTimelineTime, play, pause, restart, isPaused, setSelectedTextBlock, setOnStageTextActivate, getActiveFormatSelection}. Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
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
  let textProject = null;
  let textPresets = {};
  // Virtual clock driving playback when there are zero video clips (text/captions-only
  // projects) — the video element has no src/timeupdate events to drive off of in that case.
  let virtualTime = 0;
  let virtualPlaying = false;
  let virtualRafId = null;
  let virtualLastTs = 0;
  const player = document.getElementById("player");
  const timeEl = document.getElementById("time");
  const stage = document.getElementById("stage");
  // Hidden second <video> used only to prefetch the next clip's file into the browser's HTTP
  // cache while the current clip is still playing, so the real player.src swap at the clip
  // boundary (playClipAt) hits a warm cache instead of a cold network fetch.
  const preloadPlayer = document.createElement("video");
  preloadPlayer.preload = "auto";
  preloadPlayer.muted = true;
  preloadPlayer.style.display = "none";
  document.body.appendChild(preloadPlayer);
  let preloadedIndex = -1;

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
  }

  function clipDuration(c) {
    return c.out_point - c.in_point;
  }

  function sequenceDuration(list) {
    return list.reduce((sum, c) => sum + clipDuration(c), 0);
  }

  function locate(list, t) {
    let acc = 0;
    for (const c of ordered(list)) {
      const d = clipDuration(c);
      if (t < acc + d) return { clip: c, src: c.in_point + (t - acc), acc };
      acc += d;
    }
    return null;
  }

  function playClipAt(index) {
    activeIndex = index;
    const c = clips[index];
    applyFillModeClass(c);
    player.src = "/media?path=" + encodeURIComponent(c.file_path);
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.play();
    };
    maybePreloadNext(index);
  }

  // Toggles the CSS class stage.css uses to switch #player between letterboxed (FIT,
  // object-fit: contain) and cropped-to-fill (FILL, object-fit: cover) per ClipLayer.fill_mode.
  function applyFillModeClass(clip) {
    player.classList.toggle("fill-mode-fill", clip.fill_mode === "fill");
  }

  function maybePreloadNext(index) {
    const nextIndex = index + 1;
    if (nextIndex >= clips.length || nextIndex === preloadedIndex) return;
    preloadedIndex = nextIndex;
    preloadPlayer.src = "/media?path=" + encodeURIComponent(clips[nextIndex].file_path);
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
    activeIndex = -1;
    cancelVirtualPlayback();
    virtualTime = 0;
    preloadedIndex = -1;
    if (clips.length > 0) {
      playClipAt(0);
    } else {
      player.removeAttribute("src");
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

  function computeTimelineTime() {
    if (clips.length === 0) return virtualTime;
    if (activeIndex < 0) return 0;
    const c = clips[activeIndex];
    let t = 0;
    for (let i = 0; i < activeIndex; i++) t += clipDuration(clips[i]);
    return t + (player.currentTime - c.in_point);
  }

  player.addEventListener("timeupdate", () => {
    if (activeIndex < 0) return;
    const c = clips[activeIndex];
    const timelineTime = computeTimelineTime();
    timeEl.textContent = timelineTime.toFixed(1);

    if (textProject) renderText(textProject, textPresets, timelineTime);
    if (textProject) renderCaptions(textProject, textPresets, timelineTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], timelineTime);

    if (player.currentTime >= c.out_point) {
      if (activeIndex + 1 < clips.length) {
        playClipAt(activeIndex + 1);
      } else {
        player.pause();
      }
    }
  });

  new ResizeObserver(() => {
    if (textProject) renderText(textProject, textPresets, computeTimelineTime());
    if (textProject) renderCaptions(textProject, textPresets, computeTimelineTime());
  }).observe(stage);

  function doPlay() {
    if (clips.length === 0) {
      if (virtualTime >= zeroClipDuration()) virtualTime = 0;
      startVirtualPlayback();
      return;
    }
    const atEnd = activeIndex >= 0 && activeIndex === clips.length - 1
      && player.currentTime >= clips[activeIndex].out_point;
    if (atEnd) playClipAt(0);
    else player.play();
  }
  function doPause() {
    if (clips.length === 0) { cancelVirtualPlayback(); setPlayingIcon(false); return; }
    player.pause();
  }
  function doRestart() {
    if (clips.length === 0) { virtualTime = 0; startVirtualPlayback(); return; }
    playClipAt(0);
  }
  function isPaused() {
    return clips.length === 0 ? !virtualPlaying : player.paused;
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
  player.addEventListener("play", () => setPlayingIcon(true));
  player.addEventListener("pause", () => setPlayingIcon(false));

  function seek(t) {
    if (clips.length === 0) {
      virtualTime = Math.max(0, Math.min(t, zeroClipDuration()));
      timeEl.textContent = virtualTime.toFixed(1);
      if (textProject) renderText(textProject, textPresets, virtualTime);
      if (textProject) renderCaptions(textProject, textPresets, virtualTime);
      if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
      return;
    }
    const loc = locate(clips, t);
    if (!loc) return;
    if (loc.clip !== clips[activeIndex]) {
      activeIndex = clips.indexOf(loc.clip);
      applyFillModeClass(loc.clip);
      player.src = "/media?path=" + encodeURIComponent(loc.clip.file_path);
      player.onloadedmetadata = () => { player.currentTime = loc.src; };
    } else {
      player.currentTime = loc.src;
    }
  }

  return { load, locate, sequenceDuration, seek, renderText, renderCaptions, currentTimelineTime: computeTimelineTime, play: doPlay, pause: doPause, restart: doRestart, isPaused, setSelectedTextBlock, setOnStageTextActivate, getActiveFormatSelection };
})();
