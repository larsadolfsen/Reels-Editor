# Tests for app.models: entity construction, IDs, JSON round-trip.
from datetime import datetime as _datetime
from app.models import Project, ClipLayer, MediaItem, TextPreset, TextBlockLayer, CaptionTrack, CaptionWord, VideoBoxLayer, FormatRun

def test_ids_are_unique():
    a, b = ClipLayer(media_id="m1", file_path="a.mp4", in_point=0, out_point=5, order=0), ClipLayer(media_id="m2", file_path="b.mp4", in_point=0, out_point=5, order=1)
    assert a.id != b.id and len(a.id) == 32

def test_clip_layer_fill_mode_defaults_to_fit():
    c = ClipLayer(media_id="m1", file_path="a.mp4", in_point=0, out_point=5, order=0)
    assert c.fill_mode == "fit"

def test_clip_layer_speed_defaults_to_one():
    c = ClipLayer(media_id="m1", file_path="a.mp4", in_point=0, out_point=5, order=0)
    assert c.speed == 1.0

def test_clip_layer_speed_must_be_positive():
    # gt=0 guards clip_duration's divide against a corrupt/hand-edited speed of 0 or negative
    import pytest
    from pydantic import ValidationError
    for bad in (0, -1.5):
        with pytest.raises(ValidationError):
            ClipLayer(media_id="m1", file_path="a.mp4", in_point=0, out_point=5, order=0, speed=bad)

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

def test_format_run_only_start_end_required():
    r = FormatRun(start=2, end=5)
    assert (r.start, r.end) == (2, 5)
    assert r.color is None and r.weight is None and r.highlight is None

def test_format_run_sparse_overrides_round_trip():
    r = FormatRun(start=0, end=3, color="#FF0000", weight=700, highlight=True, highlight_color="#00FF00")
    assert FormatRun.model_validate_json(r.model_dump_json()) == r

def test_text_block_formatting_runs_defaults_empty():
    b = TextBlockLayer(heading="hi", preset_id="x")
    assert b.formatting_runs == []

def test_text_block_formatting_runs_round_trip():
    b = TextBlockLayer(heading="hi there", preset_id="x",
                        formatting_runs=[FormatRun(start=0, end=2, weight=700)])
    out = TextBlockLayer.model_validate_json(b.model_dump_json())
    assert out.formatting_runs == [FormatRun(start=0, end=2, weight=700)]

def test_text_preset_highlight_defaults_off():
    p = TextPreset(name="Pop")
    assert p.highlight is False

def test_text_preset_shadow_defaults_off():
    p = TextPreset(name="Pop")
    assert p.shadow is False
    assert p.shadow_color == "#000000"
    assert p.shadow_offset_x == 4
    assert p.shadow_offset_y == 4
    assert p.shadow_blur == 0

def test_text_preset_shadow_round_trip():
    p = TextPreset(name="Pop", shadow=True, shadow_color="#FF00FF",
                    shadow_offset_x=-10, shadow_offset_y=20, shadow_blur=8)
    loaded = TextPreset.model_validate_json(p.model_dump_json())
    assert loaded == p

def test_text_preset_old_saved_json_without_shadow_fields_loads_with_defaults():
    import json
    old_json = json.dumps({"name": "Pop"})
    loaded = TextPreset.model_validate_json(old_json)
    assert loaded.shadow is False
    assert loaded.shadow_color == "#000000"
    assert (loaded.shadow_offset_x, loaded.shadow_offset_y, loaded.shadow_blur) == (4, 4, 0)

def test_media_item_name_defaults_empty():
    m = MediaItem(file_path="clip.mp4", duration=5.0)
    assert m.name == ""

def test_media_item_display_name_uses_custom_name():
    m = MediaItem(file_path="clip.mp4", name="My Video", duration=5.0)
    assert m.display_name == "My Video"

def test_media_item_display_name_falls_back_to_file_path_basename():
    m = MediaItem(file_path="path/to/my-clip.mp4", duration=5.0)
    assert m.display_name == "my-clip.mp4"

def test_media_item_display_name_handles_backslashes():
    m = MediaItem(file_path="path\\to\\my-clip.mp4", duration=5.0)
    assert m.display_name == "my-clip.mp4"

def test_media_item_display_name_ignores_whitespace_only_name():
    m = MediaItem(file_path="path/to/clip.mp4", name="   ", duration=5.0)
    assert m.display_name == "clip.mp4"

def test_media_item_old_json_without_name_field_loads():
    # Ensure backwards compatibility: old JSON dicts without "name" can still be loaded
    old_dict = {"id": "m1", "file_path": "a.mp4", "duration": 4.5, "has_audio": True}
    m = MediaItem(**old_dict)
    assert m.name == ""
    assert m.file_path == "a.mp4"
    assert m.duration == 4.5

def test_media_item_name_round_trip():
    m = MediaItem(file_path="clip.mp4", name="Custom Name", duration=5.0)
    assert MediaItem.model_validate_json(m.model_dump_json()).name == "Custom Name"

def test_clip_layer_volume_and_muted_defaults():
    from app.models import ClipLayer
    c = ClipLayer(media_id="m1", file_path="a.mp4", out_point=2, order=0)
    assert c.volume == 1.0
    assert c.muted is False

def test_clip_layer_volume_and_muted_round_trip():
    from app.models import ClipLayer
    c = ClipLayer(media_id="m1", file_path="a.mp4", out_point=2, order=0, volume=1.5, muted=True)
    loaded = ClipLayer.model_validate_json(c.model_dump_json())
    assert loaded.volume == 1.5
    assert loaded.muted is True

def test_clip_layer_old_saved_json_without_volume_fields_loads_with_defaults():
    from app.models import ClipLayer
    import json
    old_json = json.dumps({"id": "x", "media_id": "m1", "file_path": "a.mp4", "out_point": 2, "order": 0})
    loaded = ClipLayer.model_validate_json(old_json)
    assert loaded.volume == 1.0
    assert loaded.muted is False

def test_media_item_kind_defaults_to_video():
    from app.models import MediaItem
    m = MediaItem(file_path="a.mp4", duration=2.0)
    assert m.kind == "video"

def test_media_item_kind_accepts_image():
    from app.models import MediaItem
    m = MediaItem(file_path="a.jpg", duration=0.0, has_audio=False, kind="image")
    assert m.kind == "image"

def test_media_item_kind_accepts_audio():
    from app.models import MediaItem
    m = MediaItem(file_path="song.mp3", duration=120, kind="audio")
    loaded = MediaItem.model_validate_json(m.model_dump_json())
    assert loaded.kind == "audio"

def test_music_track_defaults():
    from app.models import MusicTrack
    t = MusicTrack(media_id="m1")
    assert t.volume == 0.3
    assert t.muted is False
    assert isinstance(t.id, str) and t.id

def test_project_music_defaults_to_none():
    from app.models import Project
    p = Project(name="r")
    assert p.music is None

def test_project_music_round_trip():
    from app.models import Project, MusicTrack
    p = Project(name="r", music=MusicTrack(media_id="m1", volume=0.5, muted=True))
    loaded = Project.model_validate_json(p.model_dump_json())
    assert loaded.music is not None
    assert loaded.music.media_id == "m1"
    assert loaded.music.volume == 0.5
    assert loaded.music.muted is True

def test_project_old_saved_json_without_music_loads_as_none():
    from app.models import Project
    import json
    old_json = json.dumps({"id": "x", "name": "r"})
    loaded = Project.model_validate_json(old_json)
    assert loaded.music is None
