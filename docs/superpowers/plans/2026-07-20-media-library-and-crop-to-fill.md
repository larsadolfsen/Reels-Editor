# Media Library Management + Crop-to-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two backlog items in one batch: (1) Media Library Management — rename a media item, show an in-use indicator, remove unused items; (2) Crop-to-Fill — per-clip choice between today's letterbox (`fit`) and a center-crop (`fill`) in both preview and export.

**Design docs:** [2026-07-20-media-library-management-design.md](../specs/2026-07-20-media-library-management-design.md), [2026-07-20-crop-to-fill-design.md](../specs/2026-07-20-crop-to-fill-design.md). Both verified against current code on 2026-07-20 (`main` @ `d29d2c4`) — no drift found in the data model or ffmpeg filter chain described by either doc.

**Correction versus the design docs:** neither doc's task list accounts for `static/editor.js` already being 887 lines — well over `CLAUDE.md`'s 400-line hard limit ("never add a feature to a file already over 400 lines — split it first, as its own step"). Both features would otherwise add code to `editor.js` (media-list rendering, VIDEO panel rendering both currently live there). This plan adds two prerequisite extraction tasks (Task 1, Task 2), pure refactors with no behavior change, following the same one-file-per-panel-section pattern already established by `static/panel-video-box.js`/`static/panel-export.js`.

**Architecture:**
- `static/panel-media.js` (new) takes over `renderMediaList()` and the `selectedMediaId` module state from `editor.js`, then gains rename/usage/remove behavior.
- `static/panel-video.js` (new) takes over `renderVideoPanel()`, `selectClip()`, `deleteClip()`, `moveClip()` from `editor.js`, then gains the FILL row.
- `MediaItem.name: str = ""` (backend model) + a name-resolution helper used by both the media list and the VIDEO panel name label (currently each independently derives the name from `file_path`).
- `ClipLayer.fill_mode: str = "fit"` (backend model), consumed by `app/ffmpeg_cmd.py`'s per-clip filter chain and by `static/preview.js`'s `#player` CSS class.

**Tech Stack:** Python (Pydantic models, pytest), vanilla JS (`window.Api`/`window.UI` patterns), CSS.

## Global Constraints

- No migration needed for either new field — both are new fields with safe defaults (`""` / `"fit"`), same pattern as `has_audio`/`export_filename`. Do not add a `store.py` migration.
- Task 1 and Task 2 must not change any behavior — they are pure moves. Verify by running the app before/after and confirming the VIDEO and FILES panels behave identically.
- Every file this plan creates or touches must keep/gain its 2-3 line header comment and be reflected in `CLAUDE.md`'s codebase map (file structure tree + Inventory) in the same commit that changes it.
- No inline `style="..."` in `static/index.html` or JS-rendered markup — all styling via CSS classes (per `CLAUDE.md`).
- `.venv/Scripts/python -m pytest -q` must stay green after every task.
- Reuse existing UI primitives: `UI.buttonGroup` (button-group toggle), `UI.numberField`, `UI.saveIndicator`'s pattern of module state — do not build new one-off components where an existing one fits.

---

### Task 1: Extract `static/panel-media.js` from `editor.js` (pure refactor)

