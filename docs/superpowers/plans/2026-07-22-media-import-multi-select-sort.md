# Media Import Multi-Select + Sort-by-Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users multi-select video/image files in one native picker for import, land them in the media library only (not auto-inserted into the timeline), and show the MEDIA panel list grouped by type (videos, then images).

**Architecture:** Native file picker switches from single-select (`askopenfilename`) to multi-select (`askopenfilenames`), returning a list of paths through a renamed API route. The client-side import flow probes and library-adds each path in a loop, dropping the previous "also insert a `ClipLayer`" behavior. The MEDIA panel's render function partitions `project.media_library` by `kind` before rendering, inserting a label row above each non-empty group.

**Tech Stack:** Python (FastAPI, tkinter `filedialog`), vanilla JS (no build step), plain CSS.

## Global Constraints

- No `MediaItem`/`Project` schema changes.
- No auto-insert of imported files into `project.clips` (timeline sequence) — media-library only.
- MEDIA panel groups: videos before images, each group's internal order unchanged (import order), label omitted for an empty group.
- Follow project conventions: `Api.*`/one-function-per-file for API calls, no inline `style="..."` (all styling in `static/css/**`), header comment at top of every touched `static/*.js`/`static/css/**/*.css` file kept current.
- `pick_files()`/`pick_file()`-style native-dialog code stays untested by pytest (matches existing project pattern — real OS dialog, not mockable in this codebase's test style); verify via the full test suite (no regressions) plus manual browser verification at the end.

---

### Task 1: Backend — multi-select native file picker

**Files:**
- Modify: `app/media.py:106-124` (`pick_file` function)
- Modify: `app/main.py:81-83` (`/api/pick-file` route)
- Modify: `app/media.py:1-4` (header comment)

**Interfaces:**
- Consumes: nothing new (uses stdlib `tkinter.filedialog`).
- Produces: `app.media.pick_files() -> list[str]` (empty list if the user cancels). Route `GET /api/pick-files` -> `{"paths": list[str]}`.

- [ ] **Step 1: Rename and multi-select `pick_file` in `app/media.py`**

Replace the existing `pick_file` function (lines 106-124) with:

```python
def pick_files() -> list[str]:
    # Must stay a sync `def` route: FastAPI dispatches sync handlers to a worker thread,
    # so this blocking Tk dialog runs off the main thread. Switching the /api/pick-files
    # route to `async def` would run this on the event loop and freeze the server.
    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    paths = filedialog.askopenfilenames(
        title="Import Media",
        filetypes=[
            ("Media files", "*.mp4 *.mov *.mkv *.jpg *.jpeg *.png *.webp"),
            ("Video files", "*.mp4 *.mov *.mkv"),
            ("Image files", "*.jpg *.jpeg *.png *.webp"),
            ("All files", "*.*"),
        ],
    )
    root.destroy()
    return list(paths)
```

- [ ] **Step 2: Update the header comment in `app/media.py`**

Change line 3 (the "Exposes ..." line) from:

```python
# Exposes ffprobe_cmd, probe_duration, has_audio_stream, is_image_path, media_response, run_export,
# percent_from_progress_line, pick_file. Depends on ffprobe/ffmpeg on PATH and tkinter.
```

to:

```python
# Exposes ffprobe_cmd, probe_duration, has_audio_stream, is_image_path, media_response, run_export,
# percent_from_progress_line, pick_files. Depends on ffprobe/ffmpeg on PATH and tkinter.
```

- [ ] **Step 3: Update the route in `app/main.py`**

Replace:

```python
@app.get("/api/pick-file")
def pick_file() -> dict:
    return {"path": media.pick_file()}
```

with:

```python
@app.get("/api/pick-files")
def pick_files() -> dict:
    return {"paths": media.pick_files()}
```

- [ ] **Step 4: Run the full test suite to confirm no regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass (no test references `pick_file`/`/api/pick-file` today, so this step is a regression check, not new coverage — confirmed by grepping `tests/` for `pick_file` and `pick-file` beforehand, both empty).

- [ ] **Step 5: Commit**

```bash
git add app/media.py app/main.py
git commit -m "feat: multi-select native file picker for media import"
```

---

### Task 2: Frontend API — `Api.pickFiles()`

**Files:**
- Create: `static/api-pick-files.js`
- Delete: `static/api-pick-file.js`
- Modify: `static/index.html:631` (script tag)

**Interfaces:**
- Consumes: `GET /api/pick-files -> {"paths": string[]}` (Task 1).
- Produces: `window.Api.pickFiles() -> Promise<string[]>`, consumed by Task 3.

- [ ] **Step 1: Create `static/api-pick-files.js`**

```javascript
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Opens a native OS file-open dialog (multi-select) on the server. Returns the chosen paths
// (empty array if cancelled).
window.Api.pickFiles = async function pickFiles() {
  const res = await fetch("/api/pick-files");
  const { paths } = await res.json();
  return paths;
};
```

- [ ] **Step 2: Delete the old file**

```bash
git rm static/api-pick-file.js
```

- [ ] **Step 3: Update the script tag in `static/index.html`**

Change line 631 from:

```html
<script src="/static/api-pick-file.js"></script>
```

to:

```html
<script src="/static/api-pick-files.js"></script>
```

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "pickFile\b\|api-pick-file\.js" static/`
Expected: no output (only `pickFiles`/`api-pick-files.js` remain — this catches any missed caller before Task 3 rewires them).

Note: this will still show the caller in `static/clip-sequence.js` until Task 3 updates it — that's expected; re-run after Task 3 to confirm it's clean.

- [ ] **Step 5: Commit**

```bash
git add static/api-pick-files.js static/index.html
git commit -m "feat: rename Api.pickFile to Api.pickFiles (multi-select)"
```

---

### Task 3: Import flow — `importMedia()` (library-only, multi-file)

**Files:**
- Modify: `static/clip-sequence.js` (whole file: header comment, `addClip` -> `importMedia`, listener wiring)
- Modify: `static/index.html:132` (`#add-clip` button label)

**Interfaces:**
- Consumes: `Api.pickFiles() -> Promise<string[]>` (Task 2), `Api.probeMedia(path) -> Promise<{duration, has_audio, kind} | null>` (existing, unchanged), `MediaPanel.render()` (existing, unchanged signature), `saveProject()` (existing global, unchanged), `renderTimeline()`/`Preview.load(project)` (existing globals — no longer called by the import flow itself since nothing is added to the timeline).
- Produces: `window.importMedia()` (global, replaces `window.addClip`), wired to the `#add-clip` click listener. No other file calls `addClip`/`importMedia` today, so no downstream interface to preserve beyond the DOM listener.

- [ ] **Step 1: Update the file header comment**

Replace lines 1-5 of `static/clip-sequence.js`:

```javascript
// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed), converting a video box into a sequence clip, and
// importing a new media file via the native file picker (image imports default to a 3s clip
// duration since MediaItem.duration is 0 for images). Plain globals shared with editor.js's
// drag/drop wiring; reaches into editor.js's `project`/`clipDurations`/`saveProject` globals.
```

with:

```javascript
// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed) and converting a video box into a sequence clip.
// Also imports one or more media files via the native multi-select file picker straight into
// the media library (no timeline insert — the user drags library items onto the timeline
// themselves). Plain globals shared with editor.js's drag/drop wiring; reaches into editor.js's
// `project`/`saveProject` globals.
```

- [ ] **Step 2: Replace `addClip` with `importMedia` (lines 75-104)**

Replace:

```javascript
const DEFAULT_IMAGE_DURATION = 3.0;

async function addClip() {
  const path = await Api.pickFile();
  if (!path) return;
  const probeResult = await Api.probeMedia(path);
  if (!probeResult) { alert("probe failed"); return; }
  const { duration, has_audio, kind } = probeResult;
  const mediaId = crypto.randomUUID().replaceAll("-", "");
  project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind });

  const clipDuration = kind === "image" ? DEFAULT_IMAGE_DURATION : duration;
  const id = crypto.randomUUID().replaceAll("-", "");
  clipDurations[id] = clipDuration;
  project.clips.push({
    id,
    media_id: mediaId,
    file_path: path,
    in_point: 0,
    out_point: clipDuration,
    order: project.clips.length,
    speed: 1,
  });
  await saveProject();
  MediaPanel.render();
  Preview.load(project);
  renderTimeline();
}

document.getElementById("add-clip").addEventListener("click", addClip);
```

with:

```javascript
async function importMedia() {
  const paths = await Api.pickFiles();
  if (!paths.length) return;

  for (const path of paths) {
    const probeResult = await Api.probeMedia(path);
    if (!probeResult) continue;
    const { duration, has_audio, kind } = probeResult;
    const mediaId = crypto.randomUUID().replaceAll("-", "");
    project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind });
  }

  await saveProject();
  MediaPanel.render();
}

document.getElementById("add-clip").addEventListener("click", importMedia);
```

Note: `DEFAULT_IMAGE_DURATION` is removed here since no `ClipLayer` is created by import anymore. Grep for other consumers first — Step 3 below confirms it's safe to drop.

- [ ] **Step 3: Confirm `DEFAULT_IMAGE_DURATION` has no other consumers**

Run: `grep -rn "DEFAULT_IMAGE_DURATION" static/`
Expected: no output (it was only used in the code just replaced). If any other file references it, keep the constant defined in `static/clip-sequence.js` instead of removing it.

- [ ] **Step 4: Update the import button label in `static/index.html`**

Change line 132 from:

```html
<button id="add-clip"><span class="icon">+</span><span class="label">IMPORT VIDEO</span></button>
```

to:

```html
<button id="add-clip"><span class="icon">+</span><span class="label">IMPORT MEDIA</span></button>
```

- [ ] **Step 5: Re-run the stale-reference check from Task 2**

Run: `grep -rn "pickFile\b\|api-pick-file\.js\|addClip\b" static/`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add static/clip-sequence.js static/index.html
git commit -m "feat: multi-file media import, library-only (no timeline auto-insert)"
```

---

### Task 4: MEDIA panel — group by type with section labels

**Files:**
- Modify: `static/panel-media.js` (header comment, `render()`)
- Modify: `static/css/components/style-panel.css` (add `.clip-section-label`)

**Interfaces:**
- Consumes: `project.media_library` (existing, each item has `kind: "video" | "image" | "audio"` per `app/models.py`'s `MediaItem`).
- Produces: `window.MediaPanel.render()` — same public signature, no callers change.

- [ ] **Step 1: Update the header comment in `static/panel-media.js`**

Replace lines 1-4:

```javascript
// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// click-to-select, hover-reveal inline rename (pencil icon) and remove (trash icon, disabled
// with a usage-count chip when the media item is referenced by any ClipLayer).
// Exposes window.MediaPanel.render().
```

with:

```javascript
// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration),
// grouped by type (videos, then images, each with a small section label — omitted when that
// group is empty), click-to-select, hover-reveal inline rename (pencil icon) and remove (trash
// icon, disabled with a usage-count chip when the media item is referenced by any ClipLayer).
// Exposes window.MediaPanel.render().
```

- [ ] **Step 2: Extract row-building into a helper and group in `render()`**

Replace the whole `render()` function (currently lines 52-127) with:

```javascript
  function buildRow(m) {
    const li = document.createElement("li");
    li.draggable = true; // drag onto the timeline's VIDEO row to place this file as a clip
    li.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/media-id", m.id));
    if (selectedMediaId === m.id) {
      li.classList.add("selected");
    }

    const thumb = document.createElement("div");
    thumb.className = "clip-thumb";
    li.appendChild(thumb);

    const info = document.createElement("div");
    info.className = "clip-info";
    const name = document.createElement("span");
    name.className = "clip-name";
    name.textContent = displayName(m);
    const duration = document.createElement("span");
    duration.className = "clip-duration";
    duration.textContent = formatClipDuration(m.duration);
    info.appendChild(name);
    info.appendChild(duration);
    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "clip-actions";
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "icon-btn clip-action";
    renameBtn.title = "Rename";
    renameBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startRename(m, name);
    });
    actions.appendChild(renameBtn);

    const count = project.clips.filter((c) => c.media_id === m.id).length;
    if (count > 0) {
      const chip = document.createElement("span");
      chip.className = "clip-usage-chip";
      chip.textContent = String(count);
      actions.appendChild(chip);
    }

    const trashBtn = document.createElement("button");
    trashBtn.type = "button";
    trashBtn.className = "icon-btn clip-action";
    if (count > 0) {
      trashBtn.disabled = true;
      trashBtn.title = `used by ${count} clip${count === 1 ? "" : "s"}`;
    } else {
      trashBtn.title = "Remove";
    }
    trashBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    trashBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (count > 0) return;
      project.media_library = project.media_library.filter((x) => x.id !== m.id);
      await saveProject();
      render();
    });
    actions.appendChild(trashBtn);

    li.appendChild(actions);

    li.addEventListener("click", () => {
      selectedMediaId = selectedMediaId === m.id ? null : m.id;
      render();
    });
    return li;
  }

  function appendGroup(list, label, items) {
    if (!items.length) return;
    const labelLi = document.createElement("li");
    labelLi.className = "clip-section-label";
    labelLi.textContent = label;
    list.appendChild(labelLi);
    items.forEach((m) => list.appendChild(buildRow(m)));
  }

  function render() {
    const list = document.getElementById("clip-list");
    list.innerHTML = "";
    const videos = project.media_library.filter((m) => m.kind !== "image");
    const images = project.media_library.filter((m) => m.kind === "image");
    appendGroup(list, "VIDEOS", videos);
    appendGroup(list, "IMAGES", images);
  }
