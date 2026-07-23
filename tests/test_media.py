# Tests for app.media: ffprobe command construction, duration parsing, and -progress line parsing.
from unittest.mock import patch
import pytest
from app.media import ffprobe_cmd, probe_duration, has_audio_stream, percent_from_progress_line, run_export, is_image_path, _filedialog_options, generate_thumbnail

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

class _FakeStdout:
    def __init__(self, lines):
        self._lines = iter(lines)
    def __iter__(self):
        return self
    def __next__(self):
        return next(self._lines)
    def close(self):
        pass

def test_run_export_streams_progress_and_calls_on_progress(monkeypatch):
    calls = []

    class FakeProc:
        def __init__(self):
            self.stdout = _FakeStdout(["out_time_us=1000000\n", "out_time_us=2000000\n", "progress=end\n"])
            self.returncode = 0
        def wait(self):
            pass

    def fake_popen(cmd, **kwargs):
        assert "-progress" in cmd
        assert "pipe:1" in cmd
        return FakeProc()

    monkeypatch.setattr("app.media.subprocess.Popen", fake_popen)
    run_export(["ffmpeg", "-y", "-i", "a.mp4", "out.mp4"], on_progress=calls.append, total_duration=10.0)
    assert calls == [10.0, 20.0]

def test_run_export_without_progress_args_skips_progress_flags(monkeypatch):
    class FakeProc:
        stdout = None
        returncode = 0
        def wait(self):
            pass

    captured_cmd = {}

    def fake_popen(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        return FakeProc()

    monkeypatch.setattr("app.media.subprocess.Popen", fake_popen)
    run_export(["ffmpeg", "-y", "-i", "a.mp4", "out.mp4"])
    assert "-progress" not in captured_cmd["cmd"]

def test_run_export_raises_with_stderr_on_failure(monkeypatch):
    class FakeProc:
        stdout = None
        returncode = 1
        def wait(self):
            pass

    def fake_popen(cmd, stderr, **kwargs):
        stderr.write("boom: bad codec")
        stderr.seek(0)
        return FakeProc()

    monkeypatch.setattr("app.media.subprocess.Popen", fake_popen)
    with pytest.raises(RuntimeError, match="boom: bad codec"):
        run_export(["ffmpeg", "-y", "out.mp4"])

def test_is_image_path_true_for_known_image_extensions():
    assert is_image_path("C:/photos/a.jpg") is True
    assert is_image_path("C:/photos/a.JPEG") is True
    assert is_image_path("C:/photos/a.png") is True
    assert is_image_path("C:/photos/a.webp") is True

def test_is_image_path_false_for_video_extensions():
    assert is_image_path("C:/clips/a.mp4") is False
    assert is_image_path("C:/clips/a.mov") is False

def test_filedialog_options_video_default_matches_current_media_filter():
    title, filetypes = _filedialog_options("video")
    assert title == "Choose a clip"
    assert filetypes == [
        ("Media files", "*.mp4 *.mov *.mkv *.jpg *.jpeg *.png *.webp"),
        ("Video files", "*.mp4 *.mov *.mkv"),
        ("Image files", "*.jpg *.jpeg *.png *.webp"),
        ("All files", "*.*"),
    ]

def test_filedialog_options_audio():
    title, filetypes = _filedialog_options("audio")
    assert title == "Choose a music file"
    assert filetypes == [("Audio files", "*.mp3 *.wav *.m4a *.aac *.ogg *.flac"), ("All files", "*.*")]

def test_filedialog_options_unknown_kind_falls_back_to_video():
    title, filetypes = _filedialog_options("bogus")
    assert title == "Choose a clip"

def test_generate_thumbnail_video_extracts_frame_at_1s(tmp_path, monkeypatch):
    captured_cmd = {}
    def fake_run(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        (tmp_path / "thumbnails" / "media-1.jpg").write_bytes(b"fake-jpeg")
    monkeypatch.setattr("app.media.subprocess.run", fake_run)

    result = generate_thumbnail("media-1", "c.mp4", tmp_path)

    assert result == tmp_path / "thumbnails" / "media-1.jpg"
    assert "-ss" in captured_cmd["cmd"]
    assert "1" in captured_cmd["cmd"]
    assert "-vframes" in captured_cmd["cmd"]

def test_generate_thumbnail_image_skips_frame_seek(tmp_path, monkeypatch):
    captured_cmd = {}
    def fake_run(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        (tmp_path / "thumbnails" / "media-2.jpg").write_bytes(b"fake-jpeg")
    monkeypatch.setattr("app.media.subprocess.run", fake_run)

    generate_thumbnail("media-2", "c.jpg", tmp_path)

    assert "-ss" not in captured_cmd["cmd"]
    assert "-vframes" not in captured_cmd["cmd"]

def test_generate_thumbnail_reuses_cached_file(tmp_path, monkeypatch):
    thumb_dir = tmp_path / "thumbnails"
    thumb_dir.mkdir()
    cached = thumb_dir / "media-3.jpg"
    cached.write_bytes(b"already-cached")

    def fake_run(cmd, **kwargs):
        raise AssertionError("should not invoke ffmpeg when a cached thumbnail exists")
    monkeypatch.setattr("app.media.subprocess.run", fake_run)

    result = generate_thumbnail("media-3", "c.mp4", tmp_path)
    assert result == cached
