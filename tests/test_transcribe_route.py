# Tests for POST /api/projects/{pid}/transcribe: wiring only, mocks both ffmpeg and the model.
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.models import Project, CaptionWord, CaptionTrack, TextPreset
from app import store

client = TestClient(app)

def test_transcribe_creates_captions_and_preset(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[CaptionWord(text="hi", t_start=0.0, t_end=0.4)]):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    assert res.status_code == 200
    body = res.json()
    assert body["captions"]["words"][0]["text"] == "hi"
    preset_id = body["captions"]["preset_id"]
    assert preset_id in body["text_presets"]

def test_transcribe_overwrites_words_keeps_existing_preset_id(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    preset = TextPreset(name="Caption", size_px=50)
    p = Project(name="r", text_presets={preset.id: preset},
                captions=CaptionTrack(words=[CaptionWord(text="old", t_start=0, t_end=1)], preset_id=preset.id))
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", return_value=[CaptionWord(text="new", t_start=0.0, t_end=0.4)]):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    body = res.json()
    assert [w["text"] for w in body["captions"]["words"]] == ["new"]
    assert body["captions"]["preset_id"] == preset.id
    assert body["text_presets"][preset.id]["size_px"] == 50

def test_transcribe_returns_503_when_ml_extra_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", side_effect=ImportError("faster_whisper not installed")):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    assert res.status_code == 503
    assert res.json()["detail"] == "Transcription not available on this deployment"
