# Left panel becomes a Media/Text/Captions nav rail

Date: 2026-07-17

## Problem

The left `#panel` is a permanent, single-purpose MEDIA clip library. The
right `#style-panel` is purely selection-driven — it only opens when a clip
is clicked on the timeline (VIDEO) or (today) never for TEXT/CAPTIONS
directly. There is no way to reach the TEXT or CAPTIONS editing surfaces
without first placing a text block or caption on the timeline and clicking
it. We want a persistent left-hand nav — MEDIA / TEXT / CAPTIONS — that
drives what's shown in the right panel, decoupled from timeline selection.

## Left panel: fixed nav rail

`#panel` stops rendering the clip list. It becomes a permanent ~72px-wide
rail with three stacked icon+label buttons: MEDIA, TEXT, CAPTIONS (same
icon-over-label visual treatment as today's collapsed panel state). The rail
does not itself collapse or resize — it is always this width. Clicking a
button opens the matching section in the right panel; exactly one of the
three is active at a time.

The clip list markup (thumbnail rows, click-to-select, `renderMediaList()`)
and the IMPORT VIDEO button move from `#panel` into a new `#panel-media`
section in `#style-panel`, unchanged in behavior — row click still just
toggles `selectedMediaId` for highlighting, with zero effect on the player/
timeline/VIDEO panel (per the existing decoupling from
`2026-07-15-media-library-design.md`).

## Right panel: four mutually-exclusive sections

`#style-panel` keeps its existing `showPanel(type)` / `closePanel()` /
`selected` mechanism (`static/editor.js`), extended with two new `type`
values:

- `'media'` → `#panel-media` (new, moved from `#panel`)
- `'text'` → `#panel-text` (unchanged)
- `'captions'` → `#panel-captions` (unchanged)
- `'clip'` → `#panel-video` (**unchanged** — still only opened by clicking a
  clip on the timeline; trim in/out today, room for more clip-level options
  later)

The three left-rail buttons call `showPanel('media' | 'text' | 'captions')`.
`#panel-video` remains reachable only via timeline clip selection — it is
not wired to any left-rail button and rail clicks never trigger it. Opening
any section closes whichever was previously open, exactly as today's single-
visible-section behavior.

## Default state on load

`#style-panel` starts **open** with `'media'` active (`showPanel('media')`
runs on init), instead of starting `hidden`. `#panel-video` is unaffected —
still closed until a timeline clip is clicked.

## Right panel collapse (replaces close button)

`#style-panel-close` (×) is replaced by a collapse-toggle button using the
same icon as the left panel's current collapse control. Clicking it does not
hide the panel — it shrinks `#style-panel` to a ~72px icon-rail. What that
rail shows depends on which section is active:

- **Media active**: the rail is today's `#panel.collapsed` clip-thumbnail
  rail verbatim — import icon + clip thumbnails only, click-to-select,
  exactly the current collapsed-MEDIA-panel behavior, just relocated to the
  right panel.
- **Text or Captions active**: the rail has no section-specific content yet
  (empty beyond a re-expand affordance), reserved for future quick-action
  icons.

The previously active section (`selected.type`) is remembered underneath;
expanding the rail back out restores that section rather than resetting to
Media.

## Shared component: `UI.iconRail`

Both rails in this design — the left MEDIA/TEXT/CAPTIONS nav and the right
panel's collapsed state — share the same interactive pattern (icon+label
buttons in a narrow column, optionally an expand/collapse toggle). Per
project convention, reused interactive UI is built as a `window.UI.*`
component in `static/ui-components.js`, not just shared CSS classes.

Add `UI.iconRail(container, {items, activeValue, onSelect})`:

- `items`: `[{value, icon (SVG markup string), label}]`
- Renders one button per item (icon above label), toggles an active/pressed
  state via `aria-pressed`, exactly like `UI.buttonGroup`'s single-select
  behavior but laid out vertically and sized for the 72px rail.
- Returns `{setActive(value)}` for external state sync (mirrors
  `UI.buttonGroup`'s return shape).

Call sites:

- Left `#panel`: `UI.iconRail(panelEl, {items: [MEDIA, TEXT, CAPTIONS], ...})`,
  `onSelect` calls `showPanel(value)`.
- Right `#style-panel`'s collapsed state, when Text or Captions is active: a
  `UI.iconRail` instance with a single re-expand item (icon only).
- Right `#style-panel`'s collapsed state, when Media is active: **not**
  `UI.iconRail` — this reuses the existing `#panel-media` clip-thumbnail
  markup/CSS (`.collapsed` treatment from `panel.css`) directly, since that
  rail's content (thumbnails, click-to-select) is data-driven and specific
  to the media list, not a generic icon+label button set. `UI.iconRail`
  covers the two generic nav rails (left panel, and the right panel's
  Text/Captions collapse state); the collapsed Media rail is the clip list
  itself rendered narrow.

A shared CSS component (`.icon-rail` and friends) backs the JS component's
markup, but the JS component is the reusable unit call sites depend on —
not the CSS class alone.

## Non-goals

- No new content inside the right-panel's collapsed rail beyond the
  re-expand control — "quick action icons" are explicitly deferred.
- No changes to `#panel-video`'s contents (trim/order) or to how timeline
  clip selection works.
- No changes to CAPTIONS panel content — it remains the existing
  "COMING IN A LATER TASK" placeholder, just now also reachable via the
  left rail.
- No persistence of collapsed/expanded state across page reloads (matches
  today's `panelCollapsed`/`safeZonesVisible` localStorage pattern only if
  asked for later — not included here).

## Testing

- This is UI wiring/layout with no new pure logic in `app/*.py` — no new
  backend tests.
- `UI.iconRail` is presentational/interactive DOM wiring like the existing
  `UI.buttonGroup`/`UI.accordion`, which have no dedicated test coverage
  today; same treatment here — verify manually.
- Manual verification in the browser: left rail shows MEDIA/TEXT/CAPTIONS,
  clicking each opens the matching right-panel section and closes the
  previous one; Media section still behaves like today's MEDIA panel
  (import, row click/highlight, zero effect on player); clicking a timeline
  clip still opens VIDEO (trim) independent of the rail's active tab;
  right-panel collapse button shrinks it to a rail and back, preserving the
  active section; on fresh load, Media is open by default; collapsing while
  Media is active shows clip thumbnails (click still selects a clip);
  collapsing while Text or Captions is active shows the generic empty rail.
