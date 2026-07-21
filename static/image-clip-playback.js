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
