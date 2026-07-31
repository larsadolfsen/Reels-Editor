# Copy Media On Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When media is imported, copy it into the project's own local `data/media/` folder instead of only remembering its original external path, so playback/export never depend on a Dropbox sync state, a moved file, or an unmounted drive.

**Architecture:** One new backend route (`POST /api/projects/{id}/import-media`) does the copy + probe + `MediaItem` construction + save, server-side, with dedup keyed on a new `MediaItem.source_path` field. Both existing import call sites (`clip-sequence.js`'s bulk VIDEO/IMAGE import, `panel-audio.js`'s single AUDIO import) become thin callers of one new `Api.importMedia()` wrapper instead of each separately probing and constructing a `MediaItem`.

**Tech Stack:** FastAPI route (Python, `shutil.copy2` for the file copy), vanilla JS `Api.*` wrapper (no build step).

## Global Constraints

- `MediaItem.source_path` defaults to `""` — existing saved projects load unaffected, no migration.
- Dedup is keyed on `source_path` (the original picked path), not `file_path` (now the copy's path).
- `MediaItem.name` must be set to the original file's basename on import — `display_name` falls back to `file_path`'s basename when `name` is empty, and `file_path` is no longer the meaningful original filename.
- A source file that can't be read fails the import request with a clear error (import-time failure, not a later silent playback 404).
- No migration/backfill for existing projects' already-imported media.
- No deletion of the copied file when its `MediaItem` is removed from the library (matches `data/thumbnails/`/`data/peaks/` — never cleaned up either).
- No changes to `/api/probe`, `static/api-probe-media.js`, or their existing tests — left in place as a general-purpose utility, not owned by this feature.
- Copied files live at `<DATA_DIR>/media/<media_id><ext>`, `ext` lowercased from the source path's suffix.

---

### Task 1: Backend — data model, copy helper, import route

**Files:**
- Modify: `app/models.py` (`MediaItem`, ~line 10-16)
- Modify: `app/media.py` (add `copy_into_media_dir`)
- Modify: `app/main.py` (add `POST /api/projects/{pid}/import-media`)
- Test: `tests/test_media.py`
- Test: `tests/test_main.py`

**Interfaces:**
- Produces: `MediaItem.source_path: str = ""` (new field).
- Produces: `app.media.copy_into_media_dir(source_path: str, media_id: str, data_dir: Path) -> Path`.
- Produces: `POST /api/projects/{pid}/import-media`, body `{"paths": [str, ...]}`, returns `{"project": Project, "imported": [MediaItem, ...]}`.

- [ ] **Step 1: Add `MediaItem.source_path`**

In `app/models.py`, `MediaItem` currently reads:

```python
class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    name: str = ""
    duration: float
    has_audio: bool = True
    kind: str = "video"  # "video" | "image" | "audio" — "audio" for imported music files (mp3/wav/m4a/aac/ogg/flac), decided at import time from the file extension
```

Add `source_path` right after `file_path`:

```python
class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    source_path: str = ""  # the original external path this file was imported from (added 2026-07-31, copy-on-import); dedup-only, never used for playback/export — file_path is the copy under data/media/ that those actually read
    name: str = ""
    duration: float
    has_audio: bool = True
    kind: str = "video"  # "video" | "image" | "audio" — "audio" for imported music files (mp3/wav/m4a/aac/ogg/flac), decided at import time from the file extension
```

- [ ] **Step 2: Write the failing test for `copy_into_media_dir`**

Add to `tests/test_media.py` (after the existing `generate_thumbnail` tests):

```python
def test_copy_into_media_dir_copies_to_media_subfolder_with_id_and_ext(tmp_path):
    src = tmp_path / "source.MP4"
    src.write_bytes(b"fake-video-bytes")

    result = copy_into_media_dir(str(src), "abc123", tmp_path)

    assert result == tmp_path / "media" / "abc123.mp4"
    assert result.read_bytes() == b"fake-video-bytes"

def test_copy_into_media_dir_preserves_extension_case_insensitively(tmp_path):
    src = tmp_path / "photo.PNG"
    src.write_bytes(b"fake-png-bytes")

    result = copy_into_media_dir(str(src), "img1", tmp_path)

    assert result.name == "img1.png"

def test_copy_into_media_dir_raises_on_missing_source(tmp_path):
    with pytest.raises(FileNotFoundError):
        copy_into_media_dir(str(tmp_path / "does-not-exist.mp4"), "x", tmp_path)

def test_copy_into_media_dir_does_not_mutate_the_source_file(tmp_path):
    src = tmp_path / "source.mp4"
    src.write_bytes(b"original-bytes")

    copy_into_media_dir(str(src), "y", tmp_path)

    assert src.read_bytes() == b"original-bytes"
```

Add `copy_into_media_dir` to the existing import line at the top of `tests/test_media.py`:

```python
from app.media import ffprobe_cmd, probe_duration, has_audio_stream, percent_from_progress_line, run_export, is_image_path, _filedialog_options, generate_thumbnail, copy_into_media_dir
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -k copy_into_media_dir -v`
Expected: FAIL with `ImportError: cannot import name 'copy_into_media_dir'`

- [ ] **Step 4: Implement `copy_into_media_dir` in `app/media.py`**

Add after `generate_thumbnail` (end of the file):

```python
def copy_into_media_dir(source_path: str, media_id: str, data_dir: Path) -> Path:
    """Copies source_path into <data_dir>/media/<media_id><ext> (ext lowercased, from
    source_path's own suffix). Raises FileNotFoundError if source_path can't be read —
    surfaces an import-time failure instead of a silent later playback 404 (copy-on-import,
    added 2026-07-31)."""
    src = Path(source_path)
    if not src.is_file():
        raise FileNotFoundError(f"source file not found: {source_path}")
    media_dir = data_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    dest = media_dir / f"{media_id}{src.suffix.lower()}"
    shutil.copy2(src, dest)
    return dest
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 6: Write the failing tests for the import route**

Add to `tests/test_main.py`:

```python
def test_import_media_copies_probes_and_appends_media_item(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    src = tmp_path / "PXL_20260711_091857914.mp4"
    src.write_bytes(b"fake-video")
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.probe_duration", return_value=5.0), \
         patch("app.main.media.has_audio_stream", return_value=True):
        result = import_media(p.id, {"paths": [str(src)]})

    assert len(result["imported"]) == 1
    item = result["imported"][0]
    assert item.source_path == str(src)
    assert item.name == "PXL_20260711_091857914.mp4"
    assert item.duration == 5.0
    assert item.has_audio is True
    assert item.kind == "video"
    assert Path(item.file_path) == tmp_path / "media" / f"{item.id}.mp4"
    assert Path(item.file_path).read_bytes() == b"fake-video"
    assert result["project"].media_library == [item]
    # persisted, not just returned
    reloaded = store.load_project(p.id, tmp_path)
    assert reloaded.media_library == [item]

def test_import_media_skips_ffprobe_for_images(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    src = tmp_path / "photo.jpg"
    src.write_bytes(b"fake-jpeg")
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.probe_duration") as pd, \
         patch("app.main.media.has_audio_stream") as ha:
        result = import_media(p.id, {"paths": [str(src)]})

    pd.assert_not_called()
    ha.assert_not_called()
    item = result["imported"][0]
    assert item.kind == "image"
    assert item.duration == 0.0
    assert item.has_audio is False

def test_import_media_dedups_by_source_path(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"fake-video")
    existing = MediaItem(file_path="already/copied.mp4", source_path=str(src), duration=3.0)
    p = Project(name="r", media_library=[existing])
    store.save_project(p, tmp_path)

    result = import_media(p.id, {"paths": [str(src)]})

    assert result["imported"] == []
    assert result["project"].media_library == [existing]

def test_import_media_dedups_within_the_same_batch(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"fake-video")
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.probe_duration", return_value=1.0), \
         patch("app.main.media.has_audio_stream", return_value=False):
        result = import_media(p.id, {"paths": [str(src), str(src)]})

    assert len(result["imported"]) == 1
    assert len(result["project"].media_library) == 1

def test_import_media_raises_for_unreadable_source(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with pytest.raises(FileNotFoundError):
        import_media(p.id, {"paths": [str(tmp_path / "missing.mp4")]})
```

Add `import_media` to the existing `app.main` import line at the top of `tests/test_main.py`:

```python
from app.main import export_project, list_presets, create_preset, delete_preset, probe, sanitize_export_filename, resolve_export_path, media_peaks, import_media
```

Add `from app import store` at the top of `tests/test_main.py` if not already imported (check first — `test_duplicate_project_route_deep_copies_nested_data` already does `from app import store` inline inside the test function; add a top-level `from app import store` import instead so the new tests can use it directly without a per-test import).

- [ ] **Step 7: Run the tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k import_media -v`
Expected: FAIL with `ImportError: cannot import name 'import_media'`

- [ ] **Step 8: Implement the route in `app/main.py`**

Add after the existing `/api/probe` route (~line 124):

```python
@app.post("/api/projects/{pid}/import-media")
def import_media(pid: str, body: dict) -> dict:
    p = store.load_project(pid, DATA_DIR)
    existing_sources = {m.source_path for m in p.media_library if m.source_path}
    imported: list[MediaItem] = []
    for path in body.get("paths", []):
        if path in existing_sources:
            continue
        media_id = new_id()
        dest = media.copy_into_media_dir(path, media_id, DATA_DIR)
        if media.is_image_path(path):
            duration, has_audio, kind = 0.0, False, "image"
        else:
            duration, has_audio, kind = media.probe_duration(path), media.has_audio_stream(path), "video"
        item = MediaItem(id=media_id, file_path=str(dest), source_path=path,
                          name=Path(path).name, duration=duration, has_audio=has_audio, kind=kind)
        p.media_library.append(item)
        imported.append(item)
        existing_sources.add(path)
    store.save_project(p, DATA_DIR)
    return {"project": p, "imported": imported}
```

Add `MediaItem` to the existing `app.models` import line at the top of `app/main.py`:

```python
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack, AutoSliceApplyRequest, MediaItem
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_main.py tests/test_media.py -v`
Expected: PASS (all tests, including the 5 new route tests and 4 new copy tests)

- [ ] **Step 10: Run the full Python suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, no regressions (438 existing + 9 new = 447)

- [ ] **Step 11: Commit**

```bash
git add app/models.py app/media.py app/main.py tests/test_media.py tests/test_main.py
git commit -m "Add copy-on-import backend: MediaItem.source_path, copy_into_media_dir, import-media route"
```

---

### Task 2: Frontend — import API wrapper and the two import call sites

**Files:**
- Create: `static/api-import-media.js`
- Modify: `static/index.html` (script tag, ~line 754)
- Modify: `static/clip-sequence.js` (`importMedia()`, ~line 103-118)
- Modify: `static/panel-audio.js` (`importMusicFile()`, ~line 12-21)

**Interfaces:**
- Consumes: `POST /api/projects/{pid}/import-media` (Task 1).
- Produces: `window.Api.importMedia(projectId, paths) -> Promise<{project, imported} | null>`.

- [ ] **Step 1: Create `static/api-import-media.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Copies each path into the project's own local media folder (data/media/), probes it, and
// appends a MediaItem to the project — a path already referenced by an existing MediaItem's
// source_path is skipped (dedup). Returns { project, imported }, or null on failure. imported
// holds only the newly-added MediaItems, in input order (added 2026-07-31, copy-on-import).
window.Api.importMedia = async function importMedia(projectId, paths) {
  const res = await fetch(`/api/projects/${projectId}/import-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) return null;
  return res.json();
};
```

- [ ] **Step 2: Register the script tag in `index.html`**

In `static/index.html`, after the `api-probe-media.js` tag:

```html
<script src="/static/api-probe-media.js"></script>
<script src="/static/api-import-media.js"></script>
```

- [ ] **Step 3: Rewrite `clip-sequence.js`'s `importMedia()`**

Replace:

```js
async function importMedia() {
  const paths = await Api.pickFiles();
  if (!paths.length) return;

  for (const path of paths) {
    if (project.media_library.some((m) => m.file_path === path)) continue; // already imported
    const probeResult = await Api.probeMedia(path);
    if (!probeResult) continue;
    const { duration, has_audio, kind } = probeResult;
    const mediaId = crypto.randomUUID().replaceAll("-", "");
    project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind });
  }

  await saveProject();
  MediaPanel.render();
}
```

with:

```js
async function importMedia() {
  const paths = await Api.pickFiles();
  if (!paths.length) return;

  // The import route copies each file, probes it, and saves the project server-side — no
  // client-side saveProject() needed, same as runAutoCaption()'s server-returned project.
  const result = await Api.importMedia(project.id, paths);
  if (!result) return;
  project = result.project;

  MediaPanel.render();
}
```

- [ ] **Step 4: Rewrite `panel-audio.js`'s `importMusicFile()`**

Replace:

```js
  async function importMusicFile() {
    const path = await Api.pickFile("audio");
    if (!path) return null;
    const probeResult = await Api.probeMedia(path);
    if (!probeResult) { alert("probe failed"); return null; }
    const { duration, has_audio } = probeResult;
    const mediaId = crypto.randomUUID().replaceAll("-", "");
    project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind: "audio" });
    return mediaId;
  }
