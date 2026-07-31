# Lockable Overlay Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user lock a TEXT / VIDEO BOX / IMAGE BOX overlay layer so it can't be accidentally drag-reordered on the timeline, with a lock icon replacing the drag handle; MAIN and AUDIO always show a static "always locked" icon since they were never reorderable.

**Architecture:** One new `locked: bool = False` field on `TextBlockLayer`/`VideoBoxLayer`/`ImageBoxLayer` (`app/models.py`), persisted with the rest of the project JSON. The frontend's existing overlay-lane label icon (`.overlay-lane-handle`, `static/timeline.js`) swaps between a `grip-vertical` icon (unlocked, hover-reveal, draggable) and a `lock` icon (locked, always visible, not draggable); a plain click (no drag movement) on that icon toggles the field. MAIN/AUDIO get a separate, non-interactive static lock icon since they're outside the overlay stack entirely.

**Tech Stack:** FastAPI + Pydantic (`app/models.py`), vanilla JS DOM modules (`static/timeline.js`, `static/timeline-overlay-layer-drag.js`), CSS (`static/css/components/timeline.css`), pytest for the model, manual browser verification for the DOM/CSS (this codebase's existing convention for thin UI wiring — see `docs/superpowers/specs/2026-07-31-locked-overlay-layers-design.md`'s Testing section).

## Global Constraints

- `locked` defaults to `False` on all three layer types so existing saved projects load unaffected (spec: Data model).
- No new API route — `locked` rides along with the existing project PUT/save (spec: Data model).
- Locking only disables the timeline drag-reorder gesture; it must never affect stage selection, move, or resize (spec: Explicitly out of scope).
- CAPTIONS is not part of the overlay stack and gets no lock field or icon (spec: Explicitly out of scope).
- MAIN/AUDIO lock icons are static/non-interactive — no toggle, no model field (spec: Fixed rows).
- Every `static/*.js` file's own top-of-file header comment must be updated when its role changes (project CLAUDE.md convention).
- No hand-inlined `<svg>` — use `UI.icon("lock", {size: 14})` / `UI.icon("grip-vertical", {size: 14})`, both already defined in `static/ui-icon.js`'s `ICON_PATHS`.

---

### Task 1: `locked` field on TextBlockLayer / VideoBoxLayer / ImageBoxLayer

**Files:**
- Modify: `app/models.py:38-53` (VideoBoxLayer), `app/models.py:55-69` (ImageBoxLayer), `app/models.py:162-169` (TextBlockLayer)
- Test: `tests/test_models.py`

**Interfaces:**
- Produces: `VideoBoxLayer.locked: bool` (default `False`), `ImageBoxLayer.locked: bool` (default `False`), `TextBlockLayer.locked: bool` (default `False`) — read/written directly as plain Pydantic fields, no custom migration needed since the default reproduces old behavior exactly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_models.py`:

```python
def test_video_box_layer_locked_defaults_false():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920)
    assert v.locked is False

def test_image_box_layer_locked_defaults_false():
    b = ImageBoxLayer(media_id="m1", file_path="pic.jpg", height=1920)
    assert b.locked is False

def test_text_block_layer_locked_defaults_false():
    t = TextBlockLayer(heading="H", preset_id="x")
    assert t.locked is False

def test_locked_field_round_trips_true():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920, locked=True)
    assert VideoBoxLayer.model_validate_json(v.model_dump_json()).locked is True
    b = ImageBoxLayer(media_id="m1", file_path="pic.jpg", height=1920, locked=True)
    assert ImageBoxLayer.model_validate_json(b.model_dump_json()).locked is True
    t = TextBlockLayer(heading="H", preset_id="x", locked=True)
    assert TextBlockLayer.model_validate_json(t.model_dump_json()).locked is True

