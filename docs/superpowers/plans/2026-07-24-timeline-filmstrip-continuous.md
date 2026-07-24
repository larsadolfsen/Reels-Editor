# Continuous 9:16 Timeline Filmstrip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timeline VIDEO row read as one continuous filmstrip of full-height 9:16 thumbnails — every block filled regardless of width, tiles aligned to a global row grid so slicing never shifts or clips thumbnails.

**Architecture:** Frontend-only. A new pure helper `Filmstrip.tilesForBlock()` in `static/filmstrip-layout.js` computes, for one clip block, the list of global-grid tiles overlapping it (each tile = a draw x-offset within the block + a nearest-sampled-frame index). `static/timeline-video-row.js` becomes thin canvas wiring: it reads the block's row-coordinate left edge from `style.left`, sizes tiles as full-block-height × 9:16, and draws each tile's sprite frame full-size (canvas bounds crop partial tiles — frames are never squashed). The min-block-width bailout is removed. Backend sprite generation (`app/filmstrip.py`) is untouched.

**Tech Stack:** Vanilla JS (no build step, `window.*` classic scripts), HTML5 canvas, existing sprite-sheet cache.

**Spec:** `docs/superpowers/specs/2026-07-24-timeline-filmstrip-continuous-design.md`

## Global Constraints

- No JS build step or bundler; files attach to `window.*` and load as classic scripts.
- Every `static/*.js` file opens with a 1–2 line purpose comment — keep it current when behavior changes.
- No inline `style="..."` attributes; styling stays in `static/css/**`.
- `static/filmstrip-layout.js` mirrors `app/filmstrip.py`'s `frame_interval`/`frame_count` byte-for-byte — do NOT touch those two functions or `FRAME_W`/`FRAME_H`. `tilesForBlock` is frontend-only (no Python mirror needed; it has no backend counterpart).
- Repo test suite is Python-only: run `.venv/Scripts/python -m pytest -q` before declaring done (must stay green; nothing backend changes). The pure JS helper is verified with a scratch Node script (Node v24 is on PATH); the script is NOT committed.
- Any commit that changes what a file does updates that file's `CLAUDE.md` map entry in the same commit.

---

### Task 1: Pure tile-grid helper `Filmstrip.tilesForBlock()`

**Files:**
- Modify: `static/filmstrip-layout.js`

**Interfaces:**
- Consumes: nothing new (pure math, no deps).
- Produces: `Filmstrip.tilesForBlock(blockLeft, blockWidth, tileW, pxPerSec, inPoint, speed, interval, count) -> Array<{drawX: number, frameIndex: number}>` — used by Task 2.
  - `blockLeft`/`blockWidth`: the clip block's left edge and width in row pixels.
  - `tileW`: tile width in px (caller computes `rowHeight * 9 / 16`).
  - `pxPerSec`: current zoom scale.
  - `inPoint`: clip's source trim-in seconds; `speed`: clip playback speed (already defaulted to 1 by caller).
  - `interval`/`count`: the media's sprite layout from `Filmstrip.frameInterval`/`frameCount`.
  - Each returned tile: `drawX` = tile's x offset *within the block* (first tile may be negative — the canvas crops it), `frameIndex` = nearest sampled frame, clamped to `[0, count-1]`.

- [ ] **Step 1: Add the function to `static/filmstrip-layout.js`**

Replace the file's contents with:

```javascript
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
```

- [ ] **Step 2: Write the scratch Node verification script (NOT committed)**

Write to the session scratchpad directory (any temp path outside the repo) as `check-tiles.mjs`:

```javascript
// Scratch check for Filmstrip.tilesForBlock — run with: node check-tiles.mjs
import { readFileSync } from "fs";
global.window = {};
eval(readFileSync(process.argv[2] ?? "static/filmstrip-layout.js", "utf8"));
const F = global.window.Filmstrip;

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${msg}\n  actual:   ${a}\n  expected: ${e}`); process.exitCode = 1; }
  else console.log(`ok  ${msg}`);
}

