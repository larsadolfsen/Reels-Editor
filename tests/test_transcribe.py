# Tests for app.transcribe: mapping faster-whisper word segments to CaptionWords, and the
# CUDA-fails-at-runtime -> CPU fallback in transcribe_file.
import pytest
from unittest.mock import patch
from types import SimpleNamespace as NS
import app.transcribe as transcribe_module
from app.transcribe import words_from_segments, transcribe_file, _fall_back_to_cpu

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
    fake_model = NS(transcribe=lambda path, word_timestamps, language, vad_filter, condition_on_previous_text: ([], NS()))
    with patch("app.transcribe._get_model", return_value=fake_model) as get_model, \
         patch.object(fake_model, "transcribe", wraps=fake_model.transcribe) as transcribe_mock:
        transcribe_file("audio.wav", language="da")
    transcribe_mock.assert_called_once_with(
        "audio.wav", word_timestamps=True, language="da",
        vad_filter=True, condition_on_previous_text=False,
    )

def test_transcribe_file_none_language_auto_detects():
    fake_model = NS(transcribe=lambda path, word_timestamps, language, vad_filter, condition_on_previous_text: ([], NS()))
    with patch("app.transcribe._get_model", return_value=fake_model), \
         patch.object(fake_model, "transcribe", wraps=fake_model.transcribe) as transcribe_mock:
        transcribe_file("audio.wav")
    transcribe_mock.assert_called_once_with(
        "audio.wav", word_timestamps=True, language=None,
        vad_filter=True, condition_on_previous_text=False,
    )

def test_transcribe_file_empty_string_language_auto_detects():
    fake_model = NS(transcribe=lambda path, word_timestamps, language, vad_filter, condition_on_previous_text: ([], NS()))
    with patch("app.transcribe._get_model", return_value=fake_model), \
         patch.object(fake_model, "transcribe", wraps=fake_model.transcribe) as transcribe_mock:
        transcribe_file("audio.wav", language="")
    transcribe_mock.assert_called_once_with(
        "audio.wav", word_timestamps=True, language=None,
        vad_filter=True, condition_on_previous_text=False,
    )

def test_transcribe_file_falls_back_to_cpu_on_cuda_runtime_error():
    calls = []
    def fake_transcribe(path, word_timestamps, language, vad_filter, condition_on_previous_text):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")
        return ([], NS())
    fake_model = NS(transcribe=fake_transcribe)
    with patch("app.transcribe._get_model", return_value=fake_model), \
         patch("app.transcribe._fall_back_to_cpu") as fallback_mock:
        result = transcribe_file("audio.wav")
    assert result == []
    assert len(calls) == 2
    fallback_mock.assert_called_once()

def test_fall_back_to_cpu_switches_model_kwargs_and_drops_cached_model():
    transcribe_module._model = object()  # pretend a model is already cached
    transcribe_module._model_kwargs = {"device": "cuda", "compute_type": "float16"}
    try:
        _fall_back_to_cpu()
        assert transcribe_module._model_kwargs == {"device": "cpu", "compute_type": "int8"}
        assert transcribe_module._model is None
    finally:
        transcribe_module._model = None
        transcribe_module._model_kwargs = {"device": "cuda", "compute_type": "float16"}

def test_transcribe_file_raises_if_cpu_fallback_also_fails():
    def always_fails(path, word_timestamps, language, vad_filter, condition_on_previous_text):
        raise RuntimeError("still broken")
    fake_model = NS(transcribe=always_fails)
    with patch("app.transcribe._get_model", return_value=fake_model), \
         patch("app.transcribe._fall_back_to_cpu"):
        with pytest.raises(RuntimeError, match="still broken"):
            transcribe_file("audio.wav")

def test_transcribe_file_calls_on_progress_per_segment():
    segments = [NS(end=1.0, words=None), NS(end=2.0, words=None), NS(end=4.0, words=None)]
    fake_model = NS(transcribe=lambda path, word_timestamps, language, vad_filter, condition_on_previous_text: (segments, NS(duration=4.0)))
    progress = []
    with patch("app.transcribe._get_model", return_value=fake_model):
        transcribe_file("audio.wav", on_progress=progress.append)
    assert progress == [25.0, 50.0, 100.0]

def test_transcribe_file_on_progress_clamps_to_100():
    segments = [NS(end=5.5, words=None)]
    fake_model = NS(transcribe=lambda path, word_timestamps, language, vad_filter, condition_on_previous_text: (segments, NS(duration=5.0)))
    progress = []
    with patch("app.transcribe._get_model", return_value=fake_model):
        transcribe_file("audio.wav", on_progress=progress.append)
    assert progress == [100.0]

def test_transcribe_file_skips_on_progress_when_duration_is_zero():
    segments = [NS(end=1.0, words=None)]
    fake_model = NS(transcribe=lambda path, word_timestamps, language, vad_filter, condition_on_previous_text: (segments, NS(duration=0.0)))
    progress = []
    with patch("app.transcribe._get_model", return_value=fake_model):
        transcribe_file("audio.wav", on_progress=progress.append)
    assert progress == []

def test_transcribe_file_works_without_on_progress():
    segments = [NS(end=1.0, words=[NS(word=" hi", start=0.0, end=1.0)])]
    fake_model = NS(transcribe=lambda path, word_timestamps, language, vad_filter, condition_on_previous_text: (segments, NS(duration=1.0)))
    with patch("app.transcribe._get_model", return_value=fake_model):
        result = transcribe_file("audio.wav")
    assert [w.text for w in result] == ["hi"]
