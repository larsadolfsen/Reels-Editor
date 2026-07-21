# Export Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn export from a synchronous POST (blocks until ffmpeg finishes) into a background job the client polls, with a progress bar in the EXPORT panel driven by ffmpeg's `-progress` output.

**Architecture:** A new in-memory job registry (`app/export_jobs.py`) runs the export in a background thread (real `threading.Thread` in production, an injectable synchronous executor in tests) and exposes `start_job`/`get_job`/`update_progress`. `app/media.py`'s `run_export` grows an optional `on_progress`/`total_duration` pair: when both are given it appends `-progress pipe:1 -nostats` to the ffmpeg command, streams stdout line-by-line through a pure `percent_from_progress_line()` parser, and still captures stderr (via a temp file, not a second pipe, to avoid a stdout/stderr pipe deadlock) for the existing failure message. `POST /api/projects/{id}/export` now returns `{job_id}` immediately; a new `GET /api/exports/{job_id}` reports `{status, percent, output_path, error}`. The frontend gets a thin poller (`static/export-progress.js`) that drives a progress-bar fill-div in `#panel-export` every 500ms until done/failed.

**Tech Stack:** Python stdlib `threading`/`subprocess`/`tempfile` (no new dependencies), vanilla JS matching the existing `window.Api.*`/`window.UI.*` conventions, no new CSS framework.

## Global Constraints

- No JS build step/bundler — icon SVGs hand-inlined, `window.Api.*`/`window.UI.*` one-function-per-file convention (per `CLAUDE.md`).
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — styling lives in `static/css/components/*.css`.
- Every `static/*.js` and `static/css/**/*.css` file opens with a 1-2 line purpose comment; every `app/*.py` file opens with a 2-3 line header (what it does, what it exposes, key dependencies).
- Tests: `.venv/Scripts/python -m pytest -q`. `pytest` mocks all subprocess calls — ffmpeg/ffprobe are not required to run the suite.
- Jobs are in-memory only, never persisted — a server restart forgets in-flight jobs (per design, out of scope to change).
- Cancelling exports and concurrent-export queuing are explicitly out of scope (design doc `docs/superpowers/specs/2026-07-20-export-progress-design.md`).
- `app/timeline.sequence_duration` takes `clips: list[ClipLayer]`, not a `Project` — call it as `sequence_duration(ordered(p.clips))`.

---

## Task 1: `app/export_jobs.py` job registry

**Files:**
- Create: `app/export_jobs.py`
- Test: `tests/test_export_jobs.py`

