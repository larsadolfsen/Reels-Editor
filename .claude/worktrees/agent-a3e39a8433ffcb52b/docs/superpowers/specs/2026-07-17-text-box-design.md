# Text Box Component — Design

## Task list

- [ ] `TextPreset` model: replace `box`/`box_color` with the new Box fields + migration
- [ ] `store.py` migration for old saved projects (`box`/`box_color` → new fields)
- [ ] BOX accordion in the TEXT style panel (reusing `UI.buttonGroup`/`UI.numberField`/`UI.colorSwatch`)
- [ ] New `UI.resizeHandles` component (generic drag-resize handles)
- [ ] Stage integration: render handles on the selected text block, wire drag → preset fields → `saveProject()`
- [ ] `preview.js`: box background/border/radius/fixed-size CSS on `.text-block`
- [ ] `ass_render.py`: word-wrap computation (PIL font metrics) + `_box_dialogue()` vector-drawn box + updated `_style()`/`_block_dialogue()`
- [ ] `tests/test_ass_render.py`: cover new box/word-wrap functions
- [ ] `CLAUDE.md` inventory update

## Background

The project currently has no generic "box" concept. `TextPreset` has a `box`/`box_color` pair that only toggles a libass `BorderStyle=3` opaque background auto-sized to the text — no independent width/height, no border, no corner radius, no word-wrap control. Text is positioned by a single anchor point (`x`/`y`, derived from a `pos_row`/`pos_col` anchor grid + `offset_x`/`offset_y` nudge in the editor), not a sized box.

