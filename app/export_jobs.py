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
