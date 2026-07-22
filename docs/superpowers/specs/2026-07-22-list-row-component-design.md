# List-row component — design

## Problem

Four files independently hand-roll the same "clickable list row" recipe (padding/border-radius/margin/background/border/cursor, hover state, sometimes a selected state):

- `static/css/components/project-list-row.css`'s `.project-list-row`
- `static/css/components/layers-panel.css`'s `.layers-list-row`
- `static/css/components/style-panel.css`'s `#clip-list li`
- `static/css/components/sub-panel.css`'s `.font-list-row`

Three of the four are byte-for-byte identical (padding `var(--space-2)`, `border-radius: 3px`, `margin-bottom: var(--space-1)`, `background: var(--bg-2)`, `border: 1px solid var(--border-soft)`, `cursor: pointer`, hover swaps `border-color` to `var(--border-hover-color)`). `.font-list-row` shares the same shape but forks on hover behavior: it starts fully transparent (`background: transparent`, `border: 1px solid transparent`) and swaps `background` to `var(--bg-2)` on hover instead of swapping `border-color`. State coverage also drifts: `.project-list-row` and `#clip-list li` support a `.selected` state (`border-color: var(--accent)`); `.layers-list-row` has none.

This is the same class of bug already found and fixed for `.clip-section-label` (see `docs/superpowers/specs/2026-07-22-text-styling-component-design.md`): a structural/list selector (`#clip-list li`) applying card/hover/background styling indiscriminately to every child, including ones that shouldn't have it. Retiring the raw `#clip-list li` selector in favor of an explicit opt-in class fixes that root cause more directly than the `:not()` exclusion the text-styling spec originally proposed.

## Goal

One shared list-row component so no panel hand-rolls this recipe again: a `window.UI.listRow(el, opts)` helper + a `list-row.css` stylesheet, migrated onto by all four call sites.

## Component API

`static/ui-list-row.js`, mirroring the existing pattern in `static/ui-button.js` (applies variant styling to an already-built element, rather than creating one from scratch — appropriate here since each panel's row already has its own thumbnail/name/meta/action children before this stamps the shared container styling on):

```js
window.UI = window.UI || {};
window.UI.listRow = function listRow(el, { selected = false, subtle = false } = {}) {
  el.classList.add("list-row");
  el.classList.toggle("list-row--subtle", subtle);
  el.classList.toggle("selected", selected);
  return el;
};
```

Callers create the row element (`<li>`/`<div>`) and its children themselves, then call `UI.listRow(rowEl, { selected, subtle })` once, typically right before appending it to its list container. Re-calling it on re-render is safe (`classList.add`/`toggle` are idempotent).

## CSS

`static/css/components/list-row.css`:

- `.list-row` — the majority recipe: `padding: var(--space-2)`, `border-radius: 3px`, `margin-bottom: var(--space-1)`, `background: var(--bg-2)`, `border: 1px solid var(--border-soft)`, `cursor: pointer`. `:hover` sets `border-color: var(--border-hover-color)`. `.selected` sets `border-color: var(--accent)`.
- `.list-row--subtle` — `.font-list-row`'s existing look, kept as an explicit modifier rather than discarded: `background: transparent`, `border: 1px solid transparent` by default; `:hover` sets `background: var(--bg-2)` (declared after the base `.list-row:hover` rule so it wins at equal specificity, and does not also apply the base's border-color hover swap).

`.selected` is defined once on `.list-row` and works for any caller that passes `selected: true`; callers with no selection concept (`.layers-list-row`) simply never pass it — no new behavior is added there, just an unused capability on the shared class.

## Migration

| Old selector | File | New call site | Notes |
|---|---|---|---|
| `.project-list-row` | `ui-project-list-row.js` | `UI.listRow(row, { selected })` | keeps its existing `.selected` usage |
| `.layers-list-row` | `panel-layers.js` | `UI.listRow(row)` | never passes `selected` — no selection concept in this panel |
| `#clip-list li` (clip rows only) | `panel-media.js` | `UI.listRow(row, { selected })` | keeps its existing `.selected` usage |
| `.font-list-row` | `caption-panel-words.js` and any other font drill-down row builder | `UI.listRow(row, { subtle: true })` | preserves the background-swap hover look |

`.clip-section-label`'s `<li>` (the "VIDEOS"/"IMAGES" group header, `panel-media.js`) is never passed to `UI.listRow()` — it only gets `text-label` via `UI.text()`. Since `#clip-list li`'s card styling no longer exists as a raw structural selector (only `.list-row` carries it now), the label naturally has no background/border/hover/cursor — no `:not()` exclusion needed.

## CSS cleanup

Delete the old per-file row rules once each call site migrates: `project-list-row.css`'s `.project-list-row` (card rule only — keep `.project-list-row-name`/`-meta` if anything text-specific remains after the text-styling migration), `layers-panel.css`'s `.layers-list-row` (card rule only), `style-panel.css`'s `#clip-list li` rule entirely (replaced by `.list-row`, including retiring any `:not()` patch), `sub-panel.css`'s `.font-list-row` (card rule only).

## Non-goals

- No change to each panel's row *content* markup (thumbnail, name, meta, action buttons) — only the shared container styling (background/border/hover/selected) is unified.
- No new `.selected` behavior added to LAYERS — the capability is exposed on the shared component, but nothing calls it there.
- Border-radius token consolidation (`3px` vs `4px` vs `6px` elsewhere in the codebase) is out of scope — this component only touches the specific `3px` row recipe already shared by these four selectors.

## Verification

Pure CSS/JS refactor, no automated visual-regression tooling in this repo. Verify by running the dev server and checking: FILES panel (clip rows still show background/border/hover/selected, VIDEOS/IMAGES labels show none of that), PROJECTS panel + cold-start project picker (project rows unchanged), LAYERS panel (rows unchanged, still draggable), and the font-family/font-weight drill-downs opened from TEXT or CAPTIONS panels (`.font-list-row`'s background-swap hover still looks the same as before).