def test_layers_saved_before_the_lock_feature_load_with_locked_false():
    # Projects saved before this feature carry no "locked" key at all; they must load unchanged.
    v = VideoBoxLayer.model_validate({"media_id": "m1", "file_path": "a.mp4", "out_point": 5.0, "height": 1920})
    b = ImageBoxLayer.model_validate({"media_id": "m1", "file_path": "pic.jpg", "height": 1920})
    t = TextBlockLayer.model_validate({"heading": "H", "preset_id": "x"})
    assert v.locked is False and b.locked is False and t.locked is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k locked -v`
Expected: FAIL — `AttributeError` / `ValidationError` mentioning `locked` is not a known field, on every new test.

- [ ] **Step 3: Add the field to all three layer classes**

In `app/models.py`, `VideoBoxLayer` (currently ends at line 53 with `mask_flip: bool = False # which side of the line is kept`), add immediately after that line, still inside the class:

```python
    locked: bool = False       # blocks timeline drag-reorder in the overlay stack; stage move/resize unaffected
```

In `ImageBoxLayer` (currently ends at line 69 with the same `mask_flip` line), add the identical line immediately after it, still inside the class.

In `TextBlockLayer` (currently ends at line 169 with `formatting_runs: list[FormatRun] = []   # sparse per-range style overrides; [] = today's flat-style rendering`), add immediately after it, still inside the class:

```python
    locked: bool = False           # blocks timeline drag-reorder in the overlay stack; stage move/resize unaffected
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_models.py -k locked -v`
Expected: PASS (5 new tests)

