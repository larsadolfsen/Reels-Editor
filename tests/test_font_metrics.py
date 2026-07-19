# Tests for app.font_metrics: pure word-wrap logic + the Pillow/fontTools measurement adapter.
from app.font_metrics import wrap_text, pil_font_measurer, wrap_text_runs

def _char_width_measurer(px_per_char):
    return lambda text: len(text) * px_per_char

def test_wrap_text_keeps_short_line_unwrapped():
    measure = _char_width_measurer(10)
    assert wrap_text("hi there", measure, max_width_px=1000) == "hi there"

def test_wrap_text_breaks_at_word_boundary():
    measure = _char_width_measurer(10)
    # "one two three" is 13 chars = 130px; max 80px must force a break before it overflows
    result = wrap_text("one two three", measure, max_width_px=80)
    assert result == "one two\nthree"

def test_wrap_text_preserves_existing_hard_breaks():
    measure = _char_width_measurer(10)
    result = wrap_text("one two three\nfour", measure, max_width_px=80)
    assert result == "one two\nthree\nfour"

def test_wrap_text_never_produces_empty_line_from_single_long_word():
    measure = _char_width_measurer(10)
    # a single word longer than max_width_px still gets its own line, not dropped
    result = wrap_text("supercalifragilisticexpialidocious", measure, max_width_px=50)
    assert result == "supercalifragilisticexpialidocious"

def test_pil_font_measurer_returns_positive_increasing_width():
    measure = pil_font_measurer("Public Sans", 96)
    short = measure("a")
    longer = measure("a a a")
    assert short > 0
    assert longer > short

from app.font_metrics import available_weights, WEIGHT_LABELS

def test_available_weights_public_sans_has_all_four_standard_weights():
    assert available_weights("Public Sans") == [400, 500, 600, 700]

def test_available_weights_jetbrains_mono_has_no_semibold():
    # JetBrains Mono's vendored variable font has no 600 (SemiBold) named instance.
    assert available_weights("JetBrains Mono") == [400, 500, 700]

def test_weight_labels_cover_all_four_standard_weights():
    assert WEIGHT_LABELS == {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}

def test_pil_font_measurer_accepts_a_weight_and_still_measures():
    measure = pil_font_measurer("Public Sans", 96, weight=700)
    assert measure("a") > 0

def test_pil_font_measurer_bold_weight_is_wider_than_regular():
    regular = pil_font_measurer("Public Sans", 96, weight=400)
    bold = pil_font_measurer("Public Sans", 96, weight=700)
    assert bold("Weight Test") > regular("Weight Test")

from app.font_metrics import nearest_available_weight

def test_nearest_available_weight_returns_exact_match_when_available():
    assert nearest_available_weight("Public Sans", 600) == 600

def test_nearest_available_weight_clamps_to_nearest_when_missing():
    # JetBrains Mono has [400, 500, 700] (no 600); 600 is equidistant from 500 and 700
    # (both 100 away) — min()'s key-based tie-break keeps the first-encountered candidate,
    # and available_weights() returns them sorted ascending, so 500 wins the tie.
    assert nearest_available_weight("JetBrains Mono", 600) == 500

def test_nearest_available_weight_clamps_low_weight_to_lowest_available():
    assert nearest_available_weight("JetBrains Mono", 100) == 400

def test_available_weights_unknown_font_returns_empty_list():
    assert available_weights("Nonexistent Font") == []

def test_wrap_text_runs_matches_wrap_text_for_uniform_width():
    text = "one two three"
    measure = _char_width_measurer(10)
    range_measure = lambda s, e: measure(text[s:e])
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=80)
    assert wrapped == wrap_text(text, measure, max_width_px=80) == "one two\nthree"
    assert [text[s:e] for s, e in spans] == ["one two", "three"]

def test_wrap_text_runs_spans_cover_original_offsets_exactly():
    text = "aa bb cc dd"
    range_measure = lambda s, e: (e - s) * 10  # 10px/char, ignores which chars
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=59)  # fits "aa bb" (5 chars=50px) not "aa bb cc" (8=80px)
    assert wrapped == "aa bb\ncc dd"
    assert spans == [(0, 5), (6, 11)]  # (6,11) skips the space at offset 5, matches "cc dd"

def test_wrap_text_runs_preserves_hard_breaks_with_offsets():
    text = "one two\nthree"
    range_measure = lambda s, e: (e - s) * 10
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=1000)
    assert wrapped == "one two\nthree"
    assert [text[s:e] for s, e in spans] == ["one two", "three"]

def test_wrap_text_runs_mixed_widths_wraps_earlier_than_uniform():
    # Simulates a bold run over "two" (offsets 4-7) that's 3x wider per-char than the rest —
    # a uniform 10px/char measurer would fit "one two" (7 chars=70px) under 75px, but the
    # widened "two" (90px alone) pushes the true width past it, forcing an earlier break before "two".
    text = "one two three"
    def range_measure(s, e):
        width = 0
        for i in range(s, e):
            width += 30 if 4 <= i < 7 else 10
        return width
    wrapped, spans = wrap_text_runs(text, range_measure, max_width_px=75)
    assert wrapped == "one\ntwo\nthree"
    assert [text[s:e] for s, e in spans] == ["one", "two", "three"]
