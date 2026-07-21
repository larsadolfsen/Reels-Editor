# Right Panel Tabs — Design

**Status:** brainstormed 2026-07-20, re-verified against current code and re-confirmed with user 2026-07-21 (panels had grown since the original brainstorm — VIDEO gained FILL/SPEED, VIDEO BOX panel didn't exist in the original mapping). Ready for a build session to write its implementation plan. No open questions.

## What / Why

Replace the right panel's stacked accordions with **four icon tabs at the top of the panel**: **Style** (Lucide paintbrush), **Design** (pencil), **Box** (vector-square), **Time** (timer). Tabs show the same content the accordions hold today — this is an IA/layout restyle, not new controls. Applies to every context panel, each showing only the tabs that fit it.

## Tab mapping (re-verified against current code 2026-07-21)

| Tab | TEXT panel | CAPTIONS panel | VIDEO panel | VIDEO BOX panel |
|---|---|---|---|---|
| Style | saved-style preset library (STYLES accordion) | same, caption preset | — | — |
| Design | font family/weight/size/B-I-U/color/outline (FONT accordion) | same **+ the HIGHLIGHT controls** (mode/color/max words) | **FILL mode + SPEED** (added since the original brainstorm; volume/mute joins here once the audio item lands) | — |
| Box | size mode/background/border/text-align/position (BOX accordion) | same | — | **size & position + TRIM** (new tab, panel wasn't in the original mapping) |
| Time | start/end (TIME accordion) | — (words carry their own times) | trim in/out + reorder | **start time** (new tab) |
| Closed-caption (Lucide captions icon) | — | **all caption words listed inline** — the current words *drill-down* content moves here as a permanent tab | — | — |

Duplicate/Delete action buttons (TEXT, VIDEO, VIDEO BOX) stay as a **persistent footer** below the tab bar/panes, visible regardless of active tab — unchanged from today's always-visible placement.

Panels with one logical content group (FILES, PROJECTS, SETTINGS, EXPORT, LAYERS) get no tab bar.

## Design

- New microcomponent `static/ui-tab-bar.js` — `UI.tabBar(container, tabs, activeValue, onSelect)` where `tabs = [{value, icon, label}]`: a horizontal row of square icon buttons (aria-label from `label`, `aria-selected` state), exactly one active. Own CSS file `static/css/components/tab-bar.css`. Visually distinct from `.btn-group` (full-width row, underline/active indicator per the tab idiom).
- Each panel's existing accordion body `<div>`s become tab panes: the `UI.accordionSection` headers are removed; the body markup and every `#`-id inside it stay unchanged, so all `text-panel-*.js` / `caption-panel-*.js` render functions keep working untouched (they populate ids, wherever those live). Tab switching toggles `hidden` on the panes — same mechanism the accordions used.
- Active tab is remembered per panel for the session (module state, not persisted); first tab is the default.
- The CAPTIONS words drill-down (`#panel-captions-words` sub-panel + its `UI.settingsRow` opener) is retired; `caption-panel-words.js`'s list rendering is reused as the Closed-caption tab's pane content. The caption word-timing item (`2026-07-20-caption-word-timing-design.md`) then lands its editable fields in this tab.
- The right-panel 8-column grid item (`2026-07-19-right-panel-grid-design.md` + plan) restyles the *contents*; this item restyles the *sectioning*. They compose, but whichever lands second must re-verify the other's spacing rules — noted in both build sessions' plan step.

## Data model

None.

## Reuse

- All existing `text-panel-*.js` / `caption-panel-*.js` renderers and their target ids, unchanged.
- `UI.buttonGroup`'s single-select pattern as the reference for `UI.tabBar`'s API shape.
- Lucide icons hand-inlined per convention: paintbrush, pencil, vector-square, timer, captions.

## Tasks

Batches, each merged to main and pushed before the next starts:

1. **Component:** `UI.tabBar` + `tab-bar.css` (new files, no consumers yet).
2. **TEXT panel:** replace its accordions with the tab bar + panes (`index.html` restructure, `panel-text.js`'s wiring); Duplicate/Delete become a persistent footer.
3. **CAPTIONS panel:** same, plus HIGHLIGHT controls into the Design pane and the words drill-down (`caption-panel-words.js`) becoming the permanent Closed-caption pane.
4. **VIDEO + VIDEO BOX panels together** (same tab shape, small diffs each): VIDEO gets Design (FILL + SPEED) and Time (trim + reorder) tabs, Duplicate/Delete as footer; VIDEO BOX gets Box (size & position + TRIM) and Time (start) tabs, Delete as footer.
5. **Cleanup:** remove dead accordion markup/CSS (`UI.accordionSection` call sites that no longer exist; keep the component itself — SETTINGS/EXPORT/LAYERS still use plain groups, no tab bar).

## Testing

UI-only wiring — untested layer stated per convention. Manual verification, on a throwaway project only (never real project data): every control reachable under its new tab on TEXT/CAPTIONS/VIDEO/VIDEO BOX; all controls still write to the same fields (spot-check one per tab against saved JSON); captions word list shows inline; tab state survives panel switches within a session; `pytest -q` stays green (no backend changes).

## Out of scope

- New controls of any kind.
- Persisting the active tab.
- Tabs on FILES/PROJECTS/SETTINGS/EXPORT/LAYERS.
