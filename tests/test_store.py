# Tests for app.store: project and preset persistence to JSON files.
from app.models import Project, TextPreset
from app.store import save_project, load_project, save_preset, load_presets, list_projects, delete_project, delete_preset

def test_project_round_trip(tmp_path):
    p = Project(name="reel1")
    save_project(p, tmp_path)
    assert load_project(p.id, tmp_path) == p

def test_presets_accumulate_and_update(tmp_path):
    a = TextPreset(name="Pop")
    save_preset(a, tmp_path)
    save_preset(TextPreset(name="Clean"), tmp_path)
    assert {x.name for x in load_presets(tmp_path)} == {"Pop", "Clean"}
    a.size_px = 120
    save_preset(a, tmp_path)  # same id -> update, not duplicate
    assert [x.size_px for x in load_presets(tmp_path) if x.id == a.id] == [120]

def test_save_project_restamps_updated_at(tmp_path):
    p = Project(name="reel1")
    original = p.updated_at
    save_project(p, tmp_path)
    assert p.updated_at >= original

def test_list_projects_returns_all(tmp_path):
    a = Project(name="a")
    b = Project(name="b")
    save_project(a, tmp_path)
    save_project(b, tmp_path)
    ids = {x.id for x in list_projects(tmp_path)}
    assert ids == {a.id, b.id}

def test_list_projects_skips_corrupt_file(tmp_path):
    a = Project(name="a")
    save_project(a, tmp_path)
    (tmp_path / "projects" / "corrupt.json").write_text("{not json", encoding="utf-8")
    result = list_projects(tmp_path)
    assert [x.id for x in result] == [a.id]

def test_delete_project_removes_file(tmp_path):
    a = Project(name="a")
    save_project(a, tmp_path)
    delete_project(a.id, tmp_path)
    assert list_projects(tmp_path) == []

def test_delete_project_missing_file_is_noop(tmp_path):
    delete_project("nonexistent-id", tmp_path)  # must not raise

def test_delete_preset_removes_by_id(tmp_path):
    a = TextPreset(name="Pop")
    save_preset(a, tmp_path)
    save_preset(TextPreset(name="Clean"), tmp_path)
    delete_preset(a.id, tmp_path)
    assert {x.name for x in load_presets(tmp_path)} == {"Clean"}

def test_delete_preset_unknown_id_is_noop(tmp_path):
    save_preset(TextPreset(name="Pop"), tmp_path)
    delete_preset("nope", tmp_path)
    assert {x.name for x in load_presets(tmp_path)} == {"Pop"}
