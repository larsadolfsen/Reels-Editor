# Right Panel Tabs — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No open questions.

## What / Why

Replace the right panel's stacked accordions with **four icon tabs at the top of the panel**: **Style** (Lucide paintbrush), **Design** (pencil), **Box** (vector-square), **Time** (timer). Tabs show the same content the accordions hold today — this is an IA/layout restyle, not new controls. Applies to every context panel, each showing only the tabs that fit it.

## Tab mapping (user-confirmed)

| Tab | TEXT panel | CAPTIONS panel | VIDEO panel |
|---|---|---|---|
| Style | saved-style preset library (STYLES accordion) | same, caption preset | — |
| Design | font family/weight/size/B-I-U/color/outline (FONT accordion) | same **+ the HIGHLIGHT controls** (mode/color/max words) | volume/mute (once the audio item lands) |
| Box | size mode/background/border/text-align/position (BOX accordion) | same | — |
| Time | start/end (TIME accordion) | — (words carry their own times) | trim in/out + reorder |
| Closed-caption (Lucide captions icon) | — | **all caption words listed inline** — the current words *drill-down* content moves here as a permanent tab | — |

Panels with one logical content group (FILES, PROJECTS, SETTINGS, EXPORT) get no tab bar.

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

1. `UI.tabBar` component + `tab-bar.css` (new files, no consumers yet).
2. TEXT panel: replace its accordions with the tab bar + panes (`index.html` restructure, `editor.js`'s `renderTextPanel` wiring).
3. CAPTIONS panel: same, plus HIGHLIGHT controls into the Design pane and the words drill-down becoming the Closed-caption pane.
4. VIDEO panel: tab bar with Time (trim/reorder); Design added later by the audio item.
5. Remove dead accordion markup/CSS (`UI.accordionSection` call sites that no longer exist; keep the component itself — SETTINGS/EXPORT may still use plain groups).

## Testing

UI-only wiring — untested layer stated per convention. Manual verification: every control reachable under its new tab on TEXT/CAPTIONS/VIDEO; all controls still write to the same fields (spot-check one per tab against saved JSON); captions word list shows inline; tab state survives panel switches within a session; `pytest -q` stays green (no backend changes).

## Out of scope

- New controls of any kind.
- Persisting the active tab.
- Tabs on FILES/PROJECTS/SETTINGS/EXPORT.
