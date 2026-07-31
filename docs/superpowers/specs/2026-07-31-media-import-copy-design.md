# Copy media into the project on import

Date: 2026-07-31

## Problem

Imported media is referenced by its original absolute path (`MediaItem.file_path`) forever. If that file becomes unreachable later — moved, renamed, or (as observed) a Dropbox-synced file going "online-only" and briefly disappearing from local disk — every clip referencing it 404s from `/media?path=...` and playback breaks with no clear cause, even though the user never touched anything.

## Goal

When media is imported (via the native file picker, for both the VIDEO/IMAGE bulk import and the AUDIO music import), copy the file into the project's own local data directory instead of only remembering its original location. Playback and export then depend only on a file this app fully owns, never on wherever the source happened to live.

Explicitly out of scope, per your answer: migrating or re-importing media already referenced by existing projects — if a project is already broken, that's unaffected by this change.

## Data model

`MediaItem` gains one field:

```python
class MediaItem(BaseModel):
    ...
    source_path: str = ""   # the original path this file was imported from; dedup-only, never read for playback
```

- `file_path` keeps its existing meaning and existing consumers (playback, export, thumbnails, filmstrip, peaks) — for newly-imported media, it now points at the copy under `data/media/`, not the original location.
- `source_path` exists solely so re-picking the same external file is still recognized as "already imported" (today's dedup check compares against `file_path`, which will no longer equal the picked path). Defaults to `""`, so existing saved projects are unaffected and don't need migration.

## Backend

**`app/media.py`** — new helper:

```python
def copy_into_media_dir(source_path: str, media_id: str, data_dir: Path) -> Path:
    """Copies source_path into <data_dir>/media/<media_id><ext>, preserving the original
    extension (lowercased). Raises FileNotFoundError if the source can't be read — surfacing
    an import-time failure instead of a silent later playback failure."""
```

**`app/main.py`** — new route:

```
POST /api/projects/{id}/import-media
Body: {"paths": ["C:/...", ...]}
```

For each path, in order:
1. Skip if any existing `MediaItem.source_path` already equals this path, **or** (added in final-review fix, since a project saved before this feature shipped has `source_path == ""` and `file_path` pointing straight at the original external path) if any existing `MediaItem` has no `source_path` and its `file_path` equals this path — otherwise re-picking a legacy-imported file would create a duplicate `MediaItem` and a redundant copy on disk.
2. Otherwise: generate a new id, copy the file via `copy_into_media_dir`, probe it (`probe_duration`/`has_audio_stream`, skipped for images exactly as `/api/probe` does today), determine `kind` (see below), and build the `MediaItem` (`file_path` = the copy's path, `source_path` = the original path, **`name` = the original path's basename** — `MediaItem.display_name` falls back to `file_path`'s basename when `name` is empty, and `file_path` is no longer the meaningful original filename, so `name` must be set explicitly or the FILES panel would start showing opaque `{id}.ext` names instead of the user's real filenames).

**`kind` needs an explicit override for audio.** Auto-detection (`is_image_path`) only distinguishes image vs. video — there's no way to detect "this is music" from the file alone the way the old client-side `importMusicFile()` used to just hardcode `kind: "audio"` (its picker was already restricted to audio extensions, so it always knew). The request body accepts an optional `"kind"` field; when present it overrides auto-detection entirely (still probes normally for duration/has_audio). The AUDIO panel's caller passes `"kind": "audio"`; the VIDEO/IMAGE bulk importer omits it and gets auto-detection as before. (Found during manual verification — omitting this would have silently mislabeled every imported music file as `kind: "video"` in the media library.) `kind`, when provided, is validated against `("video", "image", "audio")` — anything else raises `HTTPException(400, detail=f"invalid kind: {forced_kind}")` (final-review fix; previously any string was trusted and written straight into `MediaItem.kind`).

Saves the project once after processing all paths. Returns:

```json
{"project": { ...updated Project... }, "imported": [ { ...new MediaItem... }, ... ]}
```

`imported` holds only the newly-added items (skipping any deduped), in the same order as the input `paths` — the AUDIO caller needs the specific new id, not just the updated project.

A source file that can't be read fails the whole request with `HTTPException(400, detail=f"Could not read source file: {path}")` (final-review fix — `copy_into_media_dir`'s `FileNotFoundError` used to propagate unhandled into a generic 500 with no `detail`; now it matches this app's existing error-surfacing convention, e.g. the transcribe route's `503`/`detail` pattern, and gives the frontend a real message to show).