This is the first of three planned sub-projects toward "every item inserted into the project lives in a box": Text (this spec), Video/clip picture-in-picture boxes, and Captions boxes. The latter two are out of scope here — Video-Box needs `ClipLayer` to gain position/size fields and a compositing rewrite (clips currently fill the whole frame and play sequentially, never simultaneously); Captions-Box is blocked on captions having any real rendered layer at all (today it's a non-functional placeholder). Both are logged as separate future tasks, each to get its own brainstorming/spec/plan cycle once picked up.

## Goals

- Every text block gets a real Box: independently resizable width and height (each either a fixed pixel size or "fit to content"), an optional background color, and an optional border (width, color, corner radius).
- The box is resizable in the editor two ways: numeric fields in the panel, and drag handles directly on the stage.
- The exported mp4 visually matches the live editor preview (no "preview only" shortcut) — background/border/radius/fixed-size/word-wrap all render in the final ASS-burned video, not just in the browser.

## Non-goals

- Video clip boxes (PiP) — separate future spec.
- Caption boxes — separate future spec, blocked on captions groundwork.
- Nested/child boxes, or boxes containing anything other than the existing single heading text.

## Data model

`TextPreset` (`app/models.py`) replaces `box: bool` / `box_color: str` with:

```python
box_width_mode: str = "fit"       # "fit" | "fixed"
box_height_mode: str = "fit"      # "fit" | "fixed"
box_width: int = 0                # px on the 1080x1920 canvas; used when box_width_mode == "fixed"
box_height: int = 0               # px; used when box_height_mode == "fixed"
box_background: bool = False      # was `box`
box_background_color: str = "#000000"   # was `box_color`
box_border_width: int = 0
box_border_color: str = "#FFFFFF"
box_border_radius: int = 0
```

Position fields (`x`, `y`, `pos_row`, `pos_col`, `offset_x`, `offset_y`) are unchanged in shape; they now anchor the box's bounding rect instead of anchoring the text glyphs directly.

**Migration:** old saved project JSON with `box`/`box_color` must still load. Add a migration step in `store.py`'s `load_project` (or a Pydantic `model_validator(mode="before")` on `TextPreset`) that maps `box → box_background` and `box_color → box_background_color` when the old keys are present and the new ones are absent, defaulting all new size/border fields to their defaults ("fit", no border).

## Editor UI

### Style panel

A new **BOX** accordion section in the TEXT panel (same `UI.accordion` pattern as the existing FONT/MISC accordions), containing:

- **Width** row: a `UI.buttonGroup` toggle **Fit / Fixed**; when "Fixed" is active, a `UI.numberField` for `box_width` appears below it.
- **Height** row: same pattern, independent of width, controlling `box_height_mode`/`box_height`.
- **Background**: a checkbox for `box_background` + `UI.colorSwatch` for `box_background_color`.
- **Border**: `UI.numberField` for `box_border_width`, `UI.colorSwatch` for `box_border_color`, `UI.numberField` for `box_border_radius`.

### Stage drag handles

A new generic component, **`static/ui-resize-handles.js`**:

```js
window.UI.resizeHandles(container, { onResize, onDragEnd })
```

Renders 8 handles (4 corners + 4 edge midpoints) positioned around `container`'s bounding rect. During drag, calls `onResize(widthPx, heightPx)` live (for re-render); on mouseup, calls `onDragEnd(widthPx, heightPx)` once (for persistence). Purely presentational/interactive — no knowledge of text/presets — so it can be reused as-is for the future Video-Box work.

`preview.js` mounts this on the selected text block's `.text-block` div (only while that block is the current `selected` item). Wiring in `editor.js`:

- Dragging a handle flips that axis's mode to `"fixed"` (an explicit resize implies "give this a concrete size") and live-updates `box_width`/`box_height` in canvas-px (converted from stage-px via the existing stage/canvas scale factor).
- On `onDragEnd`, `saveProject()` persists the new mode + size — matching the debounce-on-commit pattern already used elsewhere (e.g. trim fields), not saving on every mousemove.
- Dragging the box body (not a handle) moves it, adjusting `offset_x`/`offset_y` the same way manual nudging already works — keeping the anchor-grid buttons and free-drag consistent (anchor sets the `x`/`y` baseline via `computeXY()`, drag adjusts offset from there).

## Browser preview rendering (`preview.js`)

`Preview.renderText()`'s `.text-block` div:

- Gets explicit `width`/`height` (scaled canvas-px → stage-px) when that axis's mode is `"fixed"`; left unset when `"fit"`, letting the browser's native text flow size the div to content (no wrap logic needed — the browser already wraps text inside a fixed-width block for free).
- Gets `background-color: box_background_color` (only when `box_background` is on), `border: box_border_width solid box_border_color`, `border-radius: box_border_radius`.

## Export rendering (`ass_render.py`)

libass has no native "independent bordered/radiused box behind wrapped text" primitive, so export needs two coordinated pieces per text block, replacing today's single-style `BorderStyle=3` trick:

1. **Word-wrap + fit-height computation**: a new helper measures line widths using the vendored font (`PIL.ImageFont`, reading the same `.woff2` files under `static/fonts/`) at `size_px`, inserting `\N` breaks so wrapped lines match the browser's flow when `box_width_mode == "fixed"`. When `box_height_mode == "fit"`, the resulting line count × line-height (+ padding) determines the box's rendered height.
2. **`_box_dialogue()`**: a new function emitting a separate `Dialogue` line, listed *before* the text dialogue in the `[Events]` section so it renders at a lower z-order (ASS/libass draws same-layer events in the order they're listed, earlier = further back): an ASS vector drawing (`\p1`) rectangle sized to the computed/fixed box dimensions, filled with `box_background_color` (when `box_background`), outlined with `box_border_color`/`box_border_width`, with bezier-approximated rounded corners when `box_border_radius > 0`. Positioned via `\pos` to align with the same anchor point the text dialogue uses.

`_style()` reverts to always using plain outline (`BorderStyle=1`, `p.outline_px`) instead of conditionally switching to `3` — the background box is now drawn independently via `_box_dialogue()`, not via the style's border trick.

## Testing

Following the existing pattern in `tests/test_ass_render.py` (pure-function unit tests, no real libass/ffmpeg invocation):

- `_style()`/`_box_dialogue()` string output across mode combinations (no box, background only, border only, both, rounded corners).
- The word-wrap helper's line-break decisions against known text/width/font-size fixtures.
- Fixed-vs-fit height computation given a known line count.

No new integration/rendering tests — the suite mocks subprocess calls rather than actually invoking ffmpeg/libass, consistent with every existing test file.

## Open questions / risks

- PIL's font-metrics measurement needs to closely match the browser's actual text layout (font hinting/kerning can differ slightly between PIL's rasterizer and a browser engine) — some pixel-level drift between preview and export is possible and may need a small tolerance/padding constant, tuned during implementation.
- ASS bezier-approximated rounded corners are a manual vector-math computation (no built-in "rounded rect" primitive in the ASS drawing spec) — implementation should keep this isolated in one small helper function so it's easy to unit-test in isolation.
