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
