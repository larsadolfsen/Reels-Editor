# Tests for app.media: ffprobe command construction and duration parsing.
from unittest.mock import patch
from app.media import ffprobe_cmd, probe_duration, has_audio_stream, is_image_path

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

def test_is_image_path_true_for_known_image_extensions():
    assert is_image_path("C:/photos/a.jpg") is True
    assert is_image_path("C:/photos/a.JPEG") is True
    assert is_image_path("C:/photos/a.png") is True
    assert is_image_path("C:/photos/a.webp") is True

def test_is_image_path_false_for_video_extensions():
    assert is_image_path("C:/clips/a.mp4") is False
    assert is_image_path("C:/clips/a.mov") is False
