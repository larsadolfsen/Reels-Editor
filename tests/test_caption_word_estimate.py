# Tests for app.caption_word_estimate's estimate_word_timings: single-word passthrough,
# multi-word proportional split by character offset, and empty/whitespace-only text.
from app.models import CaptionWord
from app.caption_word_estimate import estimate_word_timings

def w(t, a, b): return CaptionWord(text=t, t_start=a, t_end=b)

def test_single_word_is_unchanged():
    result = estimate_word_timings(w("hi", 1.0, 1.5))
    assert len(result) == 1
    assert result[0].text == "hi"
    assert result[0].t_start == 1.0
    assert result[0].t_end == 1.5

def test_multi_word_splits_proportionally_by_character_length():
    # "talks about this" -> normalized "talks about this" (len 16):
    # "talks" chars 0-5, "about" chars 6-11, "this" chars 12-16
    result = estimate_word_timings(w("talks about this", 0.0, 3.0))
    assert [r.text for r in result] == ["talks", "about", "this"]
    assert result[0].t_start == 0.0
    assert result[0].t_end == 3.0 * 5 / 16
    assert result[1].t_start == 3.0 * 6 / 16
    assert result[1].t_end == 3.0 * 11 / 16
    assert result[2].t_start == 3.0 * 12 / 16
    assert result[2].t_end == 3.0

def test_multi_word_longer_word_gets_longer_window():
    result = estimate_word_timings(w("talks about this", 0.0, 3.0))
    windows = {r.text: r.t_end - r.t_start for r in result}
    assert windows["talks"] == windows["about"]  # both 5 chars
    assert windows["talks"] > windows["this"]     # 5 chars > 4 chars

def test_empty_text_returns_empty_list():
    assert estimate_word_timings(w("", 0.0, 1.0)) == []

def test_whitespace_only_text_returns_empty_list():
    assert estimate_word_timings(w("   ", 0.0, 1.0)) == []

def test_result_words_are_sequential_and_non_overlapping():
    result = estimate_word_timings(w("one two three four", 10.0, 14.0))
    for a, b in zip(result, result[1:]):
        assert a.t_end <= b.t_start
    assert result[0].t_start == 10.0
    assert result[-1].t_end == 14.0
