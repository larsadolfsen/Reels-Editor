# Tests for app.main's export route: confirms ASS subtitles are rendered to a file and
# burned into the ffmpeg command when a project has text blocks, and skipped otherwise.
from unittest.mock import patch
from app.main import export_project, list_presets, create_preset
from app.models import Project, TextBlockLayer, TextPreset

def test_export_writes_ass_file_and_burns_it_in(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
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
