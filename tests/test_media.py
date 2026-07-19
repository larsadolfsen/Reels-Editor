# Tests for app.media: ffprobe command construction and duration parsing.
from unittest.mock import patch
from app.media import ffprobe_cmd, probe_duration, has_audio_stream

def test_ffprobe_cmd():
    assert ffprobe_cmd("c.mp4") == ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "default=noprint_wrappers=1:nokey=1", "c.mp4"]

def test_probe_duration_parses_stdout():
    with patch("app.media.subprocess.run") as r:
        r.return_value.stdout = "12.48\n"
        assert probe_duration("c.mp4") == 12.48

def test_has_audio_stream_true_when_ffprobe_reports_a_stream():
    with patch("app.media.subprocess.run") as r:
        r.return_value.stdout = "audio\n"
        assert has_audio_stream("c.mp4") is True

def test_has_audio_stream_false_when_ffprobe_reports_no_stream():
    with patch("app.media.subprocess.run") as r:
        r.return_value.stdout = ""
        assert has_audio_stream("c.mp4") is False
