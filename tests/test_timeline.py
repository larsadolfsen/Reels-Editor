# Tests for app.timeline: pure sequence math over ordered, trimmed clips.
import pytest
from app.models import ClipLayer
from app.timeline import ordered, clip_duration, sequence_duration, locate

def c(i, o, order): return ClipLayer(file_path=f"{order}.mp4", in_point=i, out_point=o, order=order)

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
