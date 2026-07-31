# Auto-Caption Transcription Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live percentage on the CAPTIONS panel's Auto-caption button while transcription runs (`Transcribing… 42%`), instead of a static label.

**Architecture:** Transcription moves from a blocking request to a background job using the app's existing generic job registry (`app/export_jobs.py`, already feature-agnostic despite its export-specific filename). The route returns a `job_id` immediately; the frontend polls a new status endpoint every 500ms and writes the percentage straight into the button's label, mirroring `export-progress.js`'s poll-and-update pattern for the EXPORT panel.

**Tech Stack:** FastAPI backend (Python), framework-free vanilla JS frontend, faster-whisper for transcription, pytest / `node --test` for tests.

## Global Constraints

- Reuse `app/export_jobs.py`'s `start_job`/`get_job`/`update_progress` as-is — no rename, no new job-registry module.
- Button label only — no visual progress bar element.
- No progress reporting during the initial ffmpeg audio-extraction step (starts at 0% until transcription itself begins).
- `transcribe_file`'s new `on_progress` parameter must default to `None` so all existing call sites and tests keep working unmodified.
- Re-load the project fresh from disk (not the copy loaded when the job started) immediately before merging in the new captions/preset and saving, to narrow the edit-clobbering race window.

---

### Task 1: `transcribe_file` progress callback

**Files:**
- Modify: `app/transcribe.py`
- Test: `tests/test_transcribe.py`

**Interfaces:**
- Consumes: nothing new (pure refactor of existing `_run_transcribe`/`transcribe_file`).
- Produces: `transcribe.transcribe_file(path: str, language: str | None = None, on_progress: Callable[[float], None] | None = None) -> list[CaptionWord]`. `on_progress`, when given, is called once per transcribed segment with a percentage (`0.0`–`100.0`, clamped) as `seg.end / info.duration * 100`, computed from faster-whisper's `(segments, info)` return value. `on_progress` is never called when `info.duration` is falsy (avoids a divide-by-zero and avoids emitting garbage percentages when duration is unknown).

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_transcribe.py` (after the existing tests, keep the existing `from types import SimpleNamespace as NS` and `from unittest.mock import patch` imports):

```python
def test_transcribe_file_calls_on_progress_per_segment():
    segments = [NS(end=1.0, words=None), NS(end=2.0, words=None), NS(end=4.0, words=None)]
    fake_model = NS(transcribe=lambda path, word_timestamps, language: (segments, NS(duration=4.0)))
    progress = []
    with patch("app.transcribe._get_model", return_value=fake_model):
        transcribe_file("audio.wav", on_progress=progress.append)
    assert progress == [25.0, 50.0, 100.0]

def test_transcribe_file_on_progress_clamps_to_100():
    segments = [NS(end=5.5, words=None)]
    fake_model = NS(transcribe=lambda path, word_timestamps, language: (segments, NS(duration=5.0)))
    progress = []
    with patch("app.transcribe._get_model", return_value=fake_model):
        transcribe_file("audio.wav", on_progress=progress.append)
    assert progress == [100.0]

def test_transcribe_file_skips_on_progress_when_duration_is_zero():
    segments = [NS(end=1.0, words=None)]
    fake_model = NS(transcribe=lambda path, word_timestamps, language: (segments, NS(duration=0.0)))
    progress = []
    with patch("app.transcribe._get_model", return_value=fake_model):
        transcribe_file("audio.wav", on_progress=progress.append)
    assert progress == []