- [ ] **Step 5: Run the full backend test suite to confirm nothing else broke**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (all tests, no regressions — `locked` defaulting `False` must not change any existing `model_dump_json()`/equality assertion elsewhere, since Pydantic model equality compares all fields but every other test constructs objects without `locked`, so both sides default identically)

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "Add locked field to TextBlockLayer/VideoBoxLayer/ImageBoxLayer"
```

---

### Task 2: Lock/unlock toggle on overlay lanes (TEXT / VIDEO BOX / IMAGE BOX)

**Files:**
- Modify: `static/timeline.js` (renderOverlaysRow's lane-label icon, ~line 276-284)
- Modify: `static/timeline-overlay-layer-drag.js` (mousedown handler)
- Modify: `static/css/components/timeline.css` (`.overlay-lane-handle` rules, ~line 322-331)

**Interfaces:**
- Consumes: `entry.item.locked` (boolean, from Task 1's model field, reached via `OverlayLayers.mergedEntries(project)` — `entry.item` is the live `TextBlockLayer`/`VideoBoxLayer`/`ImageBoxLayer` object, already used this way by `timeline-overlay-layer-drag.js`'s existing reorder logic)
- Consumes: `UI.icon(name, {size})` (`static/ui-icon.js`) — `"lock"` and `"grip-vertical"` are both already defined
- Consumes: global `saveProject()` / `renderTimeline()` (defined in `static/editor.js`, already used by `timeline-overlay-layer-drag.js`)
- Produces: no new exports — this task only changes rendering/interaction inside the existing `.overlay-lane-handle` DOM spot

- [ ] **Step 1: Update `renderOverlaysRow`'s lane-label icon to reflect `locked`**

In `static/timeline.js`, find this block (around line 276-284):

```javascript
    for (const entry of entries) {
      const laneLabel = document.createElement("div");
      laneLabel.className = "row-label overlay-lane-label";
      laneLabel.dataset.entryId = entry.id;
      laneLabel.innerHTML = `<span class="overlay-lane-handle">${UI.icon("grip-vertical", { size: 14 })}</span>`;
      const text = document.createElement("span");
      text.textContent = entry.kind === "text" ? "TEXT" : entry.kind === "video_box" ? "VIDEO BOX" : "IMAGE BOX";
      laneLabel.appendChild(text);
      labelContainer.appendChild(laneLabel);
```

Replace it with:

```javascript
    for (const entry of entries) {
      const laneLabel = document.createElement("div");
      laneLabel.className = "row-label overlay-lane-label" + (entry.item.locked ? " locked" : "");
      laneLabel.dataset.entryId = entry.id;
      const handleIcon = entry.item.locked ? "lock" : "grip-vertical";
      laneLabel.innerHTML = `<span class="overlay-lane-handle">${UI.icon(handleIcon, { size: 14 })}</span>`;
      const text = document.createElement("span");
      text.textContent = entry.kind === "text" ? "TEXT" : entry.kind === "video_box" ? "VIDEO BOX" : "IMAGE BOX";
      laneLabel.appendChild(text);
      labelContainer.appendChild(laneLabel);
```

- [ ] **Step 2: Update the file header comment**

In `static/timeline.js`, find the comment above `renderOverlaysRow` (starts `// Merges TEXT blocks + VIDEO BOX + IMAGE BOX layers into one z_index-ordered stack...`, ends `...static/timeline-overlay-layer-drag.js via OverlayLayers.mergedEntries/renumber.`). Add one sentence to the end of that comment block, right before the `function renderOverlaysRow(...)` line:

```javascript
  // A lane with entry.item.locked shows a "lock" icon instead of "grip-vertical" and is not
  // draggable — see static/timeline-overlay-layer-drag.js for the click-to-toggle/drag-skip logic.
  function renderOverlaysRow(project, px, selected, onSelect) {
```

- [ ] **Step 3: Update `timeline-overlay-layer-drag.js`'s mousedown handler to skip dragging and toggle lock on click**

Read the current file at `static/timeline-overlay-layer-drag.js` — it's small (61 lines). Replace the entire `labelCol.addEventListener("mousedown", ...)` block (lines 16-60) with:

```javascript
  labelCol.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".overlay-lane-handle");
    if (!handle) return;
    const laneLabel = handle.closest(".overlay-lane-label");
    const entryId = laneLabel.dataset.entryId;

    const entries = OverlayLayers.mergedEntries(project);
    const entry = entries.find((en) => en.id === entryId);
    if (!entry) return;
    const wasLocked = !!entry.item.locked;

    const startY = e.clientY;
    let dragging = false;

    const onMove = (moveEvent) => {
      if (wasLocked) return;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.abs(dy) > THRESHOLD_PX) {
        dragging = true;
        laneLabel.classList.add("dragging");
      }
      if (!dragging) return;
      laneLabel.style.transform = `translateY(${dy}px)`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      laneLabel.classList.remove("dragging");
      laneLabel.style.transform = "";

      if (!dragging) {
        // Plain click (no drag movement): toggle the lock, regardless of prior state.
        entry.item.locked = !wasLocked;
        saveProject();
        renderTimeline();
        return;
      }

      const freshEntries = OverlayLayers.mergedEntries(project);
      const fromIndex = freshEntries.findIndex((en) => en.id === entryId);
      if (fromIndex === -1) return;
      const colRect = labelCol.getBoundingClientRect();
      const contentY = upEvent.clientY - colRect.top;
      const toIndex = Math.max(0, Math.min(freshEntries.length - 1, Math.floor(contentY / LANE_HEIGHT)));
      if (toIndex === fromIndex) return;

      const reordered = [...freshEntries];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      OverlayLayers.renumber(reordered);
      saveProject();
      renderTimeline();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
```

This preserves the exact existing reorder behavior for unlocked lanes (same threshold, same drop-index math) while adding: (a) a locked lane never enters `dragging` state (its `onMove` returns immediately), so a mousedown+drag on a locked lane is inert; (b) any lane, locked or not, toggles `locked` on a plain click (mouseup with no drag movement) instead of the old `if (!dragging) return;` no-op.

- [ ] **Step 4: Update the file header comment**

In `static/timeline-overlay-layer-drag.js`, replace the header comment (lines 1-9) with:

```javascript
// Lock/unlock toggle + drag-to-reorder for the unified overlay z-order stack. A plain click
// (mousedown+mouseup with no vertical movement) on a lane's .overlay-lane-handle
// (static/timeline.js's renderOverlaysRow) toggles that entry's `locked` field and re-renders.
// When unlocked, mousedown+vertical drag past a threshold instead reorders that entry (a text
// block, video box, or image box) among all overlay lanes; a locked entry's drag-follow logic
// is skipped entirely, so only the click-to-unlock path is reachable for it. Releasing a real
// drag renumbers every entry's z_index to match the new order (OverlayLayers.renumber), saves,
// and re-renders. Delegated on #label-overlays itself (persists across renders; its children
// are rebuilt by Timeline.render). Depends on window.OverlayLayers (timeline-overlay-layers.js)
// and editor.js's project/saveProject/renderTimeline globals.
```

- [ ] **Step 5: Make the locked icon always visible (not hover-gated) in CSS**

In `static/css/components/timeline.css`, find (around line 322-331):

```css
.overlay-lane-handle {
```

Read the surrounding ~15 lines first to get the exact existing rule body, then add this new rule immediately after the existing `.overlay-lane-label:hover .overlay-lane-handle { opacity: 1; }` rule:

```css
.overlay-lane-label.locked .overlay-lane-handle {
  opacity: 1;
  cursor: pointer;
}
```

This must come after the `:hover` rule in source order so it isn't overridden by it at equal specificity for a locked-but-not-hovered lane (both rules have identical specificity; CSS applies the later one).

- [ ] **Step 6: Start the dev server and verify manually in the browser**

Use the `run` skill or start the server directly:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` in the Browser tool against a throwaway test project (never a real project — see the project's `feedback_live_verify_throwaway_project` memory). Add a TEXT block. In the timeline's overlay row:
1. Hover the TEXT lane's label — confirm the grip-vertical icon appears (unchanged behavior).
2. Click the grip icon (no drag) — confirm it swaps to a lock icon that stays visible without hovering, and the lane can no longer be dragged to reorder (mousedown+drag does nothing).
3. Click the lock icon — confirm it swaps back to the grip and dragging works again (add a second TEXT block or video/image box first so there's something to reorder against).
4. Reload the page — confirm the locked state (from step 2, if left locked) persisted.

- [ ] **Step 7: Commit**

```bash
git add static/timeline.js static/timeline-overlay-layer-drag.js static/css/components/timeline.css
git commit -m "Add lock/unlock toggle to timeline overlay layer lanes"
```

---

### Task 3: Static "always locked" icon on MAIN / AUDIO rows

**Files:**
- Modify: `static/timeline.js` (new `ensureFixedRowLockIcons()`, called from `render()`)
- Modify: `static/css/components/timeline.css` (new `.row-label-lock` rule)

**Interfaces:**
- Consumes: `UI.icon("lock", {size: 14})` (`static/ui-icon.js`)
- Consumes: `UI.tooltip.observe` auto-hydration (`static/ui-tooltip.js`) — already runs against `document.body` from that file's own bottom; a `title` attribute set here is picked up automatically, no explicit call needed
- Produces: no new exports; `ensureFixedRowLockIcons()` is a private function only called from this file's own `render()`

- [ ] **Step 1: Add `ensureFixedRowLockIcons()` and call it from `render()`**

In `static/timeline.js`, find the `render(project, timelineTime, selected, onSelect, actions = {})` function (starts around line 316, right after `renderOverlaysRow`). Add the new function immediately before `render`:

```javascript
  // MAIN and AUDIO are fixed rows outside the draggable overlay stack (unlike TEXT/VIDEO
  // BOX/IMAGE BOX, they were never reorderable in the first place) — this is a purely static
  // visual cue, not a per-layer toggle, so it's rendered once and left alone rather than
  // rebuilt every render() the way overlay lanes are.
  function ensureFixedRowLockIcons() {
    for (const rowName of ["video", "audio"]) {
      const label = document.getElementById(`label-${rowName}`);
      if (!label || label.querySelector(".row-label-lock")) continue;
      const icon = document.createElement("span");
      icon.className = "row-label-lock";
      icon.innerHTML = UI.icon("lock", { size: 14 });
      icon.title = "Always locked";
      label.prepend(icon);
    }
  }

```

Then, inside `render()`, add a call to it. Find the first line of `render()`'s body:

```javascript
  function render(project, timelineTime, selected, onSelect, actions = {}) {
    const clips = ordered(project.clips || []);
```

Replace with:

```javascript
  function render(project, timelineTime, selected, onSelect, actions = {}) {
    ensureFixedRowLockIcons();
    const clips = ordered(project.clips || []);
```

- [ ] **Step 2: Update the file's top header comment to mention the new icon**

In `static/timeline.js`, the file's top comment block (lines 1-38) currently ends with:

```javascript
// Exposes window.Timeline.{render, groupWords, timeAtX, tick, resetZoom, PX_PER_SEC}.
// PX_PER_SEC is a live getter reflecting the current zoom level (see the header comment
// above for the zoom scale itself). tick() is a cheap playhead-only update driven every
// animation frame during playback (see editor.js), so motion stays smooth between the
// heavier full render() calls. Depends on Preview (preview.js).
```

Add one sentence right before the `Exposes window.Timeline...` line:

```javascript
// MAIN and AUDIO's labels get a static, non-interactive lock icon (ensureFixedRowLockIcons,
// idempotent, called from render()) signaling they can never be reordered — see the overlay
// row's own per-layer lock toggle in renderOverlaysRow/timeline-overlay-layer-drag.js instead.
// Exposes window.Timeline.{render, groupWords, timeAtX, tick, resetZoom, PX_PER_SEC}.
```

- [ ] **Step 3: Style the static lock icon**

In `static/css/components/timeline.css`, find the block with `#label-video { height: 56px; }` / `#label-audio { height: var(--control-height-md); }` (around line 93-94). Add immediately after it:

```css
.row-label-lock {
  display: inline-flex;
  align-items: center;
  color: var(--text-dim);
  margin-right: var(--space-1);
}
```

(`--space-1` and `--text-dim` are existing tokens already used throughout this stylesheet family — e.g. `.tick` uses `var(--text-dim)` at line 164 of this same file.)

- [ ] **Step 4: Start the dev server and verify manually in the browser**

Reuse the running dev server from Task 2 (or start it per Task 2 Step 6) against the same throwaway test project. Confirm:
1. The MAIN row's label reads a small lock icon followed by "MAIN".
2. The AUDIO row's label reads a small lock icon followed by "AUDIO" (or is hidden entirely if the row has no content — `setRowVisible` still applies; the icon should be inside the label whenever the label itself is visible).
3. Reload the page and re-render (e.g. add/remove a clip) — confirm the icon does not duplicate (idempotency check for `ensureFixedRowLockIcons`'s `querySelector` guard).
4. Confirm hovering the icon shows a "Always locked" tooltip (via `UI.tooltip`'s auto-hydration of the `title` attribute).

- [ ] **Step 5: Commit**

```bash
git add static/timeline.js static/css/components/timeline.css
git commit -m "Add static always-locked icon to MAIN/AUDIO timeline rows"
```

---

### Task 4: Update codebase map

**Files:**
- Modify: `CLAUDE.md` (project instructions file, codebase map section — entries for `app/models.py`, `static/timeline.js`, `static/timeline-overlay-layer-drag.js`, `static/css/components/timeline.css` under "Unified overlay layer stack (z-order)")

**Interfaces:**
- Consumes: nothing (documentation-only task)
- Produces: nothing (documentation-only task)

- [ ] **Step 1: Update the "Unified overlay layer stack (z-order)" section**

In `CLAUDE.md`, find the section starting `### Unified overlay layer stack (z-order)`. In its bullet list, update the line starting `- \`z_index\` fields on \`TextBlockLayer\`, \`CaptionTrack\`, \`VideoBoxLayer\`, \`ImageBoxLayer\`...` by appending a new sentence to the end of that bullet:

```
 As of 2026-07-31 (locked overlay layers), `TextBlockLayer`/`VideoBoxLayer`/`ImageBoxLayer` also carry a `locked: bool = False` field (not `CaptionTrack`, which stays outside the overlay stack) blocking only the timeline drag-reorder gesture below — stage selection/move/resize are unaffected.
```

Update the bullet starting `- \`static/timeline-overlay-layer-drag.js\` — drag-to-reorder gesture...` by appending:

```
 As of 2026-07-31, a plain click (no drag movement) on a lane's handle toggles that entry's `locked` field instead of being a no-op, and a locked lane's mousedown never enters drag-follow state.
```

Update the bullet starting `- \`static/timeline.js\` — \`renderOverlaysRow(project, px, selected, onSelect)\`...` by appending:

```
 As of 2026-07-31, each lane's handle renders `UI.icon("lock")` instead of `UI.icon("grip-vertical")` when `entry.item.locked`, and a new `ensureFixedRowLockIcons()` (called from `render()`, idempotent) prepends a static non-interactive lock icon to the MAIN/AUDIO row labels, since those rows were never part of the draggable overlay stack.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Update codebase map for locked overlay layers feature"
```
