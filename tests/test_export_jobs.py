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
