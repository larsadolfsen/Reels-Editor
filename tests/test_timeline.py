# Tests for app.timeline: pure sequence math over ordered, trimmed clips.
import pytest
from app.models import ClipLayer, VideoBoxLayer, TextBlockLayer, Project
from app.timeline import ordered, clip_duration, sequence_duration, locate, video_box_end, banded_layers, slice_clip, clip_starts

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

def test_slice_mid_clip_splits_into_two():
    clips = [c(0, 4, 0), c(0, 4, 1)]              # two 4s clips
    out, new_id = slice_clip(clips, 1.0)          # t=1.0 -> 1s into clip0 (source 1.0)
    assert new_id is not None and len(out) == 3
    by_order = sorted(out, key=lambda x: x.order)
    assert [x.order for x in by_order] == [0, 1, 2]     # contiguous
    first, second = by_order[0], by_order[1]
    assert (first.in_point, first.out_point) == (0, 1.0)
    assert (second.in_point, second.out_point) == (1.0, 4.0)
    assert second.id == new_id and second.id != first.id
    assert second.media_id == first.media_id           # same source media
    assert by_order[2].order == 2                       # the old clip1 shifted 1 -> 2

def test_slice_at_boundary_is_noop():
    clips = [c(0, 4, 0)]
    out, new_id = slice_clip(clips, 0.0)          # exactly at start
    assert new_id is None and len(out) == 1
    out, new_id = slice_clip(clips, 4.0)          # exactly at end (beyond -> ValueError path)
    assert new_id is None and len(out) == 1

def test_slice_within_epsilon_of_boundary_is_noop():
    clips = [c(0, 4, 0)]
    out, new_id = slice_clip(clips, 0.03)         # < eps from start
    assert new_id is None and len(out) == 1

def test_slice_empty_clips_is_noop():
    out, new_id = slice_clip([], 1.0)
    assert new_id is None and out == []

def test_slice_trimmed_clip_uses_source_time():
    clips = [c(2, 6, 0)]                          # in=2, out=6, timeline duration 4
    out, new_id = slice_clip(clips, 1.0)          # 1s timeline -> source 3.0
    by_order = sorted(out, key=lambda x: x.order)
    assert (by_order[0].in_point, by_order[0].out_point) == (2, 3.0)
    assert (by_order[1].in_point, by_order[1].out_point) == (3.0, 6.0)

def test_clip_starts_accumulates_in_order():
    clips = [c(0, 4, 1), c(2, 5, 0)]          # unordered on purpose, durations 4 and 3
    starts = clip_starts(clips)
    assert starts[clips[1].id] == 0.0         # order=0 starts at 0
    assert starts[clips[0].id] == 3.0         # order=1 starts after order=0's 3s duration

def test_clip_starts_speed_scaled():
    clips = [cs(0, 4, 0, 2.0), cs(0, 4, 1, 1.0)]   # timeline durations 2 and 4
    starts = clip_starts(clips)
    assert starts[clips[0].id] == 0.0
    assert starts[clips[1].id] == 2.0

def test_slice_carries_fill_mode_and_speed():
    src = ClipLayer(media_id="m0", file_path="a.mp4", in_point=0, out_point=4, order=0, fill_mode="fill", speed=2.0)
    out, new_id = slice_clip([src], 1.0)          # 2x -> 1s timeline maps to source 2.0
    by_order = sorted(out, key=lambda x: x.order)
    assert by_order[0].out_point == 2.0 and by_order[1].in_point == 2.0
    assert all(x.fill_mode == "fill" and x.speed == 2.0 for x in by_order)
