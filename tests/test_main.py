# Tests for app.main's export route: confirms ASS subtitles are rendered to a file and
# burned into the ffmpeg command when a project has text blocks, and skipped otherwise.
from pathlib import Path
from unittest.mock import patch
from app import export_jobs
from app.main import export_project, list_presets, create_preset, probe, sanitize_export_filename, resolve_export_path, media_peaks
from app.models import Project, TextBlockLayer, TextPreset, MediaItem

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

def test_create_and_list_presets(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = TextPreset(name="Pop")
    result = create_preset(p)
    assert result == p
    assert list_presets() == [p]

def test_create_preset_same_id_updates(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = TextPreset(name="Pop")
    create_preset(p)
    p.usage_count = 3
    create_preset(p)
    result = list_presets()
    assert len(result) == 1
    assert result[0].usage_count == 3

def test_list_font_weights_public_sans_has_all_four():
    from app.main import list_font_weights
    result = list_font_weights("Public Sans")
    assert result == [
        {"value": 400, "label": "Regular"},
        {"value": 500, "label": "Medium"},
        {"value": 600, "label": "SemiBold"},
        {"value": 700, "label": "Bold"},
    ]

def test_list_font_weights_jetbrains_mono_has_no_semibold():
    from app.main import list_font_weights
    result = list_font_weights("JetBrains Mono")
    assert result == [
        {"value": 400, "label": "Regular"},
        {"value": 500, "label": "Medium"},
        {"value": 700, "label": "Bold"},
    ]

def test_list_font_weights_unknown_font_returns_empty_list_not_500():
    from app.main import list_font_weights
    assert list_font_weights("Nonexistent Font") == []

def test_list_projects_route_sorted_newest_updated_first(tmp_path, monkeypatch):
    from app import store
    from app.main import list_projects as route_list_projects
    from app.models import ProjectSummary
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="a")
    store.save_project(a, tmp_path)
    b = Project(name="b")
    store.save_project(b, tmp_path)  # saved after a -> newer updated_at
    result = route_list_projects()
    assert [r.id for r in result] == [b.id, a.id]
    assert isinstance(result[0], ProjectSummary)

def test_delete_project_route_removes_file(tmp_path, monkeypatch):
    from app import store
    from app.main import delete_project as route_delete_project, list_projects as route_list_projects
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="a")
    store.save_project(a, tmp_path)
    route_delete_project(a.id)
    assert route_list_projects() == []

def test_duplicate_project_route_creates_new_id_and_copy_suffix(tmp_path, monkeypatch):
    from app import store
    from app.main import duplicate_project as route_duplicate_project
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="Reel A")
    store.save_project(a, tmp_path)
    dup = route_duplicate_project(a.id)
    assert dup.id != a.id
    assert dup.name == "Reel A copy"
    assert store.load_project(dup.id, tmp_path).id == dup.id

def test_duplicate_project_route_deep_copies_nested_data(tmp_path, monkeypatch):
    from app import store
    from app.main import duplicate_project as route_duplicate_project
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    a = Project(name="Reel A", media_library=[MediaItem(file_path="a.mp4", duration=1.0)])
    store.save_project(a, tmp_path)
    dup = route_duplicate_project(a.id)
    dup.media_library[0].file_path = "changed.mp4"
    assert a.media_library[0].file_path == "a.mp4"

def test_probe_route_includes_has_audio():
    with patch("app.main.media.probe_duration", return_value=5.0), \
         patch("app.main.media.has_audio_stream", return_value=False):
        result = probe("c.mp4")
    assert result == {"duration": 5.0, "has_audio": False, "kind": "video"}

def test_probe_route_includes_kind_video():
    with patch("app.main.media.probe_duration", return_value=5.0), \
         patch("app.main.media.has_audio_stream", return_value=True):
        result = probe("c.mp4")
    assert result == {"duration": 5.0, "has_audio": True, "kind": "video"}

