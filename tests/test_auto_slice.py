# Tests for app.auto_slice: filler/silence detection and the apply_cuts timeline mutation.
import pytest
from app.models import CaptionWord, CaptionTrack, ClipLayer, TextBlockLayer, VideoBoxLayer, Project
from app.auto_slice import (
    normalize_word, detect_filler_ranges, detect_silence_ranges, merge_ranges,
    cut_clip_range, apply_cuts, DEFAULT_FILLER_WORDS,
)

def c(i, o, order): return ClipLayer(media_id=f"m{order}", file_path=f"{order}.mp4", in_point=i, out_point=o, order=order)

def w(text, s, e): return CaptionWord(text=text, t_start=s, t_end=e)

# --- normalize_word / detect_filler_ranges ---

def test_normalize_word_strips_punctuation_and_case():
    assert normalize_word("Um,") == "um"
    assert normalize_word("UH.") == "uh"
    assert normalize_word("don't") == "don't"

def test_detect_filler_ranges_matches_default_list():
    words = [w("So", 0, 0.3), w("um,", 0.3, 0.6), w("hello", 0.6, 1.0), w("Uh...", 1.0, 1.4)]
    ranges = detect_filler_ranges(words, DEFAULT_FILLER_WORDS)
    assert ranges == [(0.3, 0.6, "um,"), (1.0, 1.4, "Uh...")]

def test_detect_filler_ranges_ignores_non_filler_words():
    assert detect_filler_ranges([w("like", 0, 0.3)], DEFAULT_FILLER_WORDS) == []

def test_detect_filler_ranges_empty_words_is_empty():
    assert detect_filler_ranges([], DEFAULT_FILLER_WORDS) == []

def test_detect_filler_ranges_custom_list_supports_other_languages():
    # Danish filler words, e.g. "øh"/"øhm" — a user-supplied list overrides the English default.
    words = [w("øh,", 0, 0.3), w("um", 0.3, 0.6), w("altså", 0.6, 1.0)]
    ranges = detect_filler_ranges(words, ["øh", "altså"])
    assert ranges == [(0, 0.3, "øh,"), (0.6, 1.0, "altså")]

def test_detect_filler_ranges_normalizes_filler_words_list_casing():
    # A filler word stored with different casing/punctuation than how it's typed still matches.
    words = [w("Um,", 0, 0.3)]
    assert detect_filler_ranges(words, ["UM"]) == [(0, 0.3, "Um,")]

# --- detect_silence_ranges ---

def test_detect_silence_ranges_finds_middle_run():
    peaks = [0.5, 0.5] + [0.0] * 10 + [0.5, 0.5]   # 10 buckets of silence at 10/s = 1.0s
    assert detect_silence_ranges(peaks, samples_per_second=10, min_duration=0.4) == [(0.2, 1.2)]

def test_detect_silence_ranges_drops_short_runs():
    peaks = [0.5] * 5 + [0.0] * 2 + [0.5] * 5   # 0.2s run, below the 0.4s min_duration
    assert detect_silence_ranges(peaks, samples_per_second=10, min_duration=0.4) == []

def test_detect_silence_ranges_run_touching_start_and_end():
    peaks = [0.0] * 5 + [0.5] * 2 + [0.0] * 5
    ranges = detect_silence_ranges(peaks, samples_per_second=10, min_duration=0.4)
    assert ranges == [(0.0, 0.5), (0.7, 1.2)]

def test_detect_silence_ranges_respects_threshold():
    peaks = [0.03] * 10   # above the default 0.02 threshold -> not silence
    assert detect_silence_ranges(peaks, samples_per_second=10) == []

# --- merge_ranges ---

def test_merge_ranges_overlapping():
    assert merge_ranges([(0.0, 1.0), (0.5, 1.5)]) == [(0.0, 1.5)]

def test_merge_ranges_near_adjacent_within_gap():
    assert merge_ranges([(0.0, 1.0), (1.03, 2.0)], gap=0.05) == [(0.0, 2.0)]

def test_merge_ranges_disjoint_stay_separate():
    assert merge_ranges([(0.0, 1.0), (2.0, 3.0)], gap=0.05) == [(0.0, 1.0), (2.0, 3.0)]

def test_merge_ranges_unsorted_input():
    assert merge_ranges([(5.0, 6.0), (0.0, 1.0)]) == [(0.0, 1.0), (5.0, 6.0)]

def test_merge_ranges_empty():
    assert merge_ranges([]) == []

# --- cut_clip_range ---

