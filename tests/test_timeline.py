# Tests for app.timeline: pure sequence math over ordered, trimmed clips.
import pytest
from app.models import ClipLayer, VideoBoxLayer, TextBlockLayer, Project
from app.timeline import ordered, clip_duration, sequence_duration, locate, video_box_end, banded_layers

def c(i, o, order): return ClipLayer(media_id=f"m{order}", file_path=f"{order}.mp4", in_point=i, out_point=o, order=order)

def cs(i, o, order, speed): return ClipLayer(media_id=f"m{order}", file_path=f"{order}.mp4", in_point=i, out_point=o, order=order, speed=speed)

def test_clip_duration_is_speed_scaled():
    assert clip_duration(cs(0, 4, 0, 2.0)) == 2.0   # 4s source at 2x = 2s timeline
    assert clip_duration(cs(0, 4, 0, 0.5)) == 8.0   # 4s source at 0.5x = 8s timeline
    assert clip_duration(cs(0, 4, 0, 1.0)) == 4.0   # unchanged at 1x

def test_sequence_duration_speed_scaled():
    assert sequence_duration([cs(0, 4, 0, 2.0), cs(0, 4, 1, 1.0)]) == 6.0  # 2 + 4

def test_locate_maps_timeline_to_source_with_speed():
    clips = [cs(0, 4, 0, 2.0), cs(0, 4, 1, 1.0)]     # timeline durations 2 and 4
    clip, src = locate(clips, 1.0);  assert (clip.order, src) == (0, 2.0)   # 1s timeline into 2x clip = 2s source
    clip, src = locate(clips, 2.0);  assert (clip.order, src) == (1, 0.0)   # boundary -> next clip start
    clip, src = locate(clips, 5.0);  assert (clip.order, src) == (1, 3.0)   # 3s into the 1x second clip

def test_math():
    clips = [c(0, 4, 1), c(2, 5, 0)]         # unordered on purpose
    assert [x.order for x in ordered(clips)] == [0, 1]
    assert clip_duration(clips[1]) == 3.0
    assert sequence_duration(clips) == 7.0

def test_locate_maps_timeline_to_source():
    clips = [c(2, 5, 0), c(0, 4, 1)]          # durations 3 and 4
    clip, src = locate(clips, 1.0);  assert (clip.order, src) == (0, 3.0)   # 2 + 1
    clip, src = locate(clips, 3.0);  assert (clip.order, src) == (1, 0.0)   # boundary -> next clip
    clip, src = locate(clips, 6.9);  assert clip.order == 1 and src == pytest.approx(3.9)

def test_locate_out_of_range():
    with pytest.raises(ValueError): locate([c(0, 2, 0)], 2.5)

def test_video_box_end_derived_from_trim():
    v = VideoBoxLayer(media_id="m1", file_path="a.mp4", in_point=1.0, out_point=4.0, start=2.0, height=1920)
    assert video_box_end(v) == 5.0  # 2.0 + (4.0 - 1.0)

def test_banded_layers_no_video_boxes_is_one_text_band():
    p = Project(name="r", text_blocks=[TextBlockLayer(heading="A", preset_id="p1", z_index=0)])
    bands = banded_layers(p)
    assert len(bands) == 1
    assert bands[0]["kind"] == "text"
    assert bands[0]["text_blocks"] == p.text_blocks

def test_banded_layers_no_text_no_video_boxes_is_empty():
    p = Project(name="r")
    assert banded_layers(p) == []

def test_banded_layers_video_box_between_two_text_blocks():
    low = TextBlockLayer(heading="LOW", preset_id="p1", z_index=0)
    high = TextBlockLayer(heading="HIGH", preset_id="p2", z_index=10)
    box = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920, z_index=5)
    p = Project(name="r", text_blocks=[low, high], video_boxes=[box])
    bands = banded_layers(p)
    assert [b["kind"] for b in bands] == ["text", "video_box", "text"]
    assert bands[0]["text_blocks"] == [low]
    assert bands[1]["video_box"] == box
    assert bands[2]["text_blocks"] == [high]

def test_banded_layers_video_box_below_all_text():
    text = TextBlockLayer(heading="A", preset_id="p1", z_index=0)
    box = VideoBoxLayer(media_id="m1", file_path="a.mp4", out_point=5.0, height=1920, z_index=-1)
    p = Project(name="r", text_blocks=[text], video_boxes=[box])
    bands = banded_layers(p)
    assert [b["kind"] for b in bands] == ["video_box", "text"]
