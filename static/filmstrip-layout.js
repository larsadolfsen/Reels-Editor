// Pure JS mirror of app/filmstrip.py's frame_interval/frame_count/FRAME_W/FRAME_H —
// lets the client compute a media file's cached filmstrip sprite layout from
// MediaItem.duration alone, with no extra network round trip. Keep frameInterval/
// frameCount identical to app/filmstrip.py; a change to one should prompt a check
// of the other. tilesForBlock is frontend-only (no Python counterpart): the
// global-grid tile math for timeline-video-row.js's continuous filmstrip.
// Exposes window.Filmstrip.{frameInterval, frameCount, tilesForBlock, FRAME_W, FRAME_H}.
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

  // Tiles sit on a global row-coordinate grid (n * tileW), so adjacent slices of
  // the same source read as one uninterrupted filmstrip regardless of where the
  // slice boundaries fall. drawX is relative to the block's left edge and may be
  // negative for the block's leading partial tile; sourceTime may likewise start
  // slightly before in_point there — the frameIndex clamp absorbs both.
  function tilesForBlock(blockLeft, blockWidth, tileW, pxPerSec, inPoint, speed, interval, count) {
    const tiles = [];
    if (blockWidth <= 0 || tileW <= 0 || pxPerSec <= 0) return tiles;
    for (let n = Math.floor(blockLeft / tileW); n * tileW < blockLeft + blockWidth; n++) {
      const drawX = n * tileW - blockLeft;
      const sourceTime = inPoint + (drawX / pxPerSec) * speed;
      const frameIndex = Math.min(count - 1, Math.max(0, Math.round(sourceTime / interval)));
      tiles.push({ drawX, frameIndex });
    }
    return tiles;
  }

  return { frameInterval, frameCount, tilesForBlock, FRAME_W, FRAME_H };
})();
