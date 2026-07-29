# Settings rows: "None" state + Background/Border/Highlight subpages

Date: 2026-07-29

## Problem

Two related gaps in the TEXT and CAPTIONS style panels.

A settings row whose effect is switched off reads `OFF` (Shadow, Highlight) or `0px`
(Outline). Neither says what the user means: the effect is *absent*. The row should read
`None`.

Separately, the settings-row + drill-down subpage pattern — already used for Font Family,
Weight, Color, Outline, Shadow, Highlight (TEXT) and Language (CAPTIONS) — is not applied
to three groups that fit it: Background and Border in both Box tabs, and the CAPTIONS
Highlight group in the Design tab. Those groups sit inline, each spending several rows of
panel height on settings that are usually left alone.

Controls deliberately left inline: SIZE mode, WIDTH/HEIGHT, Bold/Italic/Underline, Case,
Text Align, Position. Each is a single-tap control; a drill-down would add taps, not save
them.

## Scope

Frontend only. No Pydantic model change, no export-path change, no new route. The saved
style preset round-trip is untouched — every field these rows write already exists on
`TextPreset` and is already carried by `styleFieldsOf()`.

## Design

### 1. `None` as a shared value

New file `static/settings-row-value.js`:

```js
window.SettingsRowValue = {
  orNone(isOn, text) { return isOn ? text : "None"; },
};
```

Loaded before the panel files that consume it. Every row below routes its value through
it, so the `"None"` string is defined once instead of appearing as a literal in six files.

Row values become:

| Row | Off | On |
| --- | --- | --- |
| Outline (TEXT + CAPTIONS) | `None` when `outline_px === 0` | swatch(`outline_color`) + `${outline_px}px` |
| Shadow (TEXT + CAPTIONS) | `None` when `!shadow` | swatch(`shadow_color`) + `X: ${shadow_offset_x}px  Y: ${shadow_offset_y}px  Blur: ${shadow_blur}px` |
| Highlight (TEXT) | `None` when `!highlight` | swatch(`highlight_color`) + `highlight_color` hex |
| Background (TEXT + CAPTIONS, new) | `None` when `!box_background` | swatch(`box_background_color`) + `${box_background_opacity}%` |
| Border (TEXT + CAPTIONS, new) | `None` when `box_border_width === 0` | swatch(`box_border_color`) + `${box_border_width}px` |
| Highlight (CAPTIONS, new) | never off | swatch(`highlight_color`) + mode label |

The swatch is omitted (passed as `null`) in every off state, matching what
`text-panel-shadow.js` already does today.

The Shadow row's on-value was widened mid-implementation at the project owner's request —
it originally showed the blur alone. At extreme values the full string exceeds the row's
value slot and ellipsis-clips; the owner was shown this and chose to keep the format.

### 2. New subpages

Each new file copies the shape of `static/text-panel-shadow.js`: a module-scoped
`rowSetValue`, an `openXPanel`/`closeXPanel` pair toggling `#panel-text-main` against the
subpanel, a `UI.subPanelHeader`, and a single exported `render` function that both refreshes
the row and populates the subpanel.

- `static/text-panel-background.js` → `TextPanel.renderBackground()`, subpanel
  `#panel-text-background`
- `static/caption-panel-background.js` → `CaptionPanel.renderBackground()`, subpanel
  `#panel-captions-background`

  Subpanel contents: an ON/OFF `UI.buttonGroup` writing `preset.box_background`, then the
  existing colour swatch and OPACITY number field, both hidden while off.

- `static/text-panel-border.js` → `TextPanel.renderBorder()`, subpanel `#panel-text-border`
- `static/caption-panel-border.js` → `CaptionPanel.renderBorder()`, subpanel
  `#panel-captions-border`

  Subpanel contents: an ON/OFF `UI.buttonGroup` writing `preset.box_border_width` — `off`
  sets it to `0`, `on` sets it to `2` when it is currently `0` and otherwise leaves the
  existing width alone — then the existing BORDER px, RADIUS and colour fields, hidden while
  off. `box_border_width === 0` is the single source of truth for "no border"; there is no
  separate boolean, so nothing new has to be persisted or migrated.

