# Tests for app.media: ffprobe command construction, duration parsing, and -progress line parsing.
from unittest.mock import patch
from app.media import ffprobe_cmd, probe_duration, has_audio_stream, percent_from_progress_line

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

def test_percent_from_progress_line_parses_out_time_us():
    assert percent_from_progress_line("out_time_us=2000000", 10.0) == 20.0

def test_percent_from_progress_line_ignores_non_out_time_keys():
    assert percent_from_progress_line("frame=120", 10.0) is None
    assert percent_from_progress_line("progress=continue", 10.0) is None

def test_percent_from_progress_line_clamps_to_100():
    assert percent_from_progress_line("out_time_us=999999999", 10.0) == 100.0

def test_percent_from_progress_line_handles_non_numeric_value():
    assert percent_from_progress_line("out_time_us=N/A", 10.0) is None

def test_percent_from_progress_line_returns_none_for_zero_duration():
    assert percent_from_progress_line("out_time_us=2000000", 0.0) is None