// 1. Block starting at 0, width exactly 3 tiles: tiles at 0, 20, 40.
assertEq(
  F.tilesForBlock(0, 60, 20, 10, 0, 1, 1, 100).map(t => t.drawX),
  [0, 20, 40],
  "aligned block yields whole tiles"
);

// 2. Global grid alignment: block starting mid-tile (left=50, tileW=20) begins
//    with a negative-offset partial tile at drawX -10, then 10, 30.
assertEq(
  F.tilesForBlock(50, 50, 20, 10, 0, 1, 1, 100).map(t => t.drawX),
  [-10, 10, 30],
  "mid-tile block leads with negative-offset partial tile"
);

// 3. frameIndex clamps at 0 for the leading tile's slightly-negative sourceTime
//    (inPoint 0, drawX -10 => sourceTime -1s) and rounds to nearest elsewhere.
assertEq(
  F.tilesForBlock(50, 50, 20, 10, 0, 1, 1, 100).map(t => t.frameIndex),
  [0, 1, 3],
  "frame indices clamp at 0 and round to nearest"
);

// 4. frameIndex clamps at count-1 near the end of the media.
assertEq(
  F.tilesForBlock(0, 40, 20, 10, 98, 1, 1, 100).map(t => t.frameIndex),
  [98, 99],
  "frame indices clamp at count-1"
);

// 5. Slice continuity: one 10s clip sliced at t=5 into two blocks. The tile grid
//    positions must be identical to the unsliced clip's, and frame indices must
//    match at every shared grid position.
const whole = F.tilesForBlock(0, 100, 20, 10, 0, 1, 1, 100);
const left = F.tilesForBlock(0, 50, 20, 10, 0, 1, 1, 100);
const right = F.tilesForBlock(50, 50, 20, 10, 5, 1, 1, 100);
const stitched = [...left.map(t => t.drawX), ...right.map(t => t.drawX + 50)];
assertEq(stitched.filter((x, i) => stitched.indexOf(x) === i), whole.map(t => t.drawX),
  "sliced blocks cover the same global grid positions as the whole clip");
assertEq(right.map(t => t.frameIndex), whole.slice(2).map(t => t.frameIndex),
  "right slice shows the same frames the whole clip showed there");

// 6. Narrow block (narrower than one tile) still yields its clipped tiles — here
//    the 6px block [37, 43) overlaps grid tiles [20, 40) and [40, 60).
assertEq(F.tilesForBlock(37, 6, 20, 10, 0, 1, 1, 100).map(t => t.drawX), [-17, 3],
  "sub-tile-width block still gets its clipped tiles");

// 7. Speed scales source time: speed 2 doubles sourceTime per pixel.
assertEq(F.tilesForBlock(0, 60, 20, 10, 0, 2, 1, 100).map(t => t.frameIndex), [0, 4, 8],
  "clip speed scales the sampled source time");

// 8. Degenerate inputs return no tiles.
assertEq(F.tilesForBlock(0, 0, 20, 10, 0, 1, 1, 100), [], "zero width -> no tiles");
assertEq(F.tilesForBlock(0, 60, 0, 10, 0, 1, 1, 100), [], "zero tileW -> no tiles");

if (process.exitCode) { console.error("CHECKS FAILED"); } else { console.log("all checks passed"); }
```

- [ ] **Step 3: Run the check**

Run from the repo root: `node <scratchpad>/check-tiles.mjs static/filmstrip-layout.js`
Expected: eight `ok` lines and `all checks passed`, exit code 0. If any `FAIL` prints, fix `tilesForBlock` (not the expectations — they encode the spec) and re-run.

- [ ] **Step 4: Update `CLAUDE.md` map entry**

In the root `CLAUDE.md`, find the `filmstrip-layout.js` line in the File structure tree and replace it with:

```
  filmstrip-layout.js     # window.Filmstrip.{frameInterval, frameCount, tilesForBlock, FRAME_W, FRAME_H} (added 2026-07-23, timeline thumbnails): pure JS mirror of app/filmstrip.py layout math plus tilesForBlock (frontend-only, added 2026-07-24 continuous-filmstrip fix): global-row-grid tile positions + nearest-frame indices for one clip block, consumed by timeline-video-row.js