```

with:

```js
  async function importMusicFile() {
    const path = await Api.pickFile("audio");
    if (!path) return null;
    const result = await Api.importMedia(project.id, [path]);
    if (!result) return null;
    project = result.project;
    // imported is empty when the file was already in the library (dedup) — fall back to the
    // existing entry so re-picking the same source file still returns a usable media id.
    const item = result.imported[0] || project.media_library.find((m) => m.source_path === path);
    return item ? item.id : null;
  }
```

`addMusic()`/`replaceMusic()` below this function are unchanged — they still set `project.music` themselves and call `saveProject()` for that separate mutation.

- [ ] **Step 5: Run the full JS test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS, no regressions (both changed files are thin API/DOM wiring with no pure logic — no new test file for this task, per this project's convention)

- [ ] **Step 6: Commit**

```bash
git add static/api-import-media.js static/index.html static/clip-sequence.js static/panel-audio.js
git commit -m "Wire VIDEO/IMAGE and AUDIO import through the new copy-on-import route"
```

---

### Task 3: Manual verification in the browser

**Files:** none (verification pass — both project convention and this codebase's existing pattern for thin DOM/API-wiring files call for live verification, not unit tests).

- [ ] **Step 1: Start the server and open a throwaway test project**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

Open `http://127.0.0.1:8000`, create a **throwaway** test project (per this project's convention — never test against real project data).

