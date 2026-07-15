# Server-side text presets

Date: 2026-07-15

## Problem

`TextPreset` (font, size, color, position, etc.) currently lives only in the
browser's `localStorage`, keyed by project id, while `TextBlockLayer.preset_id`
is persisted server-side as part of the project JSON. The two can drift apart
(different browser, cleared storage, etc.), which silently breaks caption
rendering — this happened in practice: a `preset_id` pointed at a preset that
no longer matched the client's in-memory `textPreset.id`, so `Preview.renderText`
skipped the block entirely.

This also means a project's text styling isn't durably saved: clearing
localStorage or opening the project on another machine loses all style
choices even though the heading text itself is safely in the project JSON.

## Data model

Add one field to `TextPreset` (`app/models.py`):

```python
class TextPreset(BaseModel):
    ...
    project_id: str | None = None   # None = shared/library preset (unused today); set = privately owned by that project
```

No other model changes. `app/store.py`'s `save_preset`/`load_presets` already
upsert-by-id against `data/presets.json` and are already covered by
`tests/test_store.py` — no changes needed there.

This field is forward-looking: it doesn't enable any sharing/picker UI now
(none exists), but it lets a future preset-picker feature distinguish shared
library presets (`project_id is None`) from a project's private working copy,
without a data migration.

## API (app/main.py)

Three new thin routes, calling straight into `store.py`:

- `GET /api/presets/{id}` → the preset, or 404 if it doesn't exist
- `POST /api/presets` → body: preset fields minus `id`; server assigns an id via `TextPreset`'s default factory, saves, returns it
- `PUT /api/presets/{id}` → body: full `TextPreset`; upserts via `store.save_preset`, returns it

## Client flow (static/editor.js)

Replace the `localStorage`-based `defaultTextPreset`/`loadTextPreset`/`saveTextPreset`
trio with a server-backed bootstrap, run once during the existing `(async () => {...})()`
init block, before `renderTextPanel()`:

1. If `project.text_blocks[0]` exists:
   - `GET /api/presets/{block.preset_id}`.
   - If the response is owned by this project (`preset.project_id === project.id`), use it directly as `textPreset`.
   - Otherwise (404, or owned by someone/nothing else): clone its field values (or fall back to `defaultTextPreset()`'s values if the GET 404'd), `POST /api/presets` with `project_id: project.id`, set `block.preset_id` to the new preset's id, and `PUT` the project to persist that.
2. If there's no text block yet: `POST /api/presets` with default values + `project_id: project.id`, then create the block referencing the new preset's id (as `ensureTextBlock` does today, minus the preset_id resync workaround — see below).
3. After bootstrap, the project always owns its preset. Every subsequent field edit (`saveTextPreset()`) becomes `PUT /api/presets/{id}` with the current in-memory `textPreset` — no per-edit fork check needed, since ownership was already established in step 1/2.
4. Remove the `localStorage.getItem/setItem("textPreset:" + project.id)` calls entirely.
5. Remove the `preset_id` resync hack added to `ensureTextBlock` (2026-07-15, the "Hej not rendering" fix) — it's a client-side workaround for exactly the drift this design eliminates at the source.

## Testing

- New `tests/test_main.py` using FastAPI's `TestClient`: covers `POST` → `GET` → `PUT` round-trip on `/api/presets`, and a 404 on an unknown id. First test file for `main.py`; kept to route-level assertions only, consistent with `main.py` staying pure wiring.
- `editor.js`'s bootstrap/fork logic has no JS test harness in this repo (consistent with the rest of `editor.js`) — verified manually in-browser instead: fresh project gets a preset created; editing a field persists across a reload; a stale/missing `preset_id` self-heals into a freshly owned preset without losing the project's heading text.

## Known limitation (explicitly out of scope)

Orphaned presets (created when a project's `preset_id` is replaced) are never
garbage-collected. Not a problem at today's scale — no sharing, no picker,
one preset per project in practice — so left as a stated decision rather
than a silent gap. Cleanup would be its own follow-up task if/when the
preset-picker feature (and real sharing) is built.