**`/api/probe` stays as-is.** After this change nothing in the frontend calls it anymore, but it's a general-purpose read-only probe utility, not something this feature owns — removing it is a separate decision, not bundled into this change.

## Frontend

**New `static/api-import-media.js`:**

```js
Api.importMedia(projectId, paths, kind) -> Promise<{project, imported} | null>
```

`kind` is optional — passed through to the backend override described above.

POSTs to the new route; `null` on failure (mirrors this codebase's existing `Api.*` failure convention).

**`static/clip-sequence.js`'s `importMedia()`** — replaces the per-path loop (dedup check + `Api.probeMedia` + local `MediaItem` construction) with one call:

```js
async function importMedia() {
  const paths = await Api.pickFiles();
  if (!paths.length) return;
  const result = await Api.importMedia(project.id, paths);
  if (!result) {
    alert("Import failed — one of the selected files could not be read.");
    return;
  }
  project = result.project;
  await saveProject();
  MediaPanel.render();
}
```

**`saveProject()` must still run client-side after the server-returned project is assigned** (final-review fix). The server already persists the import, but `saveProject()` isn't just a persistence call — it's also what reseeds the undo baseline (`lastSavedJson`) and records the import as its own undo step (see `static/editor.js`). Skipping it left in-memory `project` ahead of `lastSavedJson`; an unrelated later Ctrl+Z would then revert to the pre-import snapshot and persist that reverted state, silently dropping the imported `MediaItem` (the copied file under `data/media/` becoming orphaned). A failed import (`result` falsy) now also shows a plain `alert()` — this replaces the pre-rewrite `alert("probe failed")` feedback that was lost when the client-side probe+construct path was removed.

**`static/panel-audio.js`'s `importMusicFile()`** — same shape, one path:

```js
async function importMusicFile() {
  const path = await Api.pickFile("audio");
  if (!path) return null;
  const result = await Api.importMedia(project.id, [path], "audio");
  if (!result) {
    alert("Import failed — the selected file could not be read.");
    return null;
  }
  project = result.project;
  await saveProject();
  // imported is empty when the file was already in the library (dedup) — fall back to the
  // existing entry so re-picking the same source file still returns a usable media id.
  const item = result.imported[0] || project.media_library.find((m) => m.source_path === path);
  return item ? item.id : null;
}
```

Same `saveProject()`/`alert()` reasoning as `importMedia()` above. `addMusic()`/`replaceMusic()` are unchanged below this point — they still set `project.music` themselves and call their own `saveProject()`, since that's a separate mutation this route doesn't know about (so a single import-then-add-music flow now records two small undo steps rather than one — acceptable, matches how insert-then-edit flows elsewhere in this app already behave).

## Files

- Modify: `app/models.py` (`MediaItem.source_path`)
- Modify: `app/media.py` (`copy_into_media_dir`)
- Modify: `app/main.py` (`POST /api/projects/{id}/import-media`)
- New: `static/api-import-media.js`
- Modify: `static/clip-sequence.js` (`importMedia()`)
- Modify: `static/panel-audio.js` (`importMusicFile()`)

## Testing

- `tests/test_media.py`: `copy_into_media_dir` — copies to the right path with the right (lowercased) extension, raises on a missing source, doesn't clobber an existing file at the same id (shouldn't happen given fresh ids, but the copy call itself is deterministic given real inputs).
- `tests/test_main.py`: the new route — imports a fresh path (copies, probes, returns it in `imported`), dedups a path whose `source_path` already exists in `media_library`, dedups a legacy item (no `source_path`, `file_path` == the picked path), skips probing for an image path, raises `HTTPException(400, detail=...)` for an unreadable source path, rejects an invalid `kind` override with `HTTPException(400, ...)`, returns items in input order, saves the project exactly once.
- Frontend: both changed files are thin API/DOM wiring (per this project's convention, no unit tests for that layer) — verified live in the browser: import a video, confirm a new file appears under `data/media/`, confirm the project's `file_path` points there, confirm re-importing the same source path does not create a duplicate `MediaItem` or a second copy on disk.

## Non-goals

- No migration or backfill for media already referenced by existing projects.
- No deletion of the copied file when its `MediaItem` is removed from the library — matches the existing behavior for `data/thumbnails/`/`data/peaks/`, which are never cleaned up either.
- No change to `/api/probe` or its existing tests.
- No change to how video boxes/image boxes pick *already-imported* media (they select an existing `MediaItem` from the library, not a new file — unaffected).