**Files:**
- Create: `static/panel-media.js`
- Modify: `static/editor.js` (remove `renderMediaList`, `selectedMediaId`, the `formatClipDuration` helper stays in `editor.js` only if still used elsewhere — check callers first)
- Modify: `static/index.html` (add script tag)
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `window.MediaPanel.render()` — renders `#clip-list` from `project.media_library` exactly as `renderMediaList()` does today (thumbnail, name from `m.file_path`'s basename, duration, click-to-select highlight, `draggable`/`dragstart` wiring for drag-to-timeline). Keep the `selectedMediaId` state inside the new file (module-local, mirroring how `panel-video-box.js` owns its own selection state).
- Consumed by: `editor.js`'s `openProject()` (currently calls `renderMediaList()`) and `addClip()` (currently calls `renderMediaList()`) — update both call sites to `MediaPanel.render()`.

Read `static/editor.js` lines 460-493 (`renderMediaList`) and line 6 (`selectedMediaId` declaration) before starting — that is the exact code to move. Read `static/panel-video-box.js`'s top-of-file structure (header comment format, `window.X = window.X || {}` + IIFE pattern) to match the established convention.

- [ ] **Step 1: Create `static/panel-media.js`**

Move `renderMediaList` (renamed to the internal `render` function, exposed as `window.MediaPanel.render`) and `selectedMediaId` into the new file, inside an IIFE, following the same shape as `panel-video-box.js`. Header comment: `// FILES/MEDIA context-panel section: media-library list (thumbnail, name, duration), click-to-select. Exposes window.MediaPanel.render().`

- [ ] **Step 2: Update `editor.js`**

Remove the moved code. Replace both `renderMediaList()` call sites with `MediaPanel.render()`. Remove the now-unused `selectedMediaId` declaration from `editor.js`.

- [ ] **Step 3: Add the script tag**

In `static/index.html`, add `<script src="/static/panel-media.js"></script>` near the other `panel-*.js` tags (before `editor.js`, since `editor.js` calls `MediaPanel.render()`).

- [ ] **Step 4: Verify no behavior change**

Run `.venv/Scripts/python -m pytest -q` (expect unchanged pass count — JS-only). Start the server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open a project, confirm the FILES panel lists media, click-to-highlight still works, drag-to-timeline still works, importing a new clip still appends to the list. No console errors.

- [ ] **Step 5: Update the codebase map**

Add `panel-media.js` to `CLAUDE.md`'s file structure tree (near `panel-video-box.js`) and a matching Inventory entry under "Media library & import", following the existing entries' phrasing.

- [ ] **Step 6: Commit**

```bash
git add static/panel-media.js static/editor.js static/index.html CLAUDE.md
git commit -m "refactor: extract MEDIA panel rendering into panel-media.js"
```

---

### Task 2: Extract `static/panel-video.js` from `editor.js` (pure refactor)

**Files:**
- Create: `static/panel-video.js`
- Modify: `static/editor.js` (remove `renderVideoPanel`, `selectClip`, `deleteClip`, `moveClip`; keep `onTimelineSelect`, which calls into the new file)
- Modify: `static/index.html`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `window.VideoPanel.render(clip)` (was `renderVideoPanel`), `window.VideoPanel.select(clip)` (was `selectClip`) — same behavior, same DOM ids (`#video-name`, `#video-in-field`, `#video-out-field`, `#video-set-in`, `#video-set-out`, `#video-move-up`, `#video-move-down`, `#video-delete`).
- `deleteClip`/`moveClip` move with it as internal (non-exported) helpers, since nothing outside the VIDEO panel calls them — grep `editor.js` for `deleteClip(` and `moveClip(` to confirm before removing (the Delete-key handler in `editor.js` also calls `deleteClip` — check it and update the call to `VideoPanel.deleteClip` or expose `deleteClip` too, whichever keeps the smallest diff).
- Consumed by: `editor.js`'s `onTimelineSelect` (`type === "video"` branch, currently calls `renderVideoPanel`) and wherever clip selection is initiated (grep for `selectClip(`).

Read `static/editor.js` lines 359-433 and 682-689 (the functions to move) before starting.

- [ ] **Step 1: Create `static/panel-video.js`**

Header comment: `// VIDEO context-panel section: trim/order/delete for the selected clip. Exposes window.VideoPanel.render()/select()/deleteClip()/moveClip().` Move the four functions in.

- [ ] **Step 2: Update `editor.js`**

Replace call sites (`renderVideoPanel(...)` → `VideoPanel.render(...)`, `selectClip(...)` → `VideoPanel.select(...)`, and the Delete-key handler's `deleteClip(...)` call). Grep the whole file for all four function names after editing to confirm no stale references remain.

- [ ] **Step 3: Add the script tag**

`<script src="/static/panel-video.js"></script>` in `static/index.html`, before `editor.js`.

- [ ] **Step 4: Verify no behavior change**

`.venv/Scripts/python -m pytest -q` green. Live: select a clip on the timeline, confirm VIDEO panel populates, trim in/out, move up/down, delete (button and Delete key) all still work, no console errors.

- [ ] **Step 5: Update the codebase map**

Add `panel-video.js` to `CLAUDE.md`'s file structure tree and the "Video clips (VIDEO panel: trim/order/delete)" Inventory entry — this section currently attributes `renderVideoPanel`/`selectClip`/`deleteClip` to `editor.js`; update it to `panel-video.js`.

- [ ] **Step 6: Commit**

```bash
git add static/panel-video.js static/editor.js static/index.html CLAUDE.md
git commit -m "refactor: extract VIDEO panel rendering into panel-video.js"
```

---

### Task 3: `MediaItem.name` field + name-resolution helper

**Files:**
- Modify: `app/models.py`
- Test: `tests/test_models.py`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `MediaItem.name: str = ""` on the Pydantic model. Add a small helper (Python, e.g. `app/models.py`'s `MediaItem` gains a `display_name` property, or a free function `media_display_name(item: MediaItem) -> str` — implementer's choice, but it must be usable from `app/main.py` if needed later and mirrored conceptually in JS in Task 4) that returns `name` if non-empty, else the basename of `file_path` (split on both `/` and `\`, matching the existing JS pattern `m.file_path.split(/[\\/]/).pop()`).
- Note: this task is backend-model-only. The JS-side name resolution (used by `panel-media.js` and `panel-video.js`) is a plain inline expression in Task 4/6 — do not over-engineer a shared JS module for a one-line ternary.

- [ ] **Step 1: Write the failing test**

In `tests/test_models.py`, add tests asserting `MediaItem(file_path="a.mp4", duration=1.0).name == ""` (default empty) and that loading old JSON (a dict without `"name"`) via `MediaItem(**old_dict)` still works.

- [ ] **Step 2: Add the field**

In `app/models.py`, add `name: str = ""` to `MediaItem`, directly after `file_path`.

- [ ] **Step 3: Run tests**

`.venv/Scripts/python -m pytest tests/test_models.py -v` — expect PASS.

- [ ] **Step 4: Update the codebase map**

Update `CLAUDE.md`'s `MediaItem(id, file_path, duration)` mentions (there are at least two: the file-structure-tree summary line and the "Media library & import" Inventory bullet) to include `name`.

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py CLAUDE.md
git commit -m "feat: add MediaItem.name field"
```

---

### Task 4: Library row hover actions — rename flow

**Files:**
- Modify: `static/panel-media.js` (from Task 1)
- Modify: `static/css/components/panel.css`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `MediaItem.name` from Task 3.
- Depends on Task 1 (this task edits `panel-media.js`, not `editor.js`).

**Design (verbatim from the spec):** row hover reveals two icon buttons (Lucide pencil, trash — trash wired in Task 5) on each `#clip-list` row. Pencil swaps the name label for an inline text input; commit on Enter/blur, Escape cancels (do not commit) and restores the label. An empty submitted value is treated as "clear the override" (saves `name: ""`, falls back to the file_path-derived name) — this is a natural extension of the spec's fallback rule and does not need a special-cased UX. Writes `MediaItem.name`, calls `saveProject()`, then re-renders `MediaPanel.render()`. The rendered display name (for this row, and everywhere else a media item's name shows — VIDEO panel's `#video-name`, timeline VIDEO-row clip blocks) must resolve via the item's `name` when non-empty, else `file_path`'s basename.

- [ ] **Step 1: Row markup + hover CSS**

In `panel-media.js`'s row-building code, add the pencil/trash icon buttons (Lucide SVGs, copied inline per `CLAUDE.md`'s icon convention — reuse an existing Lucide pencil/trash path already vendored elsewhere in the codebase if one exists, e.g. check `static/index.html`/`panel-video-box.js`/`caption-panel-*.js` for an existing trash icon to copy verbatim rather than sourcing a new one). In `static/css/components/panel.css`, hide the action buttons by default and reveal on `li:hover` (mirror any existing hover-reveal pattern in the codebase if one exists; otherwise a plain `opacity: 0` / `:hover { opacity: 1 }` pair is fine).

- [ ] **Step 2: Rename flow**

Clicking pencil replaces the `.clip-name` label with a text `<input>` pre-filled with the resolved display name, focused and selected. `keydown` Enter commits (blurs, which triggers the commit), Escape cancels (restore label, discard input value, no save). `blur` commits. Commit: `media.name = value.trim(); await saveProject(); MediaPanel.render();` — trimming an all-whitespace value to `""` is correct (falls back to file_path).

- [ ] **Step 3: Propagate the display name**

Update the two other places a media item's name is shown to use the same resolve-name logic as the media list row: `static/panel-video.js`'s `#video-name` (currently `c.file_path.split(/[\\/]/).pop()` — change to look up the `MediaItem` via `c.media_id` in `project.media_library` and resolve its name/fallback), and `static/timeline.js`'s clip-block label if it renders a name (grep `timeline.js` for `file_path.split` to find it). Small inline `(m) => m.name || m.file_path.split(/[\\/]/).pop()` duplicated at each of these 2-3 call sites is fine — do not build a shared module for a one-line expression, per Task 3's note.

- [ ] **Step 4: Run tests, verify live**

`.venv/Scripts/python -m pytest -q` green (JS/CSS-only change). Live: rename a media item, confirm it persists (reload the page, still renamed), confirm the VIDEO panel and timeline clip block for a clip using that media show the new name, confirm Escape cancels without saving, confirm clearing the name reverts the display to the file basename.

- [ ] **Step 5: Update the codebase map**

Update `CLAUDE.md`'s `static/panel-media.js`/`static/panel-video.js` one-line summaries (added in Tasks 1-2) if the rename behavior changes their scope description; update the "Media library & import" Inventory prose to mention rename.

- [ ] **Step 6: Commit**

```bash
git add static/panel-media.js static/panel-video.js static/timeline.js static/css/components/panel.css CLAUDE.md
git commit -m "feat: rename media library items inline"
```

---

### Task 5: Usage-count computation + disabled-trash remove flow

**Files:**
- Modify: `static/panel-media.js`
- Modify: `static/css/components/panel.css` (if a new chip/disabled style is needed beyond existing tokens)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `project.clips` (each has `media_id`) to compute usage count per media item. Per the spec, only `ClipLayer` counts today (no `MusicTrack` yet).
- Design (verbatim from spec): rows referenced by ≥1 `ClipLayer` show a small usage-count chip; their trash button is disabled with a tooltip (`title` attribute) reading `"used by N clips"`. Trash on an unused row removes the `MediaItem` from `project.media_library` (file on disk untouched), saves, re-renders. No cascade delete.

- [ ] **Step 1: Usage count**

In `panel-media.js`'s render loop, compute `const count = project.clips.filter(c => c.media_id === m.id).length;` per row (a plain per-row `.filter()` is fine at this list's expected scale — no need for a precomputed map).

- [ ] **Step 2: Trash button**

If `count > 0`: render a small chip showing `count`, disable the trash button, set `title="used by ${count} clip${count === 1 ? "" : "s"}"`. If `count === 0`: trash is enabled, `onclick` removes the item: `project.media_library = project.media_library.filter(x => x.id !== m.id); await saveProject(); MediaPanel.render();` (no confirmation dialog — spec doesn't ask for one, matches the project's existing delete-button conventions which are also confirmation-free, e.g. `panel-video.js`'s `#video-delete`).

- [ ] **Step 3: Run tests, verify live**

`.venv/Scripts/python -m pytest -q` green. Live: add a clip from a media item (now in use) — confirm its row shows the usage chip and disabled trash with the right tooltip; delete that clip (VIDEO panel or Delete key) — confirm the media row's trash re-enables; click trash on an unused row — confirm it disappears from the list and `project.media_library` (check via console) no longer has it.

- [ ] **Step 4: Update the codebase map**

Extend the "Media library & import" Inventory prose in `CLAUDE.md` to mention the usage indicator and remove flow.

- [ ] **Step 5: Commit**

```bash
git add static/panel-media.js static/css/components/panel.css CLAUDE.md
git commit -m "feat: add media library usage indicator and remove-when-unused"
```

---

### Task 6: `ClipLayer.fill_mode` field + export chain branch

**Files:**
- Modify: `app/models.py`
- Modify: `app/ffmpeg_cmd.py`
- Test: `tests/test_models.py`, `tests/test_ffmpeg_cmd.py`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `ClipLayer.fill_mode: str = "fit"`. `build_export_cmd`'s per-clip filter-chain construction (currently `app/ffmpeg_cmd.py` lines 29-32) branches per clip: `"fit"` keeps today's `scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=F` chain; `"fill"` uses `scale=W:H:force_original_aspect_ratio=increase,crop=W:H,setsar=1,fps=F` (no pad — crop already produces exact dimensions).
- `build_audio_cmd` is untouched (fill_mode is video-only).

- [ ] **Step 1: Write the failing test**

In `tests/test_ffmpeg_cmd.py`, add a test using a `Project` with one `fit` clip and one `fill` clip (extend the existing `proj()` helper or add a local one), asserting the `fit` clip's segment of `fc` contains `force_original_aspect_ratio=decrease` and `pad=1080:1920`, and the `fill` clip's segment contains `force_original_aspect_ratio=increase` and `crop=1080:1920`, and does NOT contain `pad=`. In `tests/test_models.py`, add a default-value test for `ClipLayer.fill_mode == "fit"`.

- [ ] **Step 2: Run tests to verify they fail**

`.venv/Scripts/python -m pytest tests/test_ffmpeg_cmd.py tests/test_models.py -v -k fill` — expect FAIL (field doesn't exist yet / chain doesn't branch).

- [ ] **Step 3: Add the field**

`app/models.py`: `fill_mode: str = "fit"` on `ClipLayer`, after `order`.

- [ ] **Step 4: Branch the filter chain**

In `app/ffmpeg_cmd.py`'s `build_export_cmd`, replace the single-chain `parts.append(...)` for the video stream (lines 29-32) with an `if c.fill_mode == "fill":` branch producing the crop chain, else the existing pad chain. Keep the `trim=start=...end=...,setpts=PTS-STARTPTS,` prefix and `,setsar=1,fps={p.fps}[v{i}];` suffix shared between both branches (only the middle `scale`/`pad`-or-`crop` segment differs) to avoid duplicating the trim/setpts/fps logic.

- [ ] **Step 5: Run tests**

`.venv/Scripts/python -m pytest -q` — expect all green, including the new tests.

- [ ] **Step 6: Update the codebase map**

Update `CLAUDE.md`'s `ClipLayer` field-level description (Inventory, "Video clips" section — currently doesn't enumerate fields individually; add a short mention) and the `app/ffmpeg_cmd.py` one-line Inventory/header-comment description to mention fill_mode branching.

- [ ] **Step 7: Commit**

```bash
git add app/models.py app/ffmpeg_cmd.py tests/test_models.py tests/test_ffmpeg_cmd.py CLAUDE.md
git commit -m "feat: add ClipLayer.fill_mode with crop-to-fill export branch"
```

---

### Task 7: Preview object-fit toggle + VIDEO panel FILL row

**Files:**
- Modify: `static/preview.js`
- Modify: `static/css/components/stage.css`
- Modify: `static/panel-video.js` (from Task 2)
- Modify: `static/index.html` (VIDEO panel markup — new FILL row)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `ClipLayer.fill_mode` from Task 6.
- `#player` (the shared `<video>` element) needs `object-fit: cover` when the active clip's `fill_mode === "fill"`, else the existing `object-fit: contain` (currently a static rule at `stage.css:28`). Toggle via a CSS class (e.g. `.fill-mode-fill`) added/removed on `#player`, not an inline style (per the no-inline-styles convention).
- Two call sites in `static/preview.js` set `player.src` for a newly-active clip: `playClipAt(index)` (line ~101-110) and `seek(t)`'s branch where `loc.clip !== clips[activeIndex]` (line ~467-470). Both must update the class. Add one small helper (e.g. `applyFillModeClass(clip)`) called from both, rather than duplicating the toggle logic — this is the kind of small internal helper the file already uses elsewhere (`maybePreloadNext`, `zeroClipDuration`).
- VIDEO panel gains a FILL row: a 2-option `UI.buttonGroup` (FIT/FILL), mirroring the BOX size-mode idiom (`renderBoxPanel`'s SIZE row in `text-panel-*` files, or `panel-video-box.js` if it has a similar toggle — check for the closest existing 2-option buttonGroup call to copy the shape from). `onChange` sets `c.fill_mode`, saves, reloads preview (`Preview.load(project)` — same pattern `applyTrim` in `panel-video.js` already uses) so the currently-playing clip picks up the new class immediately if it's the active one.

- [ ] **Step 1: CSS class**

In `static/css/components/stage.css`, add `#player.fill-mode-fill { object-fit: cover; }` near the existing `#player { ... object-fit: contain; }` rule (the class rule must win via specificity — same selector weight plus the class makes it more specific, no `!important` needed).

- [ ] **Step 2: preview.js wiring**

Add `applyFillModeClass(clip)` doing `player.classList.toggle("fill-mode-fill", clip.fill_mode === "fill")`. Call it from `playClipAt` (after setting `activeIndex`) and from `seek`'s clip-switch branch (after setting `activeIndex`).

- [ ] **Step 3: VIDEO panel FILL row**

In `static/index.html`, add a FILL row to `#panel-video` (after ORDER, following the existing `style-group-label` + `style-group` structure). In `static/panel-video.js`'s render function, wire `UI.buttonGroup` for it: options `[{value: "fit", label: "FIT"}, {value: "fill", label: "FILL"}]`, active value `c.fill_mode`, `onChange: async (v) => { c.fill_mode = v; await saveProject(); Preview.load(project); }`.

- [ ] **Step 4: Run tests, verify live**

`.venv/Scripts/python -m pytest -q` green (JS/CSS-only). Live: import a landscape (non-9:16) clip, select it, toggle FILL — confirm the stage preview switches from letterboxed to cropped-and-filled immediately; toggle back to FIT — confirm it letterboxes again; scrub across a clip boundary from a FIT clip into a FILL clip and confirm the class updates correctly (exercises the `seek()` path, not just `playClipAt`). No console errors.

- [ ] **Step 5: Update the codebase map**

Update `CLAUDE.md`'s `preview.js` one-liner and the "Video clips" Inventory section to mention FIT/FILL.

- [ ] **Step 6: Commit**

```bash
git add static/preview.js static/css/components/stage.css static/panel-video.js static/index.html CLAUDE.md
git commit -m "feat: add crop-to-fill preview toggle and VIDEO panel FILL row"
```

---

### Task 8: Update the backlog

**Files:**
- Modify: `docs/superpowers/backlog.md`

- [ ] **Step 1: Move both items to Done**

Move the "Media library management" and "Crop-to-fill" bullets from `## To do` to `## Done` (add above the most recent Done entry), each rewritten as a closing summary in the same voice/detail level as the existing Done entries — include the extraction refactor correction (editor.js was over 400 lines) as a noted deviation from the original doc's task list, and the verified-live checks actually performed.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/backlog.md
git commit -m "docs: record media library management and crop-to-fill in backlog"
```

---

## Final check

- [ ] Run `.venv/Scripts/python -m pytest -q` one more time from the repo root — expect all tests green, no failures.
- [ ] Confirm `git log --oneline` on the branch shows one clean commit per task above (8 commits for this batch).
- [ ] Whole-branch review, then follow `superpowers:finishing-a-development-branch` (ask before merge/push, per `CLAUDE.md`).