def test_transcribe_file_works_without_on_progress():
    segments = [NS(end=1.0, words=[NS(word=" hi", start=0.0, end=1.0)])]
    fake_model = NS(transcribe=lambda path, word_timestamps, language: (segments, NS(duration=1.0)))
    with patch("app.transcribe._get_model", return_value=fake_model):
        result = transcribe_file("audio.wav")
    assert [w.text for w in result] == ["hi"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe.py -v`
Expected: the 4 new tests FAIL (`transcribe_file() got an unexpected keyword argument 'on_progress'` for the first three; the fourth currently passes already but re-run it alongside to confirm the suite is otherwise green before you touch the implementation).

- [ ] **Step 3: Implement the progress callback**

Replace `_run_transcribe` and `transcribe_file` in `app/transcribe.py`:

```python
def _run_transcribe(path: str, language: str | None, on_progress=None) -> list[CaptionWord]:
    segments, info = _get_model().transcribe(path, word_timestamps=True, language=language or None)
    collected = []
    for seg in segments:
        collected.append(seg)
        if on_progress is not None and info.duration:
            on_progress(min(100.0, seg.end / info.duration * 100))
    return words_from_segments(collected)

def transcribe_file(path: str, language: str | None = None, on_progress=None) -> list[CaptionWord]:
    """language is an ISO 639-1 code (e.g. "da"); None or "" auto-detects. on_progress, when given,
    is called with a 0-100 percent as each segment is transcribed (see _run_transcribe).

    A CUDA device can be present (so WhisperModel(...) constructs fine) without its CUDA
    Toolkit runtime libraries (cuBLAS) actually being installed — that failure only surfaces
    as a RuntimeError once transcription runs, not at model construction. On that error, retry
    once on CPU rather than failing every transcription outright.
    """
    try:
        return _run_transcribe(path, language, on_progress)
    except RuntimeError:
        _fall_back_to_cpu()
        return _run_transcribe(path, language, on_progress)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe.py -v`
Expected: all tests PASS (existing tests plus the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add app/transcribe.py tests/test_transcribe.py
git commit -m "Add progress callback to transcribe_file"
```

---

### Task 2: Background transcription job + status route

**Files:**
- Modify: `app/main.py` (the `transcribe_project` route, currently `app/main.py:155-181`)
- Test: `tests/test_transcribe_route.py` (full rewrite)

**Interfaces:**
- Consumes: `transcribe.transcribe_file(path, language=..., on_progress=...)` from Task 1; `export_jobs.start_job(run: Callable[[Callable[[float], None]], str]) -> str`, `export_jobs.get_job(job_id: str) -> dict | None` (both already exist, unchanged).
- Produces: `POST /api/projects/{pid}/transcribe` now returns `{"job_id": str}` (200) instead of the full `Project`. New `GET /api/transcribe-jobs/{job_id}` returns the job dict (`{status, percent, output_path, error}`, 404 if unknown) — same shape `GET /api/exports/{job_id}` already returns.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/test_transcribe_route.py`:

```python
# Tests for POST /api/projects/{pid}/transcribe: wiring only, mocks both ffmpeg and the model.
# Transcription runs as a background job (app.export_jobs) — tests force it synchronous via the
# module's injectable executor, then read state via GET /api/transcribe-jobs/{job_id}.
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.models import Project, CaptionWord, CaptionTrack, TextPreset
from app import store

client = TestClient(app)

def test_transcribe_creates_captions_and_preset(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[CaptionWord(text="hi", t_start=0.0, t_end=0.4)]):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    assert res.status_code == 200
    job_id = res.json()["job_id"]
    job = client.get(f"/api/transcribe-jobs/{job_id}").json()
    assert job["status"] == "done"

    saved = store.load_project(p.id, tmp_path)
    assert saved.captions.words[0].text == "hi"
    assert saved.captions.preset_id in saved.text_presets

def test_transcribe_overwrites_words_keeps_existing_preset_id(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    preset = TextPreset(name="Caption", size_px=50)
    p = Project(name="r", text_presets={preset.id: preset},
                captions=CaptionTrack(words=[CaptionWord(text="old", t_start=0, t_end=1)], preset_id=preset.id))
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[CaptionWord(text="new", t_start=0.0, t_end=0.4)]):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    job_id = res.json()["job_id"]
    assert client.get(f"/api/transcribe-jobs/{job_id}").json()["status"] == "done"

    saved = store.load_project(p.id, tmp_path)
    assert [w.text for w in saved.captions.words] == ["new"]
    assert saved.captions.preset_id == preset.id
    assert saved.text_presets[preset.id].size_px == 50

def test_transcribe_passes_captions_language_through(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    preset = TextPreset(name="Caption")
    p = Project(name="r", text_presets={preset.id: preset},
                captions=CaptionTrack(words=[], preset_id=preset.id, language="da"))
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[]) as transcribe_mock:
        client.post(f"/api/projects/{p.id}/transcribe")

    assert transcribe_mock.call_args.kwargs["language"] == "da"

def test_transcribe_with_no_existing_captions_auto_detects(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[]) as transcribe_mock:
        client.post(f"/api/projects/{p.id}/transcribe")

    assert transcribe_mock.call_args.kwargs["language"] == ""

def test_transcribe_job_fails_when_ml_extra_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", side_effect=ImportError("faster_whisper not installed")):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    job_id = res.json()["job_id"]
    job = client.get(f"/api/transcribe-jobs/{job_id}").json()
    assert job["status"] == "failed"
    assert job["error"] == "Transcription not available on this deployment"

def test_transcribe_job_fails_when_runtime_fails(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file",
               side_effect=RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    job_id = res.json()["job_id"]
    job = client.get(f"/api/transcribe-jobs/{job_id}").json()
    assert job["status"] == "failed"
    assert job["error"] == "Transcription failed: Library cublas64_12.dll is not found or cannot be loaded"

def test_transcribe_status_returns_404_for_unknown_job(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    res = client.get("/api/transcribe-jobs/does-not-exist")
    assert res.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe_route.py -v`
Expected: FAIL — `res.json()["job_id"]` raises `KeyError` (the route still returns the full `Project` body), and `GET /api/transcribe-jobs/{id}` 404s (route doesn't exist yet).

- [ ] **Step 3: Implement the job-based route**

In `app/main.py`, replace the existing `transcribe_project` function (`app/main.py:155-181`) with:

```python
@app.post("/api/projects/{pid}/transcribe")
def transcribe_project(pid: str) -> dict:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_dir / f"{p.id[:8]}-audio.wav"
    language = p.captions.language if p.captions else ""

    def run(on_progress):
        media.run_export(ffmpeg_cmd.build_audio_cmd(p, str(wav_path)))
        try:
            words = transcribe.transcribe_file(str(wav_path), language=language, on_progress=on_progress)
        except ImportError:
            raise RuntimeError("Transcription not available on this deployment")
        except RuntimeError as e:
            raise RuntimeError(f"Transcription failed: {e}")

        fresh = store.load_project(pid, DATA_DIR)
        if fresh.captions:
            fresh.captions.words = words
        else:
            preset = TextPreset(name="Caption", size_px=72, x=540, y=1520, align="center",
                                 highlight_color="#FFD400", highlight_mode="current_word",
                                 box_width_mode="fixed", box_height_mode="fixed", box_width=900, box_height=350)
            fresh.text_presets[preset.id] = preset
            fresh.captions = CaptionTrack(words=words, preset_id=preset.id)
        store.save_project(fresh, DATA_DIR)
        return pid

    job_id = export_jobs.start_job(run)
    return {"job_id": job_id}

@app.get("/api/transcribe-jobs/{job_id}")
def transcribe_status(job_id: str) -> dict:
    job = export_jobs.get_job(job_id)
    if job is None:
        raise HTTPException(404, f"unknown transcribe job: {job_id}")
    return job
```

`export_jobs` is already imported at the top of `app/main.py` (used by the export route) — no new import needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe_route.py -v`
Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests PASS (confirms nothing else imported the old `Project`-returning shape of this route).

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_transcribe_route.py
git commit -m "Run transcription as a background job with a status endpoint"
```

---

### Task 3: Frontend API wrappers for the transcription job

**Files:**
- Create: `static/api-transcribe-project.js`
- Create: `static/api-transcribe-status.js`
- Modify: `static/index.html` (register the two new scripts)

**Interfaces:**
- Consumes: `POST /api/projects/{pid}/transcribe` and `GET /api/transcribe-jobs/{job_id}` from Task 2.
- Produces: `Api.transcribeProject(projectId) -> Promise<{job_id: string}>` (throws on non-2xx). `Api.transcribeStatus(jobId) -> Promise<{status, percent, error}>` (throws on non-2xx).

This is a plain frontend addition with no test runner coverage of its own (no dependency-free pure logic to unit test — it's a thin `fetch` wrapper, same as its siblings `api-export-project.js`/`api-export-status.js`), so this task is verified by the manual browser check in Task 5 exercising the whole flow end to end. There is no failing-test step here.

- [ ] **Step 1: Create `static/api-transcribe-project.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Starts a background transcription job for `projectId`. Returns { job_id }. Throws on a non-2xx
// response. Poll progress/result via Api.transcribeStatus(job_id).
window.Api.transcribeProject = async function transcribeProject(projectId) {
  const res = await fetch(`/api/projects/${projectId}/transcribe`, { method: "POST" });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};
```

- [ ] **Step 2: Create `static/api-transcribe-status.js`**

```js
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Fetches the current state of a background transcription job started by Api.transcribeProject.
// Returns { status: "running"|"done"|"failed", percent, output_path, error }. Throws on a
// non-2xx response (e.g. unknown job id).
window.Api.transcribeStatus = async function transcribeStatus(jobId) {
  const res = await fetch(`/api/transcribe-jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};
```

- [ ] **Step 3: Register both scripts in `static/index.html`**

Add right after the existing `api-export-project.js` and `api-export-status.js` tags (`static/index.html:750` and `static/index.html:757`):

```html
<script src="/static/api-export-project.js"></script>
<script src="/static/api-transcribe-project.js"></script>
```

```html
<script src="/static/api-export-status.js"></script>
<script src="/static/api-transcribe-status.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add static/api-transcribe-project.js static/api-transcribe-status.js static/index.html
git commit -m "Add Api.transcribeProject/transcribeStatus"
```

---

### Task 4: Progress poller

**Files:**
- Create: `static/caption-transcribe-progress.js`
- Modify: `static/index.html` (register the new script)

**Interfaces:**
- Consumes: `Api.transcribeStatus(jobId)` from Task 3.
- Produces: `window.CaptionTranscribeProgress.start(jobId: string, callbacks: {onDone: () => void, onFailed: (message: string) => void}) -> void`. Polls every 500ms; on each `running` tick, writes `Transcribing… {percent}%` into `#caption-auto-caption-btn`'s `.button-label` span; calls `onDone()` once, with no arguments, when the job reaches `status: "done"`; calls `onFailed(message)` once when the job reaches `status: "failed"` or a poll request itself throws.

No unit-test coverage for this file, matching its structural twin `export-progress.js` (also untested — a thin DOM-polling wrapper, verified live in the browser per that file's precedent, per the design spec's "Testing" section).

- [ ] **Step 1: Create `static/caption-transcribe-progress.js`**

```js
// Polls a background transcription job (Api.transcribeStatus) every 500ms and writes the live
// percentage into the Auto-caption button's label. Exposes window.CaptionTranscribeProgress.start.
window.CaptionTranscribeProgress = window.CaptionTranscribeProgress || {};

(() => {
  const POLL_MS = 500;
  let pollHandle = null;

  function setLabel(text) {
    const btn = document.getElementById("caption-auto-caption-btn");
    const label = btn && btn.querySelector(".button-label");
    if (label) label.textContent = text;
  }

  async function poll(jobId, callbacks) {
    let job;
    try {
      job = await Api.transcribeStatus(jobId);
    } catch (err) {
      callbacks.onFailed(err.message);
      return;
    }
    if (job.status === "running") {
      setLabel(`Transcribing… ${Math.round(job.percent)}%`);
      pollHandle = setTimeout(() => poll(jobId, callbacks), POLL_MS);
      return;
    }
    if (job.status === "done") {
      callbacks.onDone();
    } else {
      callbacks.onFailed(job.error);
    }
  }

  function start(jobId, callbacks) {
    clearTimeout(pollHandle);
    setLabel("Transcribing… 0%");
    poll(jobId, callbacks);
  }

  window.CaptionTranscribeProgress.start = start;
})();
```

- [ ] **Step 2: Register the script in `static/index.html`**

Add right before the `caption-panel-auto-caption.js` tag (`static/index.html:803`):

```html
<script src="/static/caption-transcribe-progress.js"></script>
<script src="/static/caption-panel-auto-caption.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add static/caption-transcribe-progress.js static/index.html
git commit -m "Add CaptionTranscribeProgress poller"
```

---

### Task 5: Wire the Auto-caption button to the job + poller

**Files:**
- Modify: `static/caption-panel-auto-caption.js`

**Interfaces:**
- Consumes: `Api.transcribeProject` (Task 3), `CaptionTranscribeProgress.start` (Task 4), plus the existing globals this file already reaches into (`project`, `ensureCaptionTrack`, `renderCaptionPanel`, `AudioTrackPanel.render`, `renderTimeline`).
- Produces: `runAutoCaption()` (unchanged name/signature — still a zero-arg global function, still bound to `#caption-auto-caption-btn`'s click event).

Note: the current implementation reads `btn.querySelector(".label")`, but `#caption-auto-caption-btn` is a `[data-button]` hydration site (`static/index.html:278`) built by `UI.button` (`static/ui-button.js:36-39`), whose label span carries the class `.button-label`, not `.label`. `.label` matches nothing, so today `label` is `null` and `label.textContent = "Transcribing…"` throws before the `fetch` even starts — this task fixes that as part of rewriting the same lines.

- [ ] **Step 1: Replace `static/caption-panel-auto-caption.js`**

```js
// CAPTIONS panel's Auto tab: the Auto-caption button — runs transcription as a background job and
// merges the result into `project`. Exposes the global runAutoCaption(), also called by
// clip-sequence.js and editor.js when an audible clip is added (auto-caption-on-clip-add). Reaches
// into editor.js's project/renderTimeline and panel-captions.js's ensureCaptionTrack/renderCaptionPanel
// globals. Transcription progress is shown as a live percentage via CaptionTranscribeProgress,
// which polls the job started here.

// The button's disabled/label state only has a visible effect when the CAPTIONS panel's Auto tab
// happens to be open; otherwise this just quietly updates captions/timeline once done, same
// "background enhancement, no loading UI" pattern as thumbnail/waveform/filmstrip fetches
// elsewhere in this app. Failures (e.g. the `ml` extra not installed, or no usable transcription
// backend) surface in #caption-transcribe-error.
async function runAutoCaption() {
  ensureCaptionTrack();
  const btn = document.getElementById("caption-auto-caption-btn");
  const label = btn.querySelector(".button-label");
  const errorEl = document.getElementById("caption-transcribe-error");
  errorEl.hidden = true;
  btn.disabled = true;
  label.textContent = "Transcribing… 0%";
  try {
    const { job_id } = await Api.transcribeProject(project.id);
    await new Promise((resolve) => {
      CaptionTranscribeProgress.start(job_id, {
        onDone: async () => {
          project = await (await fetch(`/api/projects/${project.id}`)).json();
          await renderCaptionPanel();   // repopulates the CAPTIONS transcript list, even while hidden
          AudioTrackPanel.render();     // refreshes VIDEO panel's AUTO SILENCE no-transcript hint
          renderTimeline();
          resolve();
        },
        onFailed: (message) => {
          errorEl.textContent = message || "Transcription failed.";
          errorEl.hidden = false;
          resolve();
        },
      });
    });
  } catch {
    errorEl.textContent = "Transcription failed: could not reach the server.";
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    label.textContent = "Auto-caption";
  }
}

document.getElementById("caption-auto-caption-btn").addEventListener("click", runAutoCaption);
```

- [ ] **Step 2: Run the frontend test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: all tests PASS (this file has no dedicated `node --test` coverage — this run just confirms the edit didn't break any pure-module test elsewhere, e.g. `no-raw-svg.test.js`).

- [ ] **Step 3: Manual verification in the browser**

Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`.

On a **throwaway** project (never real project data — the app's unload handler flushes in-memory state to disk):
1. Import a clip with real speech at least a few seconds long, add it to the MAIN sequence.
2. Open the CAPTIONS panel's Auto tab.
3. Click "Auto-caption".
4. Confirm the button label counts up through percentages (e.g. `Transcribing… 0%` → `Transcribing… 37%` → …) rather than staying static, then returns to "Auto-caption" once done.
5. Confirm the transcript populated (Closed-caption tab shows words) and the caption preview renders on stage.
6. Trigger a failure path by stopping the server mid-transcription (or transcribing on a project whose media path is invalid) and confirm `#caption-transcribe-error` shows a message and the button re-enables.

- [ ] **Step 4: Commit**

```bash
git add static/caption-panel-auto-caption.js
git commit -m "Show live transcription percentage on the Auto-caption button"
```
