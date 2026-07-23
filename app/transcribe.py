# Speech-to-captions: runs faster-whisper (CUDA) over the assembled reel's audio.
# Exposes transcribe_file, words_from_segments. Heavy import is lazy (ml extra).
from app.models import CaptionWord

_model = None

def words_from_segments(segments) -> list[CaptionWord]:
    return [CaptionWord(text=w.word.strip(), t_start=w.start, t_end=w.end)
            for seg in segments for w in (seg.words or [])]

def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    return _model

def transcribe_file(path: str, language: str | None = None) -> list[CaptionWord]:
    """language is an ISO 639-1 code (e.g. "da"); None or "" auto-detects."""
    segments, _info = _get_model().transcribe(path, word_timestamps=True, language=language or None)
    return words_from_segments(segments)