def test_probe_route_skips_ffprobe_for_images():
    with patch("app.main.media.probe_duration") as pd, \
         patch("app.main.media.has_audio_stream") as ha:
        result = probe("c.jpg")
    pd.assert_not_called()
    ha.assert_not_called()
    assert result == {"duration": 0.0, "has_audio": False, "kind": "image"}

def test_sanitize_export_filename_strips_path_separators_and_unsafe_chars():
    assert sanitize_export_filename('a/b\\c:d*e?f"g<h>i|j') == "abcdefghij"

def test_sanitize_export_filename_strips_trailing_extension_and_dots():
    assert sanitize_export_filename("My Reel.mp4") == "My Reel"
    assert sanitize_export_filename("  ..weird..  ") == "weird"

def test_sanitize_export_filename_keeps_safe_chars():
    assert sanitize_export_filename("My Reel_2026-07-20") == "My Reel_2026-07-20"

def test_resolve_export_path_no_collision_uses_plain_name(tmp_path):
    out = resolve_export_path(tmp_path, "reel")
    assert out == tmp_path / "reel.mp4"

def test_resolve_export_path_appends_suffix_on_collision(tmp_path):
    (tmp_path / "reel.mp4").write_text("x")
    out = resolve_export_path(tmp_path, "reel")
    assert out == tmp_path / "reel-2.mp4"

def test_resolve_export_path_increments_past_multiple_collisions(tmp_path):
    (tmp_path / "reel.mp4").write_text("x")
    (tmp_path / "reel-2.mp4").write_text("x")
    (tmp_path / "reel-3.mp4").write_text("x")
    out = resolve_export_path(tmp_path, "reel")
    assert out == tmp_path / "reel-4.mp4"

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

def test_media_peaks_route_returns_peaks(monkeypatch):
    monkeypatch.setattr("app.main.waveform.peaks_for_media",
                         lambda media_id, file_path, data_dir, samples_per_second=10: [0.1, 0.2, 0.3])
    result = media_peaks("abc123", "song.mp3")
    assert result == [0.1, 0.2, 0.3]

def test_pick_file_route_passes_kind_through(monkeypatch):
    from app.main import pick_file as pick_file_route
    captured = {}
    def fake_pick_file(kind="video"):
        captured["kind"] = kind
        return "song.mp3"
    monkeypatch.setattr("app.main.media.pick_file", fake_pick_file)
    result = pick_file_route(kind="audio")
    assert result == {"path": "song.mp3"}
    assert captured["kind"] == "audio"

def test_pick_file_route_defaults_to_video_kind(monkeypatch):
    from app.main import pick_file as pick_file_route
    captured = {}
    def fake_pick_file(kind="video"):
        captured["kind"] = kind
        return None
    monkeypatch.setattr("app.main.media.pick_file", fake_pick_file)
    pick_file_route()
    assert captured["kind"] == "video"

def test_resolve_data_dir_uses_env_var(monkeypatch):
    monkeypatch.setenv("DATA_DIR", "/tmp/custom-data")
    from app.main import _resolve_data_dir
    assert _resolve_data_dir() == Path("/tmp/custom-data")

def test_resolve_data_dir_defaults_to_data(monkeypatch):
    monkeypatch.delenv("DATA_DIR", raising=False)
    from app.main import _resolve_data_dir
    assert _resolve_data_dir() == Path("data")

def test_login_correct_password_sets_cookie_and_redirects(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    res = client.post("/login", data={"password": "correct-horse"}, follow_redirects=False)
    assert res.status_code == 303
    assert res.headers["location"] == "/"
    assert "session" in res.cookies

def test_login_wrong_password_redirects_without_cookie(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    res = client.post("/login", data={"password": "wrong"}, follow_redirects=False)
    assert res.status_code == 303
    assert res.headers["location"] == "/login?error=1"
    assert "session" not in res.cookies

def test_login_page_serves_html(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "")
    client = TestClient(fastapi_app)
    res = client.get("/login")
    assert res.status_code == 200
    assert "login-form" in res.text