```

- [ ] **Step 3: Add `.clip-section-label` styling to `static/css/components/style-panel.css`**

Add near the other `#clip-list`/`.clip-*` rules (after the `.clip-name-input` block, before line 203's hover rule, or any sensible spot within that section):

```css
.clip-section-label {
  font-family: var(--font-ui);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: var(--space-2) 0 4px;
  list-style: none;
}
.clip-section-label:first-child { padding-top: 0; }
```

- [ ] **Step 4: Commit**

```bash
git add static/panel-media.js static/css/components/style-panel.css
git commit -m "feat: group MEDIA panel list by type (videos, then images)"
```

---

### Task 5: Manual browser verification

**Files:** none (verification only).

**Interfaces:** none — exercises Tasks 1-4 end to end.

- [ ] **Step 1: Start the dev server**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

- [ ] **Step 2: Open the app and select or create a throwaway test project**

Open `http://127.0.0.1:8000` in the browser. Per project convention, use a scratch/test project — not real project data — since imported media persists to disk.

- [ ] **Step 3: Click "IMPORT MEDIA" and multi-select 2+ video files and 1+ image file**

Confirm: the native OS picker allows selecting multiple files (ctrl/shift-click or drag-select) with a single "Import Media" dialog title.

- [ ] **Step 4: Verify the MEDIA panel groups correctly**

Confirm: a "VIDEOS" label followed by the imported video rows, then an "IMAGES" label followed by the imported image row(s). If only videos or only images were imported, confirm the other label/group doesn't appear at all.

- [ ] **Step 5: Verify nothing was auto-added to the timeline**

Confirm: the VIDEO row in the timeline strip is unchanged — none of the just-imported files appear there until manually dragged from the MEDIA panel.

- [ ] **Step 6: Verify existing single-item flows still work**

Confirm: dragging a MEDIA panel row onto the timeline's VIDEO row still inserts a clip (existing `insertClipIntoSequence` behavior, untouched by this plan). Confirm rename (pencil icon) and remove (trash icon, when unused) still work per row.

- [ ] **Step 7: Report results**

No commit for this task — it's a verification checkpoint. If any check fails, fix the relevant task's file(s) and re-run the failing step before proceeding.
