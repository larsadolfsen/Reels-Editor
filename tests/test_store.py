# Tests for app.store: project and preset persistence to JSON files.
from app.models import Project, TextPreset
from app.store import save_project, load_project, save_preset, load_presets

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
