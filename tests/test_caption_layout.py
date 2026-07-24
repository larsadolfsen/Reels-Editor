from app.models import CaptionWord
from app.caption_layout import paginate_words

def w(t, a, b): return CaptionWord(text=t, t_start=a, t_end=b)

def _char_width_measurer(px_per_char):
    return lambda text: len(text) * px_per_char

def test_paginate_words_empty_input():
    assert paginate_words([], _char_width_measurer(10), 1000, 1000, 20) == []

def test_paginate_words_sorts_by_start_time():
    words = [w("b", 1.0, 1.5), w("a", 0.0, 0.5)]
    pages = paginate_words(words, _char_width_measurer(10), 1000, 1000, 20)
    assert [x.text for x in pages[0][0]] == ["a", "b"]

def test_paginate_words_expands_multi_word_entries():
    words = [w("talks about this", 0.0, 3.0)]
    pages = paginate_words(words, _char_width_measurer(10), 1000, 1000, 20)
    assert len(pages) == 1 and len(pages[0]) == 1
    assert [x.text for x in pages[0][0]] == ["talks", "about", "this"]

def test_paginate_words_packs_words_that_fit_onto_one_line():
    # "one" + " " + "two" = 7 chars = 70px at 10px/char, fits an 80px-wide box
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0)]
    pages = paginate_words(words, _char_width_measurer(10), 80, 1000, 20)
    assert len(pages) == 1 and len(pages[0]) == 1
    assert [x.text for x in pages[0][0]] == ["one", "two"]

def test_paginate_words_breaks_line_when_width_exceeded():
    # "one" + " " + "two" = 70px > 60px box width -> two separate lines, same page
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0)]
    pages = paginate_words(words, _char_width_measurer(10), 60, 1000, 20)
    assert len(pages) == 1
    assert [[x.text for x in line] for line in pages[0]] == [["one"], ["two"]]

def test_paginate_words_oversized_single_word_gets_its_own_line():
    words = [w("supercalifragilistic", 0.0, 1.0), w("hi", 1.0, 1.5)]
    pages = paginate_words(words, _char_width_measurer(10), 50, 1000, 20)
    assert [[x.text for x in line] for line in pages[0]] == [["supercalifragilistic"], ["hi"]]

def test_paginate_words_paginates_when_height_exceeded():
    # font_size_px=20, line_height=1.15 -> one line is 23px tall; box_height=30 fits only 1 line/page
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0), w("three", 1.0, 1.5)]
    pages = paginate_words(words, _char_width_measurer(10), 10, 30, 20, line_height=1.15)
    assert [len(page) for page in pages] == [1, 1, 1]

def test_paginate_words_multiple_lines_fit_one_page_when_tall_enough():
    # box_height=60 fits 2 lines (2 * 23px = 46px <= 60px, 3 * 23px = 69px > 60px)
    words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0), w("three", 1.0, 1.5)]
    pages = paginate_words(words, _char_width_measurer(10), 10, 60, 20, line_height=1.15)
    assert [len(page) for page in pages] == [2, 1]
