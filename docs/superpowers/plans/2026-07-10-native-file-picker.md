# Native File Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Add clip" opens a native OS file dialog instead of requiring a manually-typed path.

**Architecture:** A new `media.pick_file()` wraps `tkinter.filedialog.askopenfilename`; a thin `GET /api/pick-file` route exposes it; `editor.js`'s "Add clip" handler calls it first and falls through to the existing probe-and-add flow with whatever path comes back.

**Tech Stack:** Python 3.12+ stdlib `tkinter` (ships with the standard Windows CPython install — no new dependency), FastAPI, vanilla JS.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-native-file-picker-design.md` — read it first.
- Every source file starts with a 2–3 line header comment (what it does, what it exposes, key dependencies). Editing a file that lacks one? Add it. Changed what a file does? Update its header.
- `app/main.py` is composition only — no feature logic, ever.
- `pick_file` is a stated untested layer (opens a real native dialog) — verified manually, not by pytest.
- Tests pass (`pytest -q`) after every task; commit on branch `claude/status-355e49`; push.
- No secrets in code.

---

### Task 1: Backend — native file picker endpoint

**Files:**
- Modify: `app/media.py` (add `pick_file`)
- Modify: `app/main.py` (add `GET /api/pick-file` route)
- Modify: `CLAUDE.md` (inventory entry for `pick_file`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `media.pick_file() -> str | None`; HTTP `GET /api/pick-file` → `{"path": str | None}`.

- [ ] **Step 1: Implement `pick_file` in `app/media.py`.**

Add to the top of `app/media.py`, updating the header comment and imports:

```python
# Media helpers: ffprobe duration probing, safe local file serving, native file picker.
# Exposes ffprobe_cmd, probe_duration, media_response, run_export, pick_file. Depends on ffprobe on PATH.
import subprocess
import tkinter
from tkinter import filedialog
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse
```

Add this function anywhere after the imports (e.g. at the end of the file):

```python
def pick_file() -> str | None:
    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Choose a clip",
        filetypes=[("Video files", "*.mp4 *.mov *.mkv"), ("All files", "*.*")],
    )
    root.destroy()
    return path or None
```

- [ ] **Step 2: Add the route in `app/main.py`.**

Add after the existing `@app.get("/api/probe")` route:

```python
@app.get("/api/pick-file")
def pick_file() -> dict:
    return {"path": media.pick_file()}
```

- [ ] **Step 3: Run the existing test suite to confirm nothing broke.**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all existing tests still PASS (no new automated test — `pick_file` opens a real OS dialog and is verified manually in Task 2).

- [ ] **Step 4: Update `CLAUDE.md`.**

In the Inventory section, extend the `app/media.py` line to mention `pick_file`:

```
- `app/media.py` — `ffprobe_cmd`, `probe_duration`, `media_response` (serves a local file via FastAPI, 404s if missing), `run_export` (runs an ffmpeg command, raises `RuntimeError` with stderr on failure), `pick_file` (opens a native OS file-open dialog, returns the chosen path or `None`).
```

And extend the `app/main.py` line to mention the new route:

```
- `app/main.py` — FastAPI composition root: `GET /`, `POST/GET/PUT /api/projects[/{id}]`, `GET /api/probe`, `GET /api/pick-file`, `GET /media`, `POST /api/projects/{id}/export`, static mount at `/static`.
```

- [ ] **Step 5: Commit.**

```bash
git add app/media.py app/main.py CLAUDE.md
git commit -m "feat: native file picker endpoint"
```

---

### Task 2: Frontend — wire "Add clip" to the picker

**Files:**
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: `GET /api/pick-file` (Task 1).
- Produces: nothing new consumed by later code — this is the final UI wiring.

- [ ] **Step 1: Change the `addClip` function in `static/editor.js`.**

Replace:

```javascript
async function addClip() {
  const path = document.getElementById("clip-path").value.trim();
  if (!path) return;
```

with:

```javascript
async function addClip() {
  const pickRes = await fetch("/api/pick-file");
  const { path: pickedPath } = await pickRes.json();
  if (pickedPath) {
    document.getElementById("clip-path").value = pickedPath;
  }
  const path = document.getElementById("clip-path").value.trim();
  if (!path) return;
```

(The rest of `addClip` — probe, push clip, save, re-render — is unchanged.)

- [ ] **Step 2: Run the test suite (backend unaffected, confirm still green).**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (this task touches only untested JS).

- [ ] **Step 3: See it.** Start the server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open http://127.0.0.1:8000, click "Add clip" → **a native Windows file-open dialog appears**; pick an mp4 → **the path fills in, the clip is probed and appears in the clip list**, same as manual entry today. Click "Add clip" and press Cancel in the dialog → **nothing happens** (no path filled, no clip added).

- [ ] **Step 4: Commit.**

```bash
git add static/editor.js
git commit -m "feat: Add clip opens native file picker"
```

---

## Verification (whole feature)

1. `pytest -q` — all green.
2. Manual: click "Add clip" → native dialog opens → pick a real mp4 → it's added to the clip list and plays in preview, same as the existing manual-path flow.
3. Manual: click "Add clip" → cancel the dialog → no clip is added, no error shown.
