from app.filmstrip import frame_interval, frame_count

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
