# Tests for app.font_metrics: pure word-wrap logic + the Pillow/fontTools measurement adapter.
from app.font_metrics import wrap_text, pil_font_measurer

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
