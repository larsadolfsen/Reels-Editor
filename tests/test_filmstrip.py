from app.filmstrip import frame_interval, frame_count, generate_filmstrip

def test_frame_interval_is_one_second_under_the_cap():
    assert frame_interval(45.0) == 1.0
    assert frame_interval(120.0) == 1.0

def test_frame_interval_scales_up_past_the_cap():
    # 240s at max_frames=120 must yield an interval that keeps frame_count <= 120
    interval = frame_interval(240.0, max_frames=120)
    assert interval == 2.0

def test_frame_interval_handles_zero_or_negative_duration():
    assert frame_interval(0.0) == 1.0
    assert frame_interval(-5.0) == 1.0

def test_frame_count_matches_expected_sampling():
    assert frame_count(45.0, 1.0) == 45
    assert frame_count(0.4, 1.0) == 1  # always at least 1 frame

def test_frame_count_never_zero():
    assert frame_count(0.0, 1.0) == 1

def test_generate_filmstrip_video_samples_and_tiles_frames(tmp_path, monkeypatch):
    captured_cmd = {}
    def fake_run(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        (tmp_path / "filmstrips" / "media-1.jpg").write_bytes(b"fake-sprite")
    monkeypatch.setattr("app.filmstrip.subprocess.run", fake_run)
    monkeypatch.setattr("app.filmstrip.probe_duration", lambda path: 45.0)

    result = generate_filmstrip("media-1", "c.mp4", tmp_path)

    assert result == tmp_path / "filmstrips" / "media-1.jpg"
    cmd_str = " ".join(captured_cmd["cmd"])
    assert "fps=1/1.0" in cmd_str
    assert "tile=45x1" in cmd_str

def test_generate_filmstrip_image_yields_single_frame_sprite(tmp_path, monkeypatch):
    captured_cmd = {}
    def fake_run(cmd, **kwargs):
        captured_cmd["cmd"] = cmd
        (tmp_path / "filmstrips" / "media-2.jpg").write_bytes(b"fake-sprite")
    monkeypatch.setattr("app.filmstrip.subprocess.run", fake_run)
    monkeypatch.setattr("app.filmstrip.probe_duration", lambda path: 0.0)

    generate_filmstrip("media-2", "c.jpg", tmp_path)

    cmd_str = " ".join(captured_cmd["cmd"])
    assert "tile=1x1" in cmd_str
    cmd = captured_cmd["cmd"]
    assert "-loop" in cmd
    assert cmd[cmd.index("-loop") + 1] == "1"
    assert "-t" in cmd

def test_generate_filmstrip_reuses_cached_file(tmp_path, monkeypatch):
    filmstrip_dir = tmp_path / "filmstrips"
    filmstrip_dir.mkdir()
    cached = filmstrip_dir / "media-3.jpg"
    cached.write_bytes(b"already-cached")

    def fake_run(cmd, **kwargs):
        raise AssertionError("should not invoke ffmpeg when a cached filmstrip exists")
    monkeypatch.setattr("app.filmstrip.subprocess.run", fake_run)

    result = generate_filmstrip("media-3", "c.mp4", tmp_path)
    assert result == cached
