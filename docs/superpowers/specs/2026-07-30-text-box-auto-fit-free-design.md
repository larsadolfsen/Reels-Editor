# Text box auto FIT→FREE, drop FILL

Date: 2026-07-30

## Problem

The TEXT panel's Box tab exposes an explicit SIZE toggle (FIT/FREE/FILL) for a text block's
box sizing. This is more control surface than the feature needs: a block with no text has no
meaningful size to toggle, and once text exists, users overwhelmingly want a box they can drag
to resize rather than a mode they have to pick first. FILL (auto-shrinking the font to fit a
fixed box) adds a third state that's rarely used and doubles the code paths this feature has to
support.

## Behavior

- A new/empty text block stays in `"fit"` mode: the box hugs its content, or shows the existing
  placeholder ("Add your text here", already implemented in `preview-text.js`) when empty. No
  manual size fields shown.
- The moment the user finishes an edit (blur / `onEditEnd`, not on every keystroke) leaving the
  block non-empty while it is still in `"fit"` mode, the block freezes: its current on-stage
  rendered size is read and written into `box_width`/`box_height`, and the mode flips to
  `"fixed"`. From that point the box is manually resizable via the existing drag handles, exactly
  like a block created in FREE mode today.
- This is one-way. Once frozen to `"fixed"`, the block never reverts to `"fit"` again — not even
  if the user deletes all the text back to empty. (This mirrors the existing precedent: dragging
  a resize handle already auto-switches FIT→FIXED, and that switch is likewise permanent.)
- FILL mode is removed entirely — from the UI, and from the auto-shrink-font behavior it drove.
- CAPTIONS is unaffected. Its box is always fixed-size and never had this SIZE group
  (`sizeModes: false`).

### Why freeze on blur, not on the first keystroke

Freezing on the first character would lock the box to a one-character width while the user kept
typing, causing immediate overflow. Freezing on blur lets the box keep growing live with the
content while the user is actively editing, then lock in a sensible size once they're done —
the same moment `handleBoxResizeEnd` already locks in a size after a drag.

## Non-goals

- No change to CAPTIONS' box sizing (already always fixed).
- No migration of existing saved projects. A block already saved in `box_width_mode: "fill"`
  keeps rendering as a fixed-size box exactly as before (the backend's `width_fixed`/
  `height_fixed` checks already treat `"fill"` as equivalent to `"fixed"` — see
  `app/ass_render.py`), it just stops auto-shrinking its font on further edits. This is an
  acceptable, graceful degradation; no explicit migration is written.
- No new way to manually re-enable FIT on a block that already has content.

## Implementation notes (files touched)

- `static/panel-text.js`
  - `renderTextPanel`'s `onEditEnd` callback (passed to `Preview.setSelectedTextBlock`): before
    the existing `renderTextPreview()` + `saveProject()`, add the freeze check — if
    `preset.box_width_mode === "fit"` and the block's `heading` (trimmed) is non-empty, read the
    block's current rendered size (`Preview.getTextBoxSize(block.id)`, canvas px) and set
    `preset.box_width`/`box_height` from it, then `box_width_mode = box_height_mode = "fixed"`.
  - `handleBoxResizeEnd`: remove the `wasFill` branch (dead once FILL doesn't exist) — always
    sets mode to `"fixed"`.
- `static/style-section-box.js`
  - Remove the FIT/FREE/FILL `UI.buttonGroup` and its "SIZE" label for the `sizeModes: true`
    (TEXT) case. Keep the existing WIDTH/HEIGHT-hidden-while-`"fit"` logic in `render()` — it's
    still needed, just driven automatically instead of by user selection.
  - `options.sizeModes` keeps its existing meaning (hide WIDTH/HEIGHT in `"fit"` for TEXT; always
    show for CAPTIONS) — only the button group markup goes away.
- `static/style-section-size.js`
  - Remove the FILL-disables-the-SIZE-field logic in `render()` (the `disabled` check against
    `box_width_mode === "fill"`) — dead once FILL doesn't exist.
- `static/preview-text.js`
  - Delete `maybeRefitFillText` and the `fitCache` map (FILL-only).
  - `widthIsBoxed`/`heightIsBoxed`: drop the `|| preset.box_*_mode === "fill"` branch, checking
    only `=== "fixed"`.
- `static/font-fit.js`
  - Delete `fitFontSize` and `wrapText` (their only consumer was `maybeRefitFillText`). Keep
    `canvasMeasurer` (still used by `preview-captions.js`'s pagination measurer). Update the file
    header comment to describe its narrowed purpose.
- `app/ass_render.py` / backend models — no changes. Existing `width_fixed`/`height_fixed`
  handling already covers legacy `"fill"` values as equivalent to `"fixed"`.

## Testing

- No new pure-logic module is introduced (the freeze check is a few lines of DOM-adjacent
  wiring in `panel-text.js`, not separable into a pure function without over-engineering this
  small a change), so this is verified manually in the browser on a throwaway project:
  1. Add a new text block — confirm it shows the placeholder and no WIDTH/HEIGHT fields.
  2. Type some text, click away (blur) — confirm the box now shows resize handles and the Box
     tab shows WIDTH/HEIGHT with the just-typed size.
  3. Resize it manually — confirm it behaves exactly as today's FREE mode.
  4. Delete all the text back to empty — confirm the box stays manually-sized (does not revert
     to auto-fit-to-content or re-show the SIZE toggle).
  5. Confirm the SIZE FIT/FREE/FILL group no longer renders in the Box tab.
  6. Open an existing saved project with a block still in `"fill"` mode (if one exists in a test
     project) — confirm it still renders correctly as a fixed box.