- `static/caption-panel-highlight.js` is converted in place rather than added: the mode
  button group, colour swatch and border-radius field move out of `#caption-highlight-body`
  into a new `#panel-captions-highlight` subpanel, fronted by a `Highlight` row. The radius
  field keeps its existing rule of showing only when `highlight_mode === "background"`.

### 3. Markup changes in `static/index.html`

TEXT Box tab (`#text-box-body`) — the background `style-group`, the `BORDER`
`style-group-label` + its `style-group`, and the `#text-box-background-border-divider`
between them are replaced by two rows:

```
SIZE (mode + WIDTH/HEIGHT)
#text-box-width-height-divider
#text-box-background-row
#text-box-border-row
#text-box-border-position-divider
TEXT ALIGN
POSITION
```

CAPTIONS Box tab (`#caption-box-body`) takes the identical change with `caption-` ids.

CAPTIONS Design tab — `#caption-highlight-body` is removed and a `#caption-highlight-row`
is added inside the font body after `#caption-shadow-row`, so the Design tab reads as one
list: Font Family, Weight, size/italic/underline, Case, Color, Outline, Shadow, Highlight.
The `MODE` group label moves into the new subpanel.

Four new subpanel `<div>`s (`#panel-text-background`, `#panel-text-border`,
`#panel-captions-background`, `#panel-captions-border`) plus `#panel-captions-highlight`
are added as siblings of the existing `#panel-text-shadow` / `#panel-captions-shadow`
subpanels, each with a header div and the field ids listed above. Five new `<script>` tags
load the new files.

### 4. Orchestrator wiring

- `panel-text.js`'s `renderBoxPanel()` drops its background and border field wiring and
  instead calls `TextPanel.renderBackground()` and `TextPanel.renderBorder()`. Its
  `UI.divider` call for `text-box-background-border-divider` is removed.
- `panel-captions.js`'s `renderCaptionPanel()` calls `CaptionPanel.renderBackground()` and
  `CaptionPanel.renderBorder()`, and its `captionTabPanes.design` entry drops the removed
  `#caption-highlight-body`.

Neither orchestrator's "reset to main view" list is extended. `renderTextPanel()` resets
only `#panel-text-font` / `#panel-text-weight`, and `renderCaptionPanel()` only the font,
weight and language subpanels — the Outline, Shadow and Highlight subpanels added earlier
were deliberately left out, and the new ones follow that same precedent. Changing which
subpanels reset is a separate concern from this change.
- `caption-panel-box.js` drops its background and border field wiring for the same reason.

## Data model

Unchanged. Every field involved already exists on `TextPreset` in `app/models.py`:
`box_background`, `box_background_color`, `box_background_opacity`, `box_border_width`,
`box_border_radius`, `box_border_color`, `outline_px`, `outline_color`, `shadow`,
`shadow_color`, `shadow_blur`, `highlight`, `highlight_color`, `highlight_mode`,
`highlight_border_radius`. No new entity, no new relationship, no migration.

## Testing

Nothing in this change is reachable from the Python test suite: no model, route, export or
render-path code is touched. `.venv/Scripts/python -m pytest -q` must still pass, but it
proves nothing about this work.

The only pure logic introduced is `SettingsRowValue.orNone`, three lines with no branching
beyond the ternary. This repository has no JavaScript test runner, and introducing one is
out of scope for this change.

**Stated verification gap.** This layer is verified live in the browser against a throwaway
project, never real project data (the app's unload keepalive-save writes in-memory state to
disk). The check, per panel:

1. Open the TEXT panel with a text block selected, then the CAPTIONS panel.
2. For each of Outline, Shadow, Highlight, Background, Border: confirm the row reads `None`
   with no swatch when off.
3. Toggle each on from its subpage; confirm the row shows the swatch and the expected value
   (`2px`, `4px`, `80%`, colour hex, mode label) and that the stage render changes to match.
4. Toggle back off; confirm the row returns to `None` and the stage effect disappears.
5. Reload the page and confirm every state persisted.

## Out of scope

- Any change to which fields the saved style presets carry.
- Converting SIZE, WIDTH/HEIGHT, B/I/U, Case, Text Align or Position to subpages.
- Adding a `box_border` boolean to `TextPreset`.
