// Pure JS mirror of app/filmstrip.py's frame_interval/frame_count/FRAME_W/FRAME_H —
// lets the client compute a media file's cached filmstrip sprite layout from
// MediaItem.duration alone, with no extra network round trip. Keep this file's
// logic identical to app/filmstrip.py; a change to one should prompt a check of
// the other. Exposes window.Filmstrip.{frameInterval, frameCount, FRAME_W, FRAME_H}.
window.Filmstrip = (() => {
  const FRAME_W = 36;
  const FRAME_H = 64;

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
