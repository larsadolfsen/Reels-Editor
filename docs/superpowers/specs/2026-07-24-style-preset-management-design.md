# Style preset management: delete, overwrite, themed save flow — design

Date: 2026-07-24
Status: approved

## Goal

Three gaps in the saved-style preset library (TEXT and CAPTIONS panels' Style tabs):

1. A saved style cannot be deleted.
2. A saved style cannot be updated — saving always creates a new preset.
3. Naming a new style uses the native browser `prompt()`, which is unthemed and ugly.

## What exists / is reused

- `app/store.py`'s `save_preset` already upserts by id — overwriting an existing preset
  is a plain `POST /api/presets` with the existing id. No backend change needed for overwrite.
- `UI.stylePresetCard` (`static/ui-style-preset-card.js`) renders each saved style; it gains
  an optional delete action rather than a new card component being built.
- The hover-revealed icon-button pattern from `panel-media.js`'s `.clip-actions`
  (opacity-0 until row hover) is reused for the card's trash icon.
- Existing white/bordered text-field styling and `.panel-button` classes style the inline
  save form — no new visual language.
- `DELETE /api/projects/{pid}`'s idempotent-204 convention is mirrored by the new preset
  delete route.
- Both Style tabs (`text-panel-style.js`, `caption-panel-style.js`) are near-identical
  mirrors and get identical behavior.

## Data model

Unchanged. `TextPreset` already carries a stable `id`, `name`, `usage_count`; the global
library lives in `<data>/presets.json`. Overwrite keeps `id`/`name`/`usage_count` and
replaces only the style fields (`styleFieldsOf`). Delete removes the entry by `id`.

## Design

### 1. Delete a saved style

- **Backend:** `store.delete_preset(preset_id, data_dir)` (filter by id, rewrite
  `presets.json`); `DELETE /api/presets/{preset_id}` in `app/main.py` returning 204,
  idempotent (deleting an unknown id is still 204, matching project delete).
- **API client:** `static/api-delete-preset.js` — `Api.deletePreset(presetId)`.
- **UI:** `UI.stylePresetCard(preset, {onClick, onDelete})` — when `onDelete` is given,
  a hover-revealed trash icon button (Lucide trash path, `.clip-actions`-style reveal)
  renders in the card's corner. Click stops propagation (doesn't apply the style),
  calls `onDelete(preset)`. No confirmation. Both panels wire it to
  `Api.deletePreset` + `loadSavedPresets()` + re-render.

### 2 + 3. Save / overwrite flow (replaces `prompt()`)

Clicking **"+ Save current style"** switches the Style tab into **save mode**, rendered
in-panel, fully themed — no native popup:

- A name text input (autofocused, placeholder "Style name") with **Save** and **Cancel**
  buttons. Enter commits, Escape cancels. Save with a non-empty name creates a *new*
  preset (current behavior minus the `prompt()`); empty name does nothing.
- Below the form, a hint line ("…or click a style to overwrite it") and the same preset
  cards — but in save mode clicking a card **overwrites that preset's style fields** with
  the current block/track style (id/name/usage_count kept) via `Api.savePreset`, then
  exits save mode.
- Cancel (or a successful save/overwrite) returns the tab to normal mode where clicking
  a card applies it.
- The trash icon stays functional in both modes.

**Component:** `static/ui-style-save-form.js` — `UI.styleSaveForm(container, {onSave(name),
onCancel})` renders the input + Save/Cancel row (own CSS file
`static/css/components/style-save-form.css`, built on tokens). The mode switch and
"cards become overwrite targets" logic live in each panel's `renderStyle()` (a module-local
`saveMode` flag), since that's panel state, not component state.

## Error handling

- Failed `Api.deletePreset`/`Api.savePreset` fetches follow the existing pattern in these
  files (await + reload list); a network failure surfaces as the list simply not changing.
  No new error UI.

## Testing

- Backend: `tests/test_store.py` — `delete_preset` removes by id, unknown id is a no-op;
  `tests/test_main.py` — `DELETE /api/presets/{id}` returns 204 and the preset is gone
  from a subsequent `GET /api/presets`; deleting an unknown id returns 204.
- Frontend save-mode/overwrite/delete wiring is thin DOM glue (stated exception): verified
  manually in the browser preview — save new via the inline form, overwrite an existing
  card, delete a card, and confirm no native popup appears.