def test_cut_clip_range_removes_middle_of_single_clip():
    clips = [c(0, 10, 0)]                      # one 10s clip
    out = cut_clip_range(clips, 3.0, 4.0)       # cut 1s out of the middle
    assert [x.order for x in out] == [0, 1]
    by_order = sorted(out, key=lambda x: x.order)
    assert (by_order[0].in_point, by_order[0].out_point) == (0, 3.0)
    assert (by_order[1].in_point, by_order[1].out_point) == (4.0, 10.0)

def test_cut_clip_range_spanning_clip_boundary_drops_both_pieces():
    clips = [c(0, 5, 0), c(0, 5, 1)]            # 5s + 5s
    out = cut_clip_range(clips, 4.0, 6.0)       # spans across the boundary at t=5
    assert len(out) == 2
    by_order = sorted(out, key=lambda x: x.order)
    assert (by_order[0].in_point, by_order[0].out_point) == (0, 4.0)
    assert (by_order[1].in_point, by_order[1].out_point) == (1.0, 5.0)   # remainder of clip1
    assert [x.order for x in by_order] == [0, 1]

def test_cut_clip_range_removes_a_whole_clip():
    clips = [c(0, 5, 0), c(0, 5, 1), c(0, 5, 2)]   # three 5s clips
    out = cut_clip_range(clips, 5.0, 10.0)          # exactly the middle clip
    assert len(out) == 2
    by_order = sorted(out, key=lambda x: x.order)
    assert by_order[0].order == 0 and by_order[1].order == 1

# --- apply_cuts ---

def _project_with_layers():
    words = [
        w("hello", 0.0, 1.0),
        w("um", 3.0, 4.0),      # inside the cut range
        w("world", 6.0, 7.0),   # after the cut -> shifts left by 1s
    ]
    return Project(
        name="r",
        clips=[c(0, 5, 0), c(0, 5, 1)],   # 5s + 5s = 10s total
        text_blocks=[TextBlockLayer(heading="A", preset_id="p1", start=7.0, end=8.0)],
        video_boxes=[VideoBoxLayer(media_id="m1", file_path="a.mp4", in_point=0, out_point=2, start=8.0, height=100)],
        captions=CaptionTrack(words=words),
    )

def test_apply_cuts_shortens_sequence_and_shifts_layers_after():
    from app.timeline import sequence_duration
    p = _project_with_layers()
    p = apply_cuts(p, [(3.0, 4.0)])   # 1s cut, fully inside the first clip
    assert sequence_duration(p.clips) == pytest.approx(9.0)
    assert p.text_blocks[0].start == pytest.approx(6.0)
    assert p.text_blocks[0].end == pytest.approx(7.0)
    assert p.video_boxes[0].start == pytest.approx(7.0)

def test_apply_cuts_drops_overlapping_caption_word_and_shifts_the_rest():
    p = _project_with_layers()
    p = apply_cuts(p, [(3.0, 4.0)])
    texts = [(w.text, w.t_start, w.t_end) for w in p.captions.words]
    assert texts == [("hello", 0.0, 1.0), ("world", pytest.approx(5.0), pytest.approx(6.0))]

def test_apply_cuts_leaves_layers_before_cut_untouched():
    p = _project_with_layers()
    p.text_blocks[0].start = 0.5
    p.text_blocks[0].end = 0.8
    p = apply_cuts(p, [(3.0, 4.0)])
    assert p.text_blocks[0].start == 0.5 and p.text_blocks[0].end == 0.8

def test_apply_cuts_merges_overlapping_approved_ranges():
    p1 = _project_with_layers()
    p1 = apply_cuts(p1, [(3.0, 4.0), (3.5, 4.5)])   # overlapping -> merged to (3.0, 4.5)
    p2 = _project_with_layers()
    p2 = apply_cuts(p2, [(3.0, 4.5)])
    from app.timeline import sequence_duration
    assert sequence_duration(p1.clips) == sequence_duration(p2.clips)

def test_apply_cuts_multiple_disjoint_ranges_processed_right_to_left():
    from app.timeline import sequence_duration
    p = Project(name="r", clips=[c(0, 10, 0)])   # single 10s clip
    p = apply_cuts(p, [(1.0, 2.0), (5.0, 6.0)])  # two 1s cuts
    assert sequence_duration(p.clips) == pytest.approx(8.0)

def test_apply_cuts_no_captions_is_noop_for_words():
    p = Project(name="r", clips=[c(0, 10, 0)])
    p = apply_cuts(p, [(1.0, 2.0)])
    assert p.captions is None
