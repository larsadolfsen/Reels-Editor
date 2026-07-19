# Tests for app.models: entity construction, IDs, JSON round-trip.
from datetime import datetime as _datetime
from app.models import Project, ClipLayer, MediaItem, TextPreset, TextBlockLayer, CaptionTrack, CaptionWord, VideoBoxLayer

def test_ids_are_unique():
    a, b = ClipLayer(media_id="m1", file_path="a.mp4", in_point=0, out_point=5, order=0), ClipLayer(media_id="m2", file_path="b.mp4", in_point=0, out_point=5, order=1)
    assert a.id != b.id and len(a.id) == 32

def test_project_defaults():
    p = Project(name="reel1")
    assert (p.width, p.height, p.fps) == (1080, 1920, 30)
    assert p.clips == [] and p.text_blocks == [] and p.captions is None
    assert p.media_library == []
    assert p.text_presets == {}
    assert p.video_boxes == []

def test_json_round_trip():
    p = Project(name="reel1",
                media_library=[MediaItem(id="m1", file_path="a.mp4", duration=4.5)],
                clips=[ClipLayer(media_id="m1", file_path="a.mp4", in_point=1.0, out_point=4.5, order=0)],
                text_blocks=[TextBlockLayer(heading="H", preset_id="x", start=0, end=3)],
                text_presets={"x": TextPreset(id="x", name="Default")},
                captions=CaptionTrack(words=[CaptionWord(text="hi", t_start=0.1, t_end=0.4)]))
    assert Project.model_validate_json(p.model_dump_json()) == p

def test_text_preset_weight_defaults_400():
    p = TextPreset(name="Pop")
    assert p.weight == 400
    assert (p.italic, p.underline) == (False, False)
    assert p.font == "Public Sans"

def test_text_preset_weight_round_trip():
    p = TextPreset(name="Pop", weight=700, italic=True, underline=True, font="JetBrains Mono")
    assert TextPreset.model_validate_json(p.model_dump_json()) == p

def test_text_preset_migrates_legacy_bold_field():
    p = TextPreset.model_validate({"name": "Pop", "bold": True})
    assert p.weight == 700

def test_text_preset_migrates_legacy_bold_false_field():
    p = TextPreset.model_validate({"name": "Pop", "bold": False})
    assert p.weight == 400

def test_text_preset_position_grid_fields_removed():
    p = TextPreset.model_validate({"name": "Pop", "pos_row": "top", "pos_col": "left",
                                    "offset_x": 10, "offset_y": -5})
    assert not hasattr(p, "pos_row")
    assert not hasattr(p, "pos_col")
    assert not hasattr(p, "offset_x")
    assert not hasattr(p, "offset_y")
    assert (p.x, p.y) == (540, 700)

def test_media_item_round_trip():
    m = MediaItem(file_path="clip.mp4", duration=13.2)
    assert MediaItem.model_validate_json(m.model_dump_json()) == m
    assert len(m.id) == 32

def test_text_preset_box_defaults():
    p = TextPreset(name="Pop")
    assert p.box_width_mode == "fit" and p.box_height_mode == "fit"
    assert p.box_width == 0 and p.box_height == 0
    assert p.box_background is False and p.box_background_color == "#000000"
    assert p.box_background_opacity == 100
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

def test_text_preset_usage_count_defaults_zero():
    p = TextPreset(name="Pop")
    assert p.usage_count == 0

def test_text_preset_usage_count_round_trips():
    p = TextPreset(name="Pop", usage_count=7)
    assert TextPreset.model_validate_json(p.model_dump_json()).usage_count == 7

def test_project_has_created_and_updated_at():
    p = Project(name="reel1")
    assert isinstance(p.created_at, _datetime)
    assert isinstance(p.updated_at, _datetime)

def test_project_timestamps_round_trip():
    p = Project(name="reel1")
    assert Project.model_validate_json(p.model_dump_json()) == p

def test_video_box_layer_defaults():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920)
    assert v.in_point == 0.0
    assert v.start == 0.0
    assert (v.x, v.y, v.width) == (0, 0, 1080)
    assert v.z_index == -1
    assert len(v.id) == 32

def test_video_box_layer_round_trip():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", in_point=1.0, out_point=5.0,
                       start=2.0, x=10, y=20, width=400, height=711, z_index=3)
    assert VideoBoxLayer.model_validate_json(v.model_dump_json()) == v

def test_project_video_boxes_default_empty():
    p = Project(name="reel1")
    assert p.video_boxes == []

def test_project_with_video_box_round_trip():
    p = Project(name="reel1", video_boxes=[VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920)])
    assert Project.model_validate_json(p.model_dump_json()) == p

def test_text_block_layer_z_index_defaults_zero():
    t = TextBlockLayer(heading="H", preset_id="x")
    assert t.z_index == 0

def test_caption_track_z_index_defaults_zero():
    c = CaptionTrack()
    assert c.z_index == 0

def test_text_preset_highlight_and_grouping_defaults():
    from app.models import TextPreset
    p = TextPreset(name="Caption")
    assert p.highlight_color == "#FFD400"
    assert p.highlight_mode == "current_word"
    assert p.max_words_per_line == 4

def test_caption_track_has_preset_id():
    from app.models import CaptionTrack, CaptionWord
    t = CaptionTrack(words=[CaptionWord(text="hi", t_start=0.0, t_end=0.5)])
    assert isinstance(t.preset_id, str) and len(t.preset_id) == 32
