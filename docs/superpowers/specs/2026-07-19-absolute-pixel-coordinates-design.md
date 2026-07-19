# Absolute pixel coordinates for text position

Backlog source: `docs/superpowers/backlog.md`, "Redefine the HORIZONTAL/VERTICAL coordinate fields as absolute, 1-indexed pixel coordinates..." (flagged 2026-07-19 as needing its own design pass).

## Goal

Replace the anchor-grid + offset model for text-block position with direct, absolute pixel coordinates, while keeping the 3x3 grid as a one-click shortcut.

## Semantics

- `preset.x` — horizontal pixel. Meaning depends on `preset.align`: the box's **left** edge (align=left), **center** (align=center), or **right** edge (align=right).
- `preset.y` — vertical pixel, always the box's **top** edge, regardless of align.
- Both are 1-indexed on the 1080x1920 canvas (pixel 1 = leftmost/topmost).

This replaces the current model where `x`/`y` are always a CENTER anchor point (ASS `Alignment=5` hardcoded, `-50%/-50%` CSS transform, `_box_dialogue()`'s `-width/2`/`-height/2` conversion).

## Data model — `app/models.py`

Remove `pos_row`, `pos_col`, `offset_x`, `offset_y` from `TextPreset`. `x`/`y` become the sole source of truth for position (defaults unchanged: `x=540, y=700`).

**No migration** for existing saved projects. Converting old center-anchored `x/y` to the new top/align-anchored semantics would require the box's rendered height, which is only computed dynamically (word-wrap + font metrics) inside `ass_render.py`/`preview.js`, not stored. Given this is a local single-user dev tool with no real data at stake, existing saved projects will show a one-time visual jump on first load after this ships — no migration code, no fallback.

## ASS export — `app/ass_render.py`

- `_style()`: stop hardcoding `Alignment=5`. Pick `\an7`/`\an8`/`\an9` (ASS numpad TopLeft/TopCenter/TopRight) from `preset.align`. This doubles as a bugfix — ASS's alignment code drives both the `\pos` anchor corner *and* multi-line text justification, so today's hardcoded 5 means multi-line text is always center-justified in export regardless of `preset.align`; the new per-align codes justify correctly too.
- `_block_dialogue()`: `\pos(p.x, p.y)` now directly *is* the anchor corner picked by the style's alignment code — no arithmetic conversion needed.
- `_box_dialogue()`: `left`/`top` computation becomes align-aware:
  - `top = p.y` (always)
  - `left = p.x` if align=left; `p.x - width / 2` if align=center; `p.x - width` if align=right

## Preview — `static/preview.js` + `static/css/components/stage.css`

`preview.js` keeps setting `div.style.left`/`div.style.top` inline (per-instance computed pixel values — unchanged pattern, not a CLAUDE.md no-inline-styles violation, which targets static markup).

The align-dependent anchor transform moves out of the blanket inline `transform: translate(-50%, -50%)` and into three CSS classes in `stage.css`:

```css
.text-block--align-left   { transform: translateY(0); }
.text-block--align-center { transform: translate(-50%, 0); }
.text-block--align-right  { transform: translate(-100%, 0); }
```

(Vertical translate is always 0 — `y` is always the top edge.) `preview.js` sets `div.className` to include the matching modifier class instead of writing `transform` inline.

## Editor UI — `static/editor.js`, `static/text-panel-position.js`

- `editor.js`: delete `computeXY()` and `rebaseAnchorFromXY()`. `POSITION_ANCHORS_X`/`POSITION_ANCHORS_Y` constants stay (reused by the grid shortcut below) but are applied directly, not composed with an offset. `handleBoxMove`/`handleBoxMoveEnd` (drag-to-reposition) add the pixel delta straight onto `preset.x`/`preset.y` instead of `offset_x`/`offset_y`.
- `text-panel-position.js`: HORIZONTAL/VERTICAL `UI.numberField`s edit `preset.x`/`preset.y` directly (labels unchanged). Grid buttons (`position-row-group`/`position-col-group`) become stateless one-shot actions — clicking a cell writes `POSITION_ANCHORS_X[col]`/`POSITION_ANCHORS_Y[row]` straight into `preset.x`/`preset.y`. No persisted `pos_row`/`pos_col`, so the grid has no "active" highlight state — it's a pure shortcut button row, not a toggle group (consistent with dropping those fields from the model).

## Out of scope

- Migrating existing saved projects' positions (explicitly rejected above).
- Any change to the BOX size modes (FIT/FREE), drag-to-resize, or background/border rendering — only position anchor semantics change.
- A "current cell" highlight on the position grid.

## Verification

- All 3 aligns x FIT/FREE box modes, both in the live preview and via a real export + frame extraction (this area has produced preview/export parity bugs before — see backlog's Text Box Task 13 entry).
- Drag-to-reposition still moves the box smoothly and persists correctly (rounds to int before saving, per `TextPreset`'s int-typed fields).
- Grid-button clicks land the box at the expected edge/corner for each align.
- `pytest -q` green.
