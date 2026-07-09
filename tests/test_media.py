# Tests for app.media: ffprobe command construction and duration parsing.
from unittest.mock import patch
from app.media import ffprobe_cmd, probe_duration

def test_ffprobe_cmd():
    assert ffprobe_cmd("c.mp4") == ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                    "-of", "default=noprint_wrappers=1:nokey=1", "c.mp4"]

def test_probe_duration_parses_stdout():
    with patch("app.media.subprocess.run") as r:
        r.return_value.stdout = "12.48\n"
        assert probe_duration("c.mp4") == 12.48
