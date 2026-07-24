// VIDEO-row clip-block filmstrips: draws sampled source-video frames into each clip's
// timeline block by slicing the media's cached sprite sheet (see app/filmstrip.py /
// api-get-media-filmstrip.js) onto a <canvas> mounted inside the block, behind the
// existing label span. Sprites are fetched once per media id and cached client-side
// in filmstripCache; fetches are fire-and-forget — onReady fires once a fetch
// resolves so the caller can re-render with the now-cached image. A clip whose
// sprite hasn't loaded yet (or failed to fetch) is left showing the block's existing
// CSS striped-placeholder background, since no canvas is mounted in that case.
// Redrawing on every timeline render() (including zoom changes) is what makes the
// filmstrip resample to more/fewer distinct frames as px/sec changes.
// Each drawn thumbnail is a fixed TILE_W x TILE_H box, centered vertically in the row;
// tiles are spaced at least TILE_W apart so they never overlap — at low zoom (many
// sampled frames per pixel) that means some frames are skipped rather than the same
// frame being duplicated to fill the gap.
// Exposes window.TimelineVideoRow.render(blockDiv, clip, media, px, onReady).
window.TimelineVideoRow = (() => {
  const filmstripCache = {}; // mediaId -> "loading" | "error" | HTMLImageElement
  const TILE_W = 32.4;
  const TILE_H = 50.4;

  // Returns a loaded sprite image synchronously if cached; otherwise kicks off a
  // fetch (once per media id) and returns null. onReady fires when that fetch
  // resolves into a usable image.
  function getFilmstripImage(mediaId, filePath, onReady) {
    const cached = filmstripCache[mediaId];
    if (cached === "loading" || cached === "error") return null;
    if (cached) return cached;
    filmstripCache[mediaId] = "loading";
    Api.getMediaFilmstrip(mediaId, filePath).then((url) => {
      if (!url) {
        filmstripCache[mediaId] = "error";
        return;
      }
      const img = new Image();
      img.onload = () => {
        filmstripCache[mediaId] = img;
        onReady();
      };
      img.onerror = () => {
        filmstripCache[mediaId] = "error";
      };
      img.src = url;
    });
    return null;
  }

  function drawFilmstrip(blockDiv, clip, media, px, img) {
    const rowHeight = blockDiv.clientHeight || 56;
    const widthPx = parseFloat(blockDiv.style.width) || 0;
    if (widthPx <= 0) return;

    const canvas = document.createElement("canvas");
    canvas.className = "video-clip-filmstrip";
    canvas.width = Math.max(1, Math.round(widthPx));
    canvas.height = rowHeight;
    blockDiv.insertBefore(canvas, blockDiv.firstChild);

    const ctx = canvas.getContext("2d");
    const interval = Filmstrip.frameInterval(media.duration);
    const count = Filmstrip.frameCount(media.duration, interval);
    const speed = clip.speed || 1;
    const frameSpanPx = Math.max(1, (interval / speed) * px);
    const tileY = (rowHeight - TILE_H) / 2;
    const step = Math.max(frameSpanPx, TILE_W);

    for (let x = 0; x < widthPx; x += step) {
      const sourceTime = clip.in_point + (x / px) * speed;
      const frameIndex = Math.min(count - 1, Math.max(0, Math.round(sourceTime / interval)));
      const tileW = Math.min(TILE_W, widthPx - x);
      ctx.drawImage(
        img,
        frameIndex * Filmstrip.FRAME_W, 0, Filmstrip.FRAME_W, Filmstrip.FRAME_H,
        x, tileY, tileW, TILE_H
      );
    }
  }

  function render(blockDiv, clip, media, px, onReady) {
    if (!media) return;
    const img = getFilmstripImage(media.id, media.file_path, onReady);
    if (!img) return;
    drawFilmstrip(blockDiv, clip, media, px, img);
  }

  return { render };
})();
