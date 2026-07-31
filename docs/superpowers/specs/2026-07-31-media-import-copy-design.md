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
1. Skip if any existing `MediaItem.source_path` already equals this path (dedup — mirrors today's client-side `file_path`-based check, now keyed on the original path since `file_path` no longer is one).
2. Otherwise: generate a new id, copy the file via `copy_into_media_dir`, probe it (`probe_duration`/`has_audio_stream`, skipped for images exactly as `/api/probe` does today), determine `kind` via `is_image_path`, and build the `MediaItem` (`file_path` = the copy's path, `source_path` = the original path, **`name` = the original path's basename** — `MediaItem.display_name` falls back to `file_path`'s basename when `name` is empty, and `file_path` is no longer the meaningful original filename, so `name` must be set explicitly or the FILES panel would start showing opaque `{id}.ext` names instead of the user's real filenames).

Saves the project once after processing all paths. Returns:

```json
{"project": { ...updated Project... }, "imported": [ { ...new MediaItem... }, ... ]}
```

`imported` holds only the newly-added items (skipping any deduped), in the same order as the input `paths` — the AUDIO caller needs the specific new id, not just the updated project.

A source file that can't be read fails the whole request with a clear error (matches this app's existing error-surfacing convention, e.g. the transcribe route's `503`/`detail` pattern) rather than silently skipping it.

**`/api/probe` stays as-is.** After this change nothing in the frontend calls it anymore, but it's a general-purpose read-only probe utility, not something this feature owns — removing it is a separate decision, not bundled into this change.

## Frontend

**New `static/api-import-media.js`:**

```js
Api.importMedia(projectId, paths) -> Promise<{project, imported} | null>
```

POSTs to the new route; `null` on failure (mirrors this codebase's existing `Api.*` failure convention).

**`static/clip-sequence.js`'s `importMedia()`** — replaces the per-path loop (dedup check + `Api.probeMedia` + local `MediaItem` construction) with one call:

```js
async function importMedia() {
  const paths = await Api.pickFiles();
  if (!paths.length) return;
  const result = await Api.importMedia(project.id, paths);
  if (!result) return;
  project = result.project;
  MediaPanel.render();
}
```

(No client-side `saveProject()` afterward — the server already persisted it, matching how `runAutoCaption()` already handles a server-returned, already-saved project.)

**`static/panel-audio.js`'s `importMusicFile()`** — same shape, one path:

```js
async function importMusicFile() {
  const path = await Api.pickFile("audio");
  if (!path) return null;
  const result = await Api.importMedia(project.id, [path]);
  if (!result || !result.imported.length) return null;
  project = result.project;
  return result.imported[0].id;
}
```

`addMusic()`/`replaceMusic()` are unchanged below this point — they still set `project.music` themselves and call `saveProject()`, since that's a separate mutation this route doesn't know about.

## Files

- Modify: `app/models.py` (`MediaItem.source_path`)
- Modify: `app/media.py` (`copy_into_media_dir`)
- Modify: `app/main.py` (`POST /api/projects/{id}/import-media`)
- New: `static/api-import-media.js`
- Modify: `static/clip-sequence.js` (`importMedia()`)
- Modify: `static/panel-audio.js` (`importMusicFile()`)

## Testing

- `tests/test_media.py`: `copy_into_media_dir` — copies to the right path with the right (lowercased) extension, raises on a missing source, doesn't clobber an existing file at the same id (shouldn't happen given fresh ids, but the copy call itself is deterministic given real inputs).
- `tests/test_main.py`: the new route — imports a fresh path (copies, probes, returns it in `imported`), dedups a path whose `source_path` already exists in `media_library`, skips probing for an image path, surfaces an error for an unreadable source path, returns items in input order, saves the project exactly once.
- Frontend: both changed files are thin API/DOM wiring (per this project's convention, no unit tests for that layer) — verified live in the browser: import a video, confirm a new file appears under `data/media/`, confirm the project's `file_path` points there, confirm re-importing the same source path does not create a duplicate `MediaItem` or a second copy on disk.

## Non-goals

- No migration or backfill for media already referenced by existing projects.
- No deletion of the copied file when its `MediaItem` is removed from the library — matches the existing behavior for `data/thumbnails/`/`data/peaks/`, which are never cleaned up either.
- No change to `/api/probe` or its existing tests.
- No change to how video boxes/image boxes pick *already-imported* media (they select an existing `MediaItem` from the library, not a new file — unaffected).
