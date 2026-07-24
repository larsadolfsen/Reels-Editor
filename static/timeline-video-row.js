// VIDEO-row clip-block filmstrips: draws sampled source-video frames into each clip's
// timeline block by slicing the media's cached sprite sheet (see app/filmstrip.py /
// api-get-media-filmstrip.js) onto a <canvas> mounted inside the block, behind the
// existing label span. Sprites are fetched once per media id and cached client-side
// in filmstripCache; fetches are fire-and-forget — onReady fires once a fetch
// resolves so the caller can re-render with the now-cached image. A clip whose
// sprite hasn't loaded yet (or failed to fetch) is left showing the block's existing
// CSS striped-placeholder background, since no canvas is mounted in that case.
// Tiles are full block height and 9:16 (tileW = height * 9/16), laid out on a
// GLOBAL row-coordinate grid via Filmstrip.tilesForBlock (filmstrip-layout.js):
// tile positions don't restart at slice boundaries, so adjacent slices of the same
// source read as one continuous filmstrip, and a block of any width (even narrower
// than one tile) draws its cropped window of the underlying tiles — frames are
// cropped by the canvas bounds, never squashed. Redrawing on every timeline
// render() (including zoom changes) is what makes the filmstrip resample as
// px/sec changes. Exposes window.TimelineVideoRow.render(blockDiv, clip, media, px, onReady).
window.TimelineVideoRow = (() => {
  const filmstripCache = {}; // mediaId -> "loading" | "error" | HTMLImageElement

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
    const blockLeft = parseFloat(blockDiv.style.left) || 0;
    const widthPx = parseFloat(blockDiv.style.width) || 0;
    if (widthPx <= 0) return;
    const tileH = rowHeight;
    const tileW = tileH * 9 / 16;

    const canvas = document.createElement("canvas");
    canvas.className = "video-clip-filmstrip";
    canvas.width = Math.max(1, Math.round(widthPx));
    canvas.height = rowHeight;
    blockDiv.insertBefore(canvas, blockDiv.firstChild);

    const ctx = canvas.getContext("2d");
    const interval = Filmstrip.frameInterval(media.duration);
    const count = Filmstrip.frameCount(media.duration, interval);
    const tiles = Filmstrip.tilesForBlock(
      blockLeft, widthPx, tileW, px, clip.in_point, clip.speed || 1, interval, count
    );
    for (const t of tiles) {
      ctx.drawImage(
        img,
        t.frameIndex * Filmstrip.FRAME_W, 0, Filmstrip.FRAME_W, Filmstrip.FRAME_H,
        t.drawX, 0, tileW, tileH
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