```

- [ ] **Step 5: Commit**

```bash
git add static/filmstrip-layout.js CLAUDE.md
git commit -m "feat: add pure Filmstrip.tilesForBlock global-grid tile math"
```

---

### Task 2: Rewire `timeline-video-row.js` to the global grid

**Files:**
- Modify: `static/timeline-video-row.js`

**Interfaces:**
- Consumes: `Filmstrip.tilesForBlock(blockLeft, blockWidth, tileW, pxPerSec, inPoint, speed, interval, count) -> Array<{drawX, frameIndex}>` (Task 1), plus existing `Filmstrip.frameInterval/frameCount/FRAME_W/FRAME_H`.
- Produces: `window.TimelineVideoRow.render(blockDiv, clip, media, px, onReady)` — signature UNCHANGED (callers in `static/timeline.js` are untouched; the block's left edge is read from `blockDiv.style.left`, which `timeline.js`'s `addBlock` always sets).

- [ ] **Step 1: Replace `drawFilmstrip` and the header comment**

Replace the file's contents with:

```javascript
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
```

Notes for the implementer:
- The old `TILE_W`/`TILE_H` constants, the `widthPx < TILE_W` early return, and the `tileY` vertical-centering offset are all deliberately gone.
- Every tile draws the FULL `FRAME_W × FRAME_H` source rect into a FULL `tileW × tileH` dest rect — the old `tileW = Math.min(TILE_W, widthPx - x)` squeeze must not survive. Partial tiles at block edges are cropped by the canvas bounds automatically.
- `render`'s signature and the loading/error placeholder behavior are unchanged.

- [ ] **Step 2: Run the Python suite (regression only — nothing backend changed)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass, same count as before the change.

- [ ] **Step 3: Update `CLAUDE.md` map entry**

In the root `CLAUDE.md`, find the `timeline-video-row.js` line in the File structure tree and replace it with:

```
  timeline-video-row.js  # window.TimelineVideoRow.render(blockDiv, clip, media, px, onReady) (added 2026-07-23, timeline thumbnails; reworked 2026-07-24 continuous-filmstrip fix): draws a per-clip `<canvas class="video-clip-filmstrip">` inside each VIDEO-row timeline block — full-block-height 9:16 tiles on a GLOBAL row grid (Filmstrip.tilesForBlock, so slice boundaries never shift/clip thumbnails and any-width blocks show their cropped tile window instead of the old <1-tile stripe fallback); mirrors timeline-audio-row.js's fetch-once-cache-client-side pattern — a clip whose filmstrip hasn't loaded (or failed) keeps the existing striped CSS placeholder
```

Also update the "Filmstrip thumbnails (added 2026-07-23)" paragraph under the Timeline inventory section: replace its last sentence ("`static/timeline.js`'s VIDEO-row render loop calls…") with:

```
`static/timeline.js`'s VIDEO-row render loop calls `TimelineVideoRow.render()` for each clip, mirroring the audio-row pattern for fetch-once, cache-client-side canvases; since 2026-07-24 tiles are full-row-height 9:16 on a global row grid (`Filmstrip.tilesForBlock`), so thumbnails ignore slice boundaries and fill blocks of any width.
```

- [ ] **Step 4: Commit**

```bash
git add static/timeline-video-row.js CLAUDE.md
git commit -m "fix: continuous full-height 9:16 timeline filmstrip on a global tile grid"
```

---

### Final verification (orchestrator, not a subagent task)

- [ ] Run the full suite once: `.venv/Scripts/python -m pytest -q` — green.
- [ ] Start the dev server preview, open a project with several sliced clips, and confirm in the browser: (a) every VIDEO-row block shows frames regardless of width — no striped placeholders once sprites load; (b) tiles fill the row height, unsquashed 9:16; (c) slicing a clip at the playhead does not shift the thumbnails; (d) zoom −/+ re-tiles without gaps. Screenshot as proof.