- [ ] **Step 2: Verify VIDEO/IMAGE import copies the file**

Import a real local video file via FILES → IMPORT MEDIA. Confirm:
- The file appears in the FILES panel with its real filename (not an opaque id).
- A new file exists under `data/media/` (check the data directory) whose name is `<some-id>.<ext>` matching the imported clip's extension.
- The clip plays correctly on the stage (proves `file_path` in the saved project JSON now points at the copy, and it's a valid playable file).

- [ ] **Step 3: Verify dedup**

Import the exact same file again (FILES → IMPORT MEDIA, pick the same source file). Confirm no second entry appears in the FILES panel and no second file appears under `data/media/`.

- [ ] **Step 4: Verify AUDIO import**

Go to the AUDIO panel, "ADD MUSIC", pick a real local audio file. Confirm it's added, plays back correctly, and a copy appears under `data/media/`.

- [ ] **Step 5: Verify a missing source file fails loudly at import time**

Pick a file, then before the import request would reach the server, is impractical to simulate directly — instead, confirm via the Task 1 tests (`test_import_media_raises_for_unreadable_source`) that this path is covered; skip a live repro for this step since it requires simulating a file disappearing mid-picker-dialog, which isn't practically reproducible in a manual pass.

- [ ] **Step 6: Report results**

Note in the session (no commit needed) whether all checks passed, or list what failed for follow-up.

---

### Task 4: Update the codebase map

**Files:**
- Modify: `CLAUDE.md` (Codebase map section — File structure tree and Inventory)

- [ ] **Step 1: Update File structure tree entries**

In `CLAUDE.md`'s `## File structure` tree:
- Update the `app/models.py` entry to mention `MediaItem.source_path` (added 2026-07-31, copy-on-import).
- Update the `app/media.py` entry to mention `copy_into_media_dir`.
- Update the `app/main.py` entry (if it lists routes) or note the new route near the existing `/api/probe` mention.
- Add a `static/api-import-media.js` entry near the other `api-*.js` files, matching their one-line format.
- Update the `static/clip-sequence.js` and `static/panel-audio.js` entries to mention the new copy-on-import flow.

- [ ] **Step 2: Update the Inventory section**

In `## Inventory`'s "Media library & import" subsection, add coverage of: `MediaItem.source_path`, `copy_into_media_dir`, the `POST /api/projects/{pid}/import-media` route, `static/api-import-media.js`, and the updated `importMedia()`/`importMusicFile()` behavior — referencing the design spec at `docs/superpowers/specs/2026-07-31-media-import-copy-design.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update codebase map for copy-on-import media feature"
```
