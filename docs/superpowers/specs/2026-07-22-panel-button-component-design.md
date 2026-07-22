# Panel button component

## Problem

Full-width action buttons scattered across the right-hand context panels (VIDEO,
TEXT, CAPTIONS, VIDEO BOX, AUDIO, PROJECTS) are styled inconsistently:

- Most (`Duplicate clip`, `Duplicate text`, `+ Save current style`,
  `Auto-caption`, `Replace music`, `Remove music`) are raw `<button class="col-8">`
  elements relying only on the generic `base.css` element reset — 23px tall,
  no distinct visual treatment.
- Delete actions (`Delete text`, `Delete clip`, `Delete video box`) hand-copy the
  same danger color/border override into three separate CSS files
  (`style-panel.css`, `video-box-panel.css`).
- "Add a new thing" actions (`+ NEW PROJECT`, `+ IMPORT MEDIA`,
  `+ ADD VIDEO BOX`, `+ ADD MUSIC`, `+ Add text`) either reuse the one-off
  `.new-project-btn` class or have no shared styling at all, despite being the
  same kind of action everywhere.

Measured directly: `.new-project-btn` renders at 33px tall — the reference
height for this component — distinct from the existing `.button` component
(42px, used for `Export`/theme-toggle/accent-outline-icon toolbar buttons,
wired via `UI.button()`) which is a different kind of control and stays as-is.

## Solution

One new CSS component, `.panel-button`, covering three variants, applied via
plain HTML classes (no JS wrapper — these are static buttons already in the
markup, same pattern as today's `.new-project-btn`/`.icon-btn`):

- `.panel-button` (base) — full width, 33px tall, flex-centered content, 1px
  solid border, `--text-muted` text. The "plain action" look.
- `.panel-button.panel-button-danger` — `--danger` border/text color. For every
  Delete action.
- `.panel-button.panel-button-dashed` — dashed border, `--text-secondary`
  color, icon+label flex layout. For every "add a new thing" action.

Hover behavior preserves current visual behavior at each callsite:
- Plain buttons fall through to the existing global `button:hover` rule
  (`base.css`) — no change needed.
- Danger buttons stay red on hover (a class selector already outranks the
  type+pseudo `button:hover` selector on the properties it sets — matches
  today's `#video-delete:hover`/`#text-delete:hover` behavior, which relies on
  the same specificity fact).
- Dashed buttons need an explicit `.panel-button-dashed:hover` rule (brighter
  border + text color) to preserve today's `.new-project-btn:hover` behavior,
  since the class's own color declaration would otherwise always win.

### Rollout (variant per existing button)

| Button (current id) | Variant |
|---|---|
| `#text-style-save`, `#caption-style-save` (+ Save current style) | plain |
| `#text-duplicate` (Duplicate text) | plain |
| `#video-duplicate` (Duplicate clip) | plain |
| `#caption-auto-btn` (Auto-caption) | plain |
| `#audio-replace` (Replace music) | plain |
| `#audio-remove` (Remove music) | plain |
| `#text-delete` (Delete text) | danger |
| `#video-delete` (Delete clip) | danger |
| `#video-box-delete` (Delete video box) | danger |
| `#project-create` (+ NEW PROJECT, both the in-panel button in `index.html` and the JS-built one in `ui-project-picker.js`) | dashed |
| `#add-clip` (+ IMPORT MEDIA) | dashed |
| `#video-box-add` (+ ADD VIDEO BOX) | dashed |
| `#audio-add-music` (+ ADD MUSIC) | dashed |
| `#text-add-block-btn` (+ Add text) | dashed |

### Files

- New: `static/css/components/panel-button.css` — the three-variant component,
  standard header comment stating purpose/variants/dependents (`tokens.css`).
- Edit: `static/index.html` — swap each button's class per the table above
  (keeps existing `col-8`/id attributes; `panel-button` sets its own
  `width: 100%` so it doesn't depend on the `col-8` grid utility being
  present, matching how `.new-project-btn` already works standalone in the
  full-screen picker).
- Edit: `static/ui-project-picker.js` — its JS-built button's `className`
  changes from `"new-project-btn"` to `"panel-button panel-button-dashed"`.
- Edit (delete dead CSS): `static/css/components/style-panel.css` (remove the
  `#video-delete, #text-delete` danger block), `static/css/components/video-box-panel.css`
  (remove the `#video-box-delete` danger block), `static/css/components/project-picker.css`
  (remove `.new-project-btn`/`.new-project-btn:hover`, update its header
  comment which currently references that class).
- Add the new stylesheet's `<link>` in `index.html`'s `<head>`, alongside
  `button.css`.

## Out of scope

- `.button` / `UI.button()` (accent/outline/icon variants, 42px) is a
  different kind of control — used for `Export` and the theme-toggle icon
  button — and is untouched by this change.
- No behavior change to any button's click handler, only its CSS class and,
  for `ui-project-picker.js`, the literal class name string.

## Testing

This is a pure CSS/markup styling change — no new logic to unit-test. Verify
manually in the browser after implementation: each variant renders at 33px
with the correct color/border, and every listed button (across VIDEO, TEXT,
CAPTIONS, VIDEO BOX, AUDIO, PROJECTS panels, plus the full-screen project
picker) still functions (click handlers unaffected, since only `class` values
change).
