# Tests for POST /api/projects/{pid}/auto-slice/detect and .../apply: wiring only, mocks ffmpeg.
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.models import Project, ClipLayer, CaptionWord, CaptionTrack
from app import store

client = TestClient(app)

def clip(i, o, order): return ClipLayer(media_id=f"m{order}", file_path=f"{order}.mp4", in_point=i, out_point=o, order=order)

def test_detect_with_no_clips_short_circuits(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r")
    store.save_project(p, tmp_path)

    res = client.post(f"/api/projects/{p.id}/auto-slice/detect")
    assert res.status_code == 200
    assert res.json() == {"ranges": []}

def test_detect_returns_silence_and_filler_ranges(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    words = [CaptionWord(text="um", t_start=3.0, t_end=3.4), CaptionWord(text="hi", t_start=4.0, t_end=4.4)]
    p = Project(name="r", clips=[clip(0, 10, 0)], captions=CaptionTrack(words=words, preset_id="p1"))
    store.save_project(p, tmp_path)

    peaks = [0.5] * 20 + [0.0] * 10 + [0.5] * 20   # 1.0s of silence at samples_per_second=20
    with patch("app.main.media.run_export"), \
         patch("app.main.waveform.peaks_from_file", return_value=peaks):
        res = client.post(f"/api/projects/{p.id}/auto-slice/detect")

    assert res.status_code == 200
    ranges = res.json()["ranges"]
    kinds = {(r["kind"], r["label"]) for r in ranges}
    assert ("filler", "um") in kinds
    assert any(r["kind"] == "silence" for r in ranges)
    assert ranges == sorted(ranges, key=lambda r: r["start"])

def test_detect_uses_projects_custom_filler_words(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    words = [CaptionWord(text="um", t_start=3.0, t_end=3.4), CaptionWord(text="øh", t_start=4.0, t_end=4.4)]
    p = Project(name="r", clips=[clip(0, 10, 0)], captions=CaptionTrack(words=words, preset_id="p1"),
                filler_words=["øh"])
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.waveform.peaks_from_file", return_value=[0.5] * 20):
        res = client.post(f"/api/projects/{p.id}/auto-slice/detect")

    ranges = res.json()["ranges"]
    labels = {r["label"] for r in ranges if r["kind"] == "filler"}
    assert labels == {"øh"}   # "um" isn't in this project's custom list, so it's not flagged

def test_detect_skips_filler_detection_without_captions(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r", clips=[clip(0, 10, 0)])
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.waveform.peaks_from_file", return_value=[0.5] * 20):
        res = client.post(f"/api/projects/{p.id}/auto-slice/detect")

    assert res.json() == {"ranges": []}

def test_apply_persists_and_returns_shortened_project(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r", clips=[clip(0, 10, 0)])
    store.save_project(p, tmp_path)

    res = client.post(f"/api/projects/{p.id}/auto-slice/apply", json={"ranges": [{"start": 3.0, "end": 4.0}]})
    assert res.status_code == 200
    body = res.json()
    assert sum(c["out_point"] - c["in_point"] for c in body["clips"]) == 9.0

    reloaded = store.load_project(p.id, tmp_path)
    assert sum(c.out_point - c.in_point for c in reloaded.clips) == 9.0
