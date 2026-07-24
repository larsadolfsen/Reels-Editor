# Timeline filmstrip: continuous 9:16 thumbnails — design

Date: 2026-07-24
Status: approved

## Problem

The VIDEO-row filmstrip (`static/timeline-video-row.js`) has three defects:

1. **Narrow slices show the striped placeholder instead of thumbnails.** The renderer
   bails out when a block is narrower than one tile (32.4 px). After auto-slicing
   (filler-word removal), the timeline is full of small clips, so most of the row
   shows stripes instead of frames.
2. **Tiles are not 9:16.** Tiles are drawn at 32.4×50.4 (9:14) while the sprite
   frames are 36×64 (true 9:16), so frames are squashed and the tile doesn't fill
   the row height.
3. **Tiling restarts at every slice boundary.** Each block starts its own tile grid
   at its left edge, so slicing shifts and clips thumbnails instead of the row
   reading as one continuous filmstrip.

## Requirements (user)

- The VIDEO row is filled with thumbnails from start to end — no placeholder
  stripes for narrow slices (the placeholder remains only while a sprite is
  loading or failed).
- Every thumbnail tile is 9:16.
- Thumbnails ignore slice boundaries: each tile shows the nearest generated frame
  for the source time under it, so adjacent slices of the same source read as one
  uninterrupted filmstrip.
- Sources are always 9:16 — the backend sprite's scale+pad is a no-op and stays
  untouched.

## Design

Frontend-only. Reuses: the sprite-sheet cache (`app/filmstrip.py`,
`Api.getMediaFilmstrip`, client-side `filmstripCache`), the per-block
`<canvas class="video-clip-filmstrip">` DOM structure, and
`Filmstrip.frameInterval`/`frameCount`. No backend changes.

### 1. True 9:16 tiles at full row height

Drop the hardcoded `TILE_W = 32.4` / `TILE_H = 50.4` constants. At draw time:
`tileH = block height`, `tileW = tileH * 9 / 16`. No vertical centering offset.

### 2. Global tile grid

`static/timeline.js` passes each block's row-coordinate left edge (`acc * px`,
already computed in the VIDEO-row loop) into `TimelineVideoRow.render` as a new
parameter. Tiles sit at fixed positions `n * tileW` in row coordinates. Each
block draws every grid tile overlapping `[blockLeft, blockLeft + width)`:

- For grid tile `n`, `drawX = n * tileW - blockLeft` (may be negative for the
  first partial tile; the canvas clips it).
- `sourceTime = clip.in_point + ((n * tileW - blockLeft) / px) * clip.speed`
  (may be slightly negative at the block's leading partial tile; the frame index
  clamp handles it).
- `frameIndex = clamp(round(sourceTime / interval), 0, count - 1)` — unchanged
  nearest-frame rule.
- Each tile draws the full 36×64 sprite frame into a full `tileW × tileH` dest
  rect; partial tiles at block edges are *cropped* by the canvas bounds, never
  squashed into a narrower dest.

### 3. No minimum-width bailout

Remove the `widthPx < TILE_W` early return. A block of any width draws its
clipped window of the underlying grid tiles.

### Pure math extraction

The tile-grid computation — `(blockLeft, blockWidth, pxPerSec, inPoint, speed,
interval, frameCount, tileW) -> list of {drawX, frameIndex}` — becomes a pure
helper `Filmstrip.tilesForBlock(...)` in `static/filmstrip-layout.js`, keeping
`timeline-video-row.js` as thin canvas wiring.

## Files touched

- `static/filmstrip-layout.js` — add pure `tilesForBlock()`.
- `static/timeline-video-row.js` — new `blockLeft` param, tile sizing from block
  height, draw loop consumes `tilesForBlock()`, remove min-width bailout.
- `static/timeline.js` — pass `acc * px` into `TimelineVideoRow.render`.
- `CLAUDE.md` — update the map entries for the three files.

## Error handling

Unchanged: a sprite that is still loading or failed to fetch mounts no canvas,
leaving the existing striped CSS placeholder. `onReady` re-render behavior
unchanged.

## Testing & verification

The repo's automated suite is Python-only and nothing backend changes, so no new
pytest tests; the existing suite must still pass. The frontend logic is isolated
in the pure `tilesForBlock()` helper; the canvas/DOM wiring layer stays thin.
Verification is manual: load a project with many slices, confirm in the browser
that (a) every block shows frames regardless of width, (b) tiles are unsquashed
9:16 at full row height, (c) thumbnails don't shift when a clip is sliced, and
(d) zoom in/out re-tiles correctly. Screenshot as proof.
