# Tests for app.main's export route: confirms ASS subtitles are rendered to a file and
# burned into the ffmpeg command when a project has text blocks, and skipped otherwise.
from unittest.mock import patch
from app.main import export_project, list_presets, create_preset
from app.models import Project, TextBlockLayer, TextPreset, MediaItem

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
