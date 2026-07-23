# Speech-to-captions: runs faster-whisper over the assembled reel's audio, preferring CUDA
# and falling back to CPU if the CUDA runtime (e.g. cuBLAS) isn't actually usable on this
# machine. Exposes transcribe_file, words_from_segments. Heavy import is lazy (ml extra).
from app.models import CaptionWord

_model = None
_model_kwargs = {"device": "cuda", "compute_type": "float16"}

def words_from_segments(segments) -> list[CaptionWord]:
    return [CaptionWord(text=w.word.strip(), t_start=w.start, t_end=w.end)
            for seg in segments for w in (seg.words or [])]

def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("large-v3", **_model_kwargs)
    return _model

def _fall_back_to_cpu():
    global _model, _model_kwargs
    _model_kwargs = {"device": "cpu", "compute_type": "int8"}
    _model = None

def _run_transcribe(path: str, language: str | None) -> list[CaptionWord]:
    segments, _info = _get_model().transcribe(path, word_timestamps=True, language=language or None)
    return words_from_segments(segments)

def transcribe_file(path: str, language: str | None = None) -> list[CaptionWord]:
    """language is an ISO 639-1 code (e.g. "da"); None or "" auto-detects.

    A CUDA device can be present (so WhisperModel(...) constructs fine) without its CUDA
    Toolkit runtime libraries (cuBLAS) actually being installed — that failure only surfaces
    as a RuntimeError once transcription runs, not at model construction. On that error, retry
    once on CPU rather than failing every transcription outright.
    """
    try:
        return _run_transcribe(path, language)
    except RuntimeError:
        _fall_back_to_cpu()
        return _run_transcribe(path, language)
