# Tests for app.transcribe: mapping faster-whisper word segments to CaptionWords.
from unittest.mock import patch
from types import SimpleNamespace as NS
from app.transcribe import words_from_segments, transcribe_file

def test_words_from_segments_flattens_and_orders():
    segs = [NS(words=[NS(word=" Hello", start=0.1, end=0.4), NS(word=" world", start=0.4, end=0.9)]),
            NS(words=[NS(word=" again", start=1.2, end=1.6)])]
    out = words_from_segments(segs)
    assert [w.text for w in out] == ["Hello", "world", "again"]
    assert out[0].t_start == 0.1 and out[2].t_end == 1.6
    assert len({w.id for w in out}) == 3

def test_words_from_segments_skips_none_words():
    segs = [NS(words=None)]
    assert words_from_segments(segs) == []

def test_transcribe_file_passes_language_through():
    fake_model = NS(transcribe=lambda path, word_timestamps, language: ([], NS()))
    with patch("app.transcribe._get_model", return_value=fake_model) as get_model, \
         patch.object(fake_model, "transcribe", wraps=fake_model.transcribe) as transcribe_mock:
        transcribe_file("audio.wav", language="da")
    transcribe_mock.assert_called_once_with("audio.wav", word_timestamps=True, language="da")

def test_transcribe_file_none_language_auto_detects():
    fake_model = NS(transcribe=lambda path, word_timestamps, language: ([], NS()))
    with patch("app.transcribe._get_model", return_value=fake_model), \
         patch.object(fake_model, "transcribe", wraps=fake_model.transcribe) as transcribe_mock:
        transcribe_file("audio.wav")
    transcribe_mock.assert_called_once_with("audio.wav", word_timestamps=True, language=None)

def test_transcribe_file_empty_string_language_auto_detects():
    fake_model = NS(transcribe=lambda path, word_timestamps, language: ([], NS()))
    with patch("app.transcribe._get_model", return_value=fake_model), \
         patch.object(fake_model, "transcribe", wraps=fake_model.transcribe) as transcribe_mock:
        transcribe_file("audio.wav", language="")
    transcribe_mock.assert_called_once_with("audio.wav", word_timestamps=True, language=None)
