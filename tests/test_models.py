# Tests for app.models: entity construction, IDs, JSON round-trip.
from app.models import Project, ClipLayer, MediaItem, TextPreset, TextBlockLayer, CaptionTrack, CaptionWord

def test_ids_are_unique():
    a, b = ClipLayer(media_id="m1", file_path="a.mp4", in_point=0, out_point=5, order=0), ClipLayer(media_id="m2", file_path="b.mp4", in_point=0, out_point=5, order=1)
    assert a.id != b.id and len(a.id) == 32

def test_project_defaults():
    p = Project(name="reel1")
    assert (p.width, p.height, p.fps) == (1080, 1920, 30)
    assert p.clips == [] and p.text_blocks == [] and p.captions is None
    assert p.media_library == []
    assert p.text_presets == {}

def test_json_round_trip():
    p = Project(name="reel1",
                media_library=[MediaItem(id="m1", file_path="a.mp4", duration=4.5)],
                clips=[ClipLayer(media_id="m1", file_path="a.mp4", in_point=1.0, out_point=4.5, order=0)],
                text_blocks=[TextBlockLayer(heading="H", preset_id="x", start=0, end=3)],
                text_presets={"x": TextPreset(id="x", name="Default")},
                captions=CaptionTrack(words=[CaptionWord(text="hi", t_start=0.1, t_end=0.4)]))
    assert Project.model_validate_json(p.model_dump_json()) == p

def test_text_preset_style_flags_default_false():
    p = TextPreset(name="Pop")
    assert (p.bold, p.italic, p.underline) == (False, False, False)
    assert p.font == "Public Sans"

def test_text_preset_style_flags_round_trip():
    p = TextPreset(name="Pop", bold=True, italic=True, underline=True, font="JetBrains Mono")
    assert TextPreset.model_validate_json(p.model_dump_json()) == p

def test_text_preset_position_grid_defaults():
    p = TextPreset(name="Pop")
    assert (p.pos_row, p.pos_col, p.offset_x, p.offset_y) == ("mid", "mid", 0, 0)

def test_media_item_round_trip():
    m = MediaItem(file_path="clip.mp4", duration=13.2)
    assert MediaItem.model_validate_json(m.model_dump_json()) == m
    assert len(m.id) == 32

def test_text_preset_box_defaults():
    p = TextPreset(name="Pop")
    assert p.box_width_mode == "fit" and p.box_height_mode == "fit"
    assert p.box_width == 0 and p.box_height == 0
    assert p.box_background is False and p.box_background_color == "#000000"
    assert p.box_border_width == 0 and p.box_border_color == "#FFFFFF" and p.box_border_radius == 0

def test_text_preset_migrates_legacy_box_fields():
    p = TextPreset.model_validate({"name": "Pop", "box": True, "box_color": "#FF00FF"})
    assert p.box_background is True
    assert p.box_background_color == "#FF00FF"

def test_text_preset_box_round_trip():
    p = TextPreset(name="Pop", box_width_mode="fixed", box_width=400, box_height_mode="fit",
                    box_background=True, box_background_color="#111111",
                    box_border_width=3, box_border_color="#EEEEEE", box_border_radius=8)
    assert TextPreset.model_validate_json(p.model_dump_json()) == p