**Interfaces:**
- Produces: `start_job(run: Callable[[Callable[[float], None]], str]) -> str` (registers a job, executes `run(on_progress) -> output_path` via the module's swappable `_executor`, returns the new job id). `get_job(job_id: str) -> dict | None` (returns `{status, percent, output_path, error}` or `None` if unknown). `update_progress(job_id: str, percent: float) -> None` (no-ops for unknown/non-running jobs). Module attribute `_executor: Callable[[Callable[[], None]], None]`, default spawns a daemon `threading.Thread`; tests monkeypatch it to `lambda fn: fn()` for deterministic synchronous execution.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_export_jobs.py
# Tests for app.export_jobs: registry lifecycle (start -> progress -> done/failed), unknown id,
# using a synchronous executor injected via monkeypatch so job state is deterministic.
import app.export_jobs as export_jobs

def test_start_job_runs_synchronously_and_marks_done(monkeypatch):
    monkeypatch.setattr(export_jobs, "_executor", lambda fn: fn())

    def run(on_progress):
        on_progress(50.0)
        return "/out.mp4"

    job_id = export_jobs.start_job(run)
    job = export_jobs.get_job(job_id)
    assert job["status"] == "done"
    assert job["percent"] == 100.0
    assert job["output_path"] == "/out.mp4"
    assert job["error"] is None

def test_start_job_marks_failed_on_exception(monkeypatch):
    monkeypatch.setattr(export_jobs, "_executor", lambda fn: fn())

    def run(on_progress):
        raise RuntimeError("ffmpeg exploded")

    job_id = export_jobs.start_job(run)
    job = export_jobs.get_job(job_id)
    assert job["status"] == "failed"
    assert job["error"] == "ffmpeg exploded"
    assert job["output_path"] is None

def test_get_job_unknown_id_returns_none():
    assert export_jobs.get_job("nonexistent") is None

def test_update_progress_updates_percent_of_running_job(monkeypatch):
    monkeypatch.setattr(export_jobs, "_executor", lambda fn: None)  # never actually runs
    job_id = export_jobs.start_job(lambda on_progress: "/out.mp4")
    assert export_jobs.get_job(job_id)["status"] == "running"
    export_jobs.update_progress(job_id, 42.0)
    assert export_jobs.get_job(job_id)["percent"] == 42.0

def test_update_progress_ignored_after_job_done(monkeypatch):
    monkeypatch.setattr(export_jobs, "_executor", lambda fn: fn())
    job_id = export_jobs.start_job(lambda on_progress: "/out.mp4")
    assert export_jobs.get_job(job_id)["percent"] == 100.0
    export_jobs.update_progress(job_id, 5.0)
    assert export_jobs.get_job(job_id)["percent"] == 100.0

def test_update_progress_unknown_id_does_not_raise():
    export_jobs.update_progress("nonexistent", 10.0)  # no-op, must not raise
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_export_jobs.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.export_jobs'`

- [ ] **Step 3: Write the implementation**

```python
# app/export_jobs.py
# In-memory export job registry: tracks background export jobs by id (status/percent/output_path/error).
# Exposes start_job/get_job/update_progress. Jobs are not persisted — a server restart forgets them.
import threading
from typing import Callable
from app.models import new_id

_jobs: dict[str, dict] = {}
_lock = threading.Lock()

def _spawn_thread(fn: Callable[[], None]) -> None:
    threading.Thread(target=fn, daemon=True).start()

_executor: Callable[[Callable[[], None]], None] = _spawn_thread

def update_progress(job_id: str, percent: float) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job is not None and job["status"] == "running":
            job["percent"] = percent

def start_job(run: Callable[[Callable[[float], None]], str]) -> str:
    """Registers a new job and executes run(on_progress) -> output_path via the module's
    executor (a real background thread by default; tests swap _executor for a synchronous
    call so job state is deterministic without waiting on a thread)."""
    job_id = new_id()
    with _lock:
        _jobs[job_id] = {"status": "running", "percent": 0.0, "output_path": None, "error": None}

    def execute() -> None:
        try:
            output_path = run(lambda percent: update_progress(job_id, percent))
        except Exception as e:
            with _lock:
                _jobs[job_id]["status"] = "failed"
                _jobs[job_id]["error"] = str(e)
            return
        with _lock:
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["percent"] = 100.0
            _jobs[job_id]["output_path"] = output_path

    _executor(execute)
    return job_id

def get_job(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job is not None else None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_export_jobs.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/export_jobs.py tests/test_export_jobs.py
git commit -m "feat: add in-memory export job registry"
```

---

## Task 2: pure `percent_from_progress_line()` parser

**Files:**
- Modify: `app/media.py` (add function, keep existing header comment accurate — add "parses ffmpeg -progress output" to its exposes list)
- Test: `tests/test_media.py`

**Interfaces:**
- Produces: `percent_from_progress_line(line: str, total_duration: float) -> float | None` — parses one line of ffmpeg's `-progress pipe:1` output; returns a 0-100 percent for an `out_time_us=` line when `total_duration > 0`, else `None` (caller skips other keys like `frame=`/`fps=`/`progress=continue`).

- [ ] **Step 1: Write the failing tests**

```python
# Add to tests/test_media.py
from app.media import percent_from_progress_line

def test_percent_from_progress_line_parses_out_time_us():
    assert percent_from_progress_line("out_time_us=2000000", 10.0) == 20.0

def test_percent_from_progress_line_ignores_non_out_time_keys():
    assert percent_from_progress_line("frame=120", 10.0) is None
    assert percent_from_progress_line("progress=continue", 10.0) is None

def test_percent_from_progress_line_clamps_to_100():
    assert percent_from_progress_line("out_time_us=999999999", 10.0) == 100.0

def test_percent_from_progress_line_handles_non_numeric_value():
    assert percent_from_progress_line("out_time_us=N/A", 10.0) is None

def test_percent_from_progress_line_returns_none_for_zero_duration():
    assert percent_from_progress_line("out_time_us=2000000", 0.0) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: FAIL with `ImportError: cannot import name 'percent_from_progress_line'`

- [ ] **Step 3: Add the function to `app/media.py`**

Add near the top, after the existing helper functions (e.g. after `_resolve_cmd`), before `ffprobe_cmd`:

```python
def percent_from_progress_line(line: str, total_duration: float) -> float | None:
    """Parses one line of ffmpeg's `-progress pipe:1` output. Returns a 0-100 percent for an
    out_time_us= line when total_duration > 0, else None (caller skips other progress keys)."""
    line = line.strip()
    if not line.startswith("out_time_us=") or total_duration <= 0:
        return None
    try:
        micros = int(line.split("=", 1)[1])
    except ValueError:
        return None
    seconds = micros / 1_000_000
    return max(0.0, min(100.0, (seconds / total_duration) * 100))
```

Update the file's header comment (line 1-2) to mention it now also parses `-progress` output:

```python
# Media helpers: ffprobe duration probing, audio stream detection, safe local file serving, native
# file picker, and parsing ffmpeg -progress output into a percent.
# Exposes ffprobe_cmd, probe_duration, has_audio_stream, media_response, run_export,
# percent_from_progress_line, pick_file. Depends on ffprobe/ffmpeg on PATH and tkinter.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: PASS (all tests, including the 4 pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add app/media.py tests/test_media.py
git commit -m "feat: add percent_from_progress_line ffmpeg progress parser"
```

---

## Task 3: `run_export` streams progress via `-progress pipe:1`

**Files:**
- Modify: `app/media.py`
- Test: `tests/test_media.py`

**Interfaces:**
- Consumes: `percent_from_progress_line` from Task 2 (same file).
- Produces: `run_export(cmd: list[str], on_progress: Callable[[float], None] | None = None, total_duration: float = 0.0) -> None`. Backward compatible: calling with no `on_progress` behaves as before (raises `RuntimeError(stderr[-2000:])` on nonzero exit). When `on_progress` is given and `total_duration > 0`, `-progress pipe:1 -nostats` is inserted into the command (after `ffmpeg -y`) and stdout is streamed line-by-line through `percent_from_progress_line`, calling `on_progress(percent)` for each non-`None` result. Stderr is captured via a temp file (not a second `PIPE`) so a long export can't deadlock on a full stderr pipe buffer while stdout is being read concurrently.

- [ ] **Step 1: Write the failing tests**

```python
# Add to tests/test_media.py
from app.media import run_export
import pytest

class _FakeStdout:
    def __init__(self, lines):
        self._lines = iter(lines)
    def __iter__(self):
        return self
    def __next__(self):
        return next(self._lines)
    def close(self):
        pass

def test_run_export_streams_progress_and_calls_on_progress(monkeypatch):
    calls = []

    class FakeProc:
        def __init__(self):
            self.stdout = _FakeStdout(["out_time_us=1000000\n", "out_time_us=2000000\n", "progress=end\n"])
            self.returncode = 0
        def wait(self):
            pass

    def fake_popen(cmd, **kwargs):
        assert "-progress" in cmd
        assert "pipe:1" in cmd
        return FakeProc()

    monkeypatch.setattr("app.media.subprocess.Popen", fake_popen)
    run_export(["ffmpeg", "-y", "-i", "a.mp4", "out.mp4"], on_progress=calls.append, total_duration=10.0)
    assert calls == [10.0, 20.0]

def test_run_export_without_progress_args_skips_progress_flags(monkeypatch):
    class FakeProc:
        stdout = None
        returncode = 0
        def wait(self):
            pass

    captured_cmd = {}

    def fake_popen(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        return FakeProc()

    monkeypatch.setattr("app.media.subprocess.Popen", fake_popen)
    run_export(["ffmpeg", "-y", "-i", "a.mp4", "out.mp4"])
    assert "-progress" not in captured_cmd["cmd"]

def test_run_export_raises_with_stderr_on_failure(monkeypatch):
    class FakeProc:
        stdout = None
        returncode = 1
        def wait(self):
            pass

    def fake_popen(cmd, stderr, **kwargs):
        stderr.write("boom: bad codec")
        stderr.seek(0)
        return FakeProc()

    monkeypatch.setattr("app.media.subprocess.Popen", fake_popen)
    with pytest.raises(RuntimeError, match="boom: bad codec"):
        run_export(["ffmpeg", "-y", "out.mp4"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: FAIL — `run_export` doesn't accept `on_progress`/`total_duration` yet, and still uses `subprocess.run` not `subprocess.Popen`, so `fake_popen` is never invoked and assertions fail/error.

- [ ] **Step 3: Rewrite `run_export`**

Add `import tempfile` and `from typing import Callable` to the top of `app/media.py`. Replace the existing `run_export`:

```python
def run_export(cmd: list[str], on_progress: Callable[[float], None] | None = None, total_duration: float = 0.0) -> None:
    resolved, env = _resolve_cmd(cmd, _refreshed_path())
    use_progress = on_progress is not None and total_duration > 0
    if use_progress:
        resolved = [resolved[0], resolved[1], "-progress", "pipe:1", "-nostats", *resolved[2:]]
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as stderr_file:
        proc = subprocess.Popen(
            resolved,
            stdout=subprocess.PIPE if use_progress else subprocess.DEVNULL,
            stderr=stderr_file,
            env=env,
            text=True,
        )
        if use_progress:
            for line in proc.stdout:
                percent = percent_from_progress_line(line, total_duration)
                if percent is not None:
                    on_progress(percent)
            proc.stdout.close()
        proc.wait()
        if proc.returncode != 0:
            stderr_file.seek(0)
            raise RuntimeError(stderr_file.read()[-2000:])
```

Note: `resolved[1]` is always `"-y"` because every caller builds commands starting `["ffmpeg", "-y", ...]` (see `app/ffmpeg_cmd.py`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS — `run_export` is mocked wholesale in every other test file (`test_main.py`, `test_export_smoke.py`, `test_transcribe_route.py`), so this signature change doesn't touch them.

- [ ] **Step 6: Commit**

```bash
git add app/media.py tests/test_media.py
git commit -m "feat: stream ffmpeg -progress output through run_export"
```

---

## Task 4: wire the export route to the job registry

**Files:**
- Modify: `app/main.py`
- Modify: `tests/test_main.py`
- Modify: `tests/test_export_smoke.py`

**Interfaces:**
- Consumes: `export_jobs.start_job`/`get_job` (Task 1), `media.run_export(cmd, on_progress=, total_duration=)` (Task 3), `timeline.sequence_duration`/`timeline.ordered` (existing, `app/timeline.py`).
- Produces: `POST /api/projects/{pid}/export` now returns `{"job_id": str}` instead of `{"out_path": str}`. New `GET /api/exports/{job_id}` returns the job dict from `export_jobs.get_job`, or 404 (`HTTPException`) if unknown.

- [ ] **Step 1: Update `app/main.py` imports and route**

Add `export_jobs` to the module import (line 10) and `HTTPException` to the fastapi import (line 6):

```python
from fastapi import FastAPI, HTTPException
...
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs
```

Replace `export_project`'s tail (from `media.run_export(cmd)` onward) and add the new route. The full function becomes:

```python
@app.post("/api/projects/{pid}/export")
def export_project(pid: str) -> dict:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    default_stem = f"{p.name}-{p.id[:8]}"
    stem = sanitize_export_filename(p.export_filename) if p.export_filename else ""
    out_path = resolve_export_path(out_dir, stem or default_stem)

    caption_ass_path = None
    if p.captions and p.captions.words:
        caption_preset = p.text_presets.get(p.captions.preset_id) or TextPreset(name="Caption")
        cap_file = out_dir / f"{p.name}-{p.id[:8]}-captions.ass"
        cap_file.write_text(ass_render.render_caption_ass(p, caption_preset), encoding="utf-8")
        caption_ass_path = str(cap_file)

    if p.video_boxes:
        bands = []
        for i, band in enumerate(timeline.banded_layers(p)):
            if band["kind"] == "text":
                ass_file = out_dir / f"{p.name}-{p.id[:8]}-band{i}.ass"
                ass_file.write_text(
                    ass_render.render_ass(p, p.text_presets, text_blocks=band["text_blocks"]),
                    encoding="utf-8")
                bands.append({"kind": "ass", "path": str(ass_file)})
            else:
                bands.append({"kind": "video_box", "video_box": band["video_box"]})
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), bands=bands, caption_ass_path=caption_ass_path)
    else:
        ass_path = None
        if p.text_blocks:
            ass_file = out_dir / f"{p.name}-{p.id[:8]}.ass"
            ass_file.write_text(ass_render.render_ass(p, p.text_presets), encoding="utf-8")
            ass_path = str(ass_file)
        cmd = ffmpeg_cmd.build_export_cmd(p, str(out_path), ass_path, caption_ass_path=caption_ass_path)

    total_duration = timeline.sequence_duration(timeline.ordered(p.clips))

    def run(on_progress):
        media.run_export(cmd, on_progress=on_progress, total_duration=total_duration)
        return str(out_path)

    job_id = export_jobs.start_job(run)
    return {"job_id": job_id}

@app.get("/api/exports/{job_id}")
def export_status(job_id: str) -> dict:
    job = export_jobs.get_job(job_id)
    if job is None:
        raise HTTPException(404, f"unknown export job: {job_id}")
    return job
```

- [ ] **Step 2: Update `tests/test_main.py`'s existing export tests**

Every test that calls `export_project` needs `monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())` added (so the job runs synchronously, deterministically, inside the `export_project` call), and any assertion on `result["out_path"]` needs to instead fetch the job and read `job["output_path"]`. Add the import `from app import export_jobs` at the top of the file. Apply this diff pattern to each of these tests:

```python
def test_export_writes_ass_file_and_burns_it_in(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    pr = TextPreset(name="Pop")
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="Hi", preset_id=pr.id, start=0, end=2)],
                text_presets={pr.id: pr})
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        export_project(p.id)
    ass_files = list((tmp_path / "exports").glob("*.ass"))
    assert len(ass_files) == 1
    assert "Hi" in ass_files[0].read_text(encoding="utf-8")
    cmd = run_export.call_args[0][0]
    assert any("ass=" in part for part in cmd)

def test_export_omits_ass_when_no_text_blocks(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r")
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        export_project(p.id)
    assert list((tmp_path / "exports").glob("*.ass")) == []
    cmd = run_export.call_args[0][0]
    assert not any("ass=" in part for part in cmd)
```

```python
def test_export_uses_export_filename_when_set(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r", export_filename="my-custom-name")
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        result = export_project(p.id)
    job = export_jobs.get_job(result["job_id"])
    assert job["output_path"].endswith("my-custom-name.mp4")
    cmd = run_export.call_args[0][0]
    assert cmd[-1].endswith("my-custom-name.mp4")

def test_export_falls_back_to_default_stem_when_filename_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r")
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export"):
        result = export_project(p.id)
    job = export_jobs.get_job(result["job_id"])
    assert job["output_path"].endswith(f"r-{p.id[:8]}.mp4")

def test_export_appends_collision_suffix_when_target_exists(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    (tmp_path / "exports").mkdir(parents=True)
    (tmp_path / "exports" / "taken.mp4").write_text("existing")
    p = Project(name="r", export_filename="taken")
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export"):
        result = export_project(p.id)
    job = export_jobs.get_job(result["job_id"])
    assert job["output_path"].endswith("taken-2.mp4")

def test_export_quality_medium_uses_crf_23(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r", export_quality="medium")
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        export_project(p.id)
    cmd = run_export.call_args[0][0]
    assert cmd[cmd.index("-crf") + 1] == "23"
```

- [ ] **Step 3: Add new tests for `GET /api/exports/{job_id}`**

Append to `tests/test_main.py`:

```python
def test_export_status_route_returns_job_state(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())
    p = Project(name="r")
    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export"):
        result = export_project(p.id)
    from app.main import export_status
    job = export_status(result["job_id"])
    assert job["status"] == "done"
    assert job["percent"] == 100.0
    assert job["output_path"].endswith(f"r-{p.id[:8]}.mp4")

def test_export_status_route_404_for_unknown_job():
    from app.main import export_status
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException) as exc_info:
        export_status("nonexistent")
    assert exc_info.value.status_code == 404
```

- [ ] **Step 4: Update `tests/test_export_smoke.py`**

```python
# tests/test_export_smoke.py — update imports and the test body
from app import export_jobs
...
def test_export_smoke_all_layer_types_combined(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    monkeypatch.setattr("app.export_jobs._executor", lambda fn: fn())

    # ... (Project construction unchanged) ...

    with patch("app.main.store.load_project", return_value=p), \
         patch("app.main.media.run_export") as run_export:
        result = export_project(p.id)

    assert "job_id" in result
    job = export_jobs.get_job(result["job_id"])
    assert job["status"] == "done"
    cmd = run_export.call_args[0][0]
    assert cmd[0] == "ffmpeg"
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in cmd  # clip m1 has no audio
    assert "-filter_complex" in cmd
    assert cmd[-1].endswith(".mp4")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_main.py tests/test_export_smoke.py -v`
Expected: PASS (all tests)

- [ ] **Step 6: Run the full suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/main.py tests/test_main.py tests/test_export_smoke.py
git commit -m "feat: run export as a background job, add GET /api/exports/{job_id}"
```

---

## Task 5: `Api.exportStatus` + update `Api.exportProject`

**Files:**
- Create: `static/api-export-status.js`
- Modify: `static/api-export-project.js`

**Interfaces:**
- Produces: `window.Api.exportStatus(jobId) -> Promise<{status, percent, output_path, error}>` (throws on non-2xx). `window.Api.exportProject(projectId) -> Promise<{ok: true, job_id} | {ok: false, error}>` (changed: was `{ok, out_path}`).

- [ ] **Step 1: Update `static/api-export-project.js`**

```javascript
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Starts a background export job for `projectId`. Returns { ok: true, job_id } on success, or
// { ok: false, error } (error is the response body text) on failure. Poll progress/result via
// Api.exportStatus(job_id).
window.Api.exportProject = async function exportProject(projectId) {
  const res = await fetch(`/api/projects/${projectId}/export`, { method: "POST" });
  if (!res.ok) {
    return { ok: false, error: await res.text() };
  }
  const { job_id } = await res.json();
  return { ok: true, job_id };
};
```

- [ ] **Step 2: Create `static/api-export-status.js`**

```javascript
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Fetches the current state of a background export job started by Api.exportProject.
// Returns { status: "running"|"done"|"failed", percent, output_path, error }. Throws on a
// non-2xx response (e.g. unknown job id).
window.Api.exportStatus = async function exportStatus(jobId) {
  const res = await fetch(`/api/exports/${jobId}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};
```

- [ ] **Step 3: Register the new script in `static/index.html`**

Add right after the existing `api-export-project.js` line (currently line 627):

```html
<script src="/static/api-export-project.js"></script>
<script src="/static/api-export-status.js"></script>
```

- [ ] **Step 4: Manual sanity check**

There's no JS test runner in this project (per `CLAUDE.md`, JS logic is exercised through the browser). Confirm both files parse without syntax errors by starting the server and loading the page with devtools console open — deferred to Task 8's manual verification, since the poller that calls these isn't wired up yet.

- [ ] **Step 5: Commit**

```bash
git add static/api-export-project.js static/api-export-status.js static/index.html
git commit -m "feat: add Api.exportStatus, update Api.exportProject for job_id response"
```

---

## Task 6: progress bar markup + CSS

**Files:**
- Modify: `static/index.html`
- Create: `static/css/components/export-progress.css`

**Interfaces:**
- Produces: `#export-progress` (track, `hidden` by default) containing `#export-progress-fill` (the fill div, width set via `style.width` from JS in Task 7 — that's the one legitimate case for a JS-set inline style, since it's a continuously-varying computed value, not a static style attribute in markup).

- [ ] **Step 1: Add markup to `#panel-export` in `static/index.html`**

Current (around line 366-383):

```html
      <div id="panel-export" class="context-panel" hidden>
        <div class="style-panel-header">EXPORT</div>

        <div class="style-group-label">FILENAME</div>
        <div class="style-group">
          <label id="export-filename-field"></label>
        </div>

        <div class="style-group-label">QUALITY</div>
        <div class="style-group">
          <div id="export-quality-group"></div>
        </div>

        <div class="style-group">
          <button id="export" class="col-8">EXPORT &middot; 1080&times;1920</button>
        </div>
        <div id="export-result"></div>
      </div>
```

Replace the last two lines with:

```html
        <div class="style-group">
          <button id="export" class="col-8">EXPORT &middot; 1080&times;1920</button>
        </div>
        <div id="export-progress" class="export-progress" hidden>
          <div id="export-progress-fill" class="export-progress-fill"></div>
        </div>
        <div id="export-result"></div>
      </div>
```

- [ ] **Step 2: Create `static/css/components/export-progress.css`**

```css
/* .export-progress: track + fill-div showing a background export job's percent in #panel-export. */
.export-progress {
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  overflow: hidden;
  margin: 8px 0;
}

.export-progress-fill {
  height: 100%;
  width: 0%;
  background: var(--accent);
  transition: width 0.2s ease;
}
```

- [ ] **Step 3: Register the stylesheet in `static/index.html`**

Add after the existing `layers-panel.css` line (currently line 25):

```html
<link rel="stylesheet" href="/static/css/components/layers-panel.css">
<link rel="stylesheet" href="/static/css/components/export-progress.css">
```

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/css/components/export-progress.css
git commit -m "feat: add export progress bar markup and styling"
```

---

## Task 7: `export-progress.js` poller + wire into `editor.js`

**Files:**
- Create: `static/export-progress.js`
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: `Api.exportStatus` (Task 5), `#export-progress`/`#export-progress-fill` (Task 6).
- Produces: `window.ExportProgress.start(jobId, { onDone(outputPath), onFailed(error) })` — polls every 500ms via `Api.exportStatus`, updates the progress bar fill width, and calls `onDone`/`onFailed` exactly once when the job leaves `"running"`. Polling continues even if `#panel-export` isn't the visible section (DOM writes are guarded by `getElementById` returning `null` gracefully, but a hidden panel's elements still exist in the DOM per this app's single-page `hidden`-attribute panel switching, so no extra guard is needed).

- [ ] **Step 1: Create `static/export-progress.js`**

```javascript
// Polls a background export job (Api.exportStatus) every 500ms and drives the EXPORT panel's
// progress bar. Exposes window.ExportProgress.start(jobId, { onDone, onFailed }).
window.ExportProgress = window.ExportProgress || {};

(() => {
  const POLL_MS = 500;
  let pollHandle = null;

  function setPercent(percent) {
    const bar = document.getElementById("export-progress");
    const fill = document.getElementById("export-progress-fill");
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = `${percent}%`;
  }

  function hideBar() {
    const bar = document.getElementById("export-progress");
    if (bar) bar.hidden = true;
  }

  async function poll(jobId, callbacks) {
    let job;
    try {
      job = await Api.exportStatus(jobId);
    } catch (err) {
      hideBar();
      callbacks.onFailed(err.message);
      return;
    }
    if (job.status === "running") {
      setPercent(job.percent);
      pollHandle = setTimeout(() => poll(jobId, callbacks), POLL_MS);
      return;
    }
    hideBar();
    if (job.status === "done") {
      callbacks.onDone(job.output_path);
    } else {
      callbacks.onFailed(job.error);
    }
  }

  function start(jobId, callbacks) {
    clearTimeout(pollHandle);
    setPercent(0);
    poll(jobId, callbacks);
  }

  window.ExportProgress.start = start;
})();
```

- [ ] **Step 2: Register the script in `static/index.html`**

Add right after `panel-export.js` (currently line 662), before `editor.js`:

```html
<script src="/static/panel-export.js"></script>
<script src="/static/export-progress.js"></script>
```

- [ ] **Step 3: Rewrite `exportProject()` in `static/editor.js`**

Current (lines 317-328):

```javascript
async function exportProject() {
  const resultEl = document.getElementById("export-result");
  resultEl.textContent = "Exporting...";
  const result = await Api.exportProject(project.id);
  if (!result.ok) {
    resultEl.textContent = "Export failed: " + result.error;
    return;
  }
  resultEl.innerHTML = `Exported: <a href="/media?path=${encodeURIComponent(result.out_path)}">download</a>`;
}

document.getElementById("export").addEventListener("click", exportProject);
```

Replace with:

```javascript
async function exportProject() {
  const btn = document.getElementById("export");
  const resultEl = document.getElementById("export-result");
  btn.disabled = true;
  resultEl.textContent = "Starting export...";
  const result = await Api.exportProject(project.id);
  if (!result.ok) {
    resultEl.textContent = "Export failed: " + result.error;
    btn.disabled = false;
    return;
  }
  resultEl.textContent = "";
  ExportProgress.start(result.job_id, {
    onDone(outputPath) {
      btn.disabled = false;
      resultEl.innerHTML = `Exported: <a href="/media?path=${encodeURIComponent(outputPath)}">download</a>`;
    },
    onFailed(error) {
      btn.disabled = false;
      resultEl.textContent = "Export failed: " + error;
    },
  });
}

document.getElementById("export").addEventListener("click", exportProject);
```

- [ ] **Step 4: Commit**

```bash
git add static/export-progress.js static/index.html static/editor.js
git commit -m "feat: poll export job progress and drive the EXPORT panel progress bar"
```

---

## Task 8: update codebase map, full suite, manual verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`'s File structure tree**

Under `app/`, add (alphabetically after `caption_word_estimate.py`):

```
  export_jobs.py         # in-memory export job registry: start_job/get_job/update_progress, jobs run on a background thread (real or injectable-sync in tests), not persisted
```

Under `static/`, add two new entries (near `api-export-project.js` and after `panel-export.js` respectively):

```
  api-export-status.js     # Api.exportStatus: GET /api/exports/{job_id} -> {status, percent, output_path, error}
  export-progress.js       # ExportProgress.start(jobId, {onDone, onFailed}): polls Api.exportStatus every 500ms, drives #panel-export's progress bar
```

Under `static/css/components/`, add:

```
      export-progress.css      # .export-progress track + .export-progress-fill: background export job percent bar in #panel-export
```

- [ ] **Step 2: Update the "Export pipeline" section of `CLAUDE.md`'s Inventory**

Replace the `app/main.py` bullet's export-route description and add a new bullet for the job registry and frontend poller:

```
- `app/export_jobs.py` — in-memory job registry (`start_job`/`get_job`/`update_progress`) backing background exports; see Export pipeline below for how `app/main.py`/`app/media.py` use it.
- `app/main.py` — `POST /api/projects/{id}/export` builds the ffmpeg command synchronously (ASS files, filename/CRF resolution unchanged) then hands it to `export_jobs.start_job`, returning `{job_id}` immediately instead of blocking until ffmpeg finishes. `GET /api/exports/{job_id}` reports `{status, percent, output_path, error}` (404 for an unknown id). `GET /api/fonts/{name}/weights`. ... (rest unchanged)
- `app/media.py` — `run_export(cmd, on_progress=None, total_duration=0.0)`: runs ffmpeg via `subprocess.Popen`; when `on_progress`/`total_duration` are given, appends `-progress pipe:1 -nostats` and streams stdout through `percent_from_progress_line(line, total_duration) -> float | None` (pure), calling `on_progress` per parsed line. Stderr is captured via a temp file (not a second pipe) to avoid a pipe-buffer deadlock while stdout is being read concurrently; still raises `RuntimeError(stderr[-2000:])` on nonzero exit.
- `static/api-export-status.js` — `Api.exportStatus(jobId)`: `GET /api/exports/{job_id}`.
- `static/export-progress.js` — `ExportProgress.start(jobId, {onDone, onFailed})`: 500ms poller driving `#panel-export`'s progress bar (`static/css/components/export-progress.css`); `static/editor.js`'s `exportProject()` disables `#export` during the job and re-enables it on `onDone`/`onFailed`.
```

- [ ] **Step 3: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS, all tests including the new `tests/test_export_jobs.py` and the updated `tests/test_main.py`/`tests/test_export_smoke.py`/`tests/test_media.py`.

- [ ] **Step 4: Manual smoke test (best-effort, requires ffmpeg on PATH and a real video file)**

This step live-verifies the UI. Per project convention, do this on a **throwaway project only** — never the user's real project data, since the app's unload handler flushes in-memory state to disk.

1. Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`
2. Open `http://127.0.0.1:8000` in a browser.
3. Create a new project via the picker's "+ NEW PROJECT" (or `Api.createProject` from devtools console) — do not open an existing real project.
4. Import one short real `.mp4` clip via the FILES panel's import button, drag it onto the VIDEO row.
5. Open the EXPORT panel, click EXPORT.
6. Confirm: the button disables, `#export-result` shows "Starting export...", then a progress bar appears in `#panel-export` and its fill grows over the course of the export.
7. Confirm on completion: the bar disappears, the button re-enables, and `#export-result` shows the "Exported: download" link, matching pre-change behavior.
8. Delete the throwaway project via the PROJECTS panel (or `Api.deleteProject`) when done.

If ffmpeg is not available in this environment or no sample media is at hand, skip this step and note it explicitly in the final report — the unit/route tests (Tasks 1-4) are the primary correctness evidence for the parsing/job-state-machine logic; this step only verifies UI wiring.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for export-progress feature"
```

---

## Final Review

After Task 8, do a `superpowers:requesting-code-review` pass over the full diff (all 8 tasks) before merging: confirm the design doc's Tasks 1-4 are all covered, no placeholder code remains, `git diff main --stat` shows only the files listed above, and the full test suite is green.
