# Tests for app.waveform: pure PCM downsampling (no ffmpeg) + cache-aware peaks_for_media
# (ffmpeg subprocess mocked, matching tests/test_media.py's pattern).
import json
import struct
from unittest.mock import patch, MagicMock
from app.waveform import downsample_pcm16, peaks_for_media

def _pcm16(samples: list[int]) -> bytes:
    return struct.pack(f"<{len(samples)}h", *samples)

def test_downsample_silence_gives_zero_peaks():
    pcm = _pcm16([0] * 8000)  # 1 second of silence at 8000 Hz
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert len(peaks) == 10
    assert all(p == 0.0 for p in peaks)

def test_downsample_full_scale_gives_peak_one():
    pcm = _pcm16([32767] * 800)  # one bucket's worth at 8000Hz/10sps = 800 samples/bucket
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert len(peaks) == 1
    # max positive int16 (32767) divided by 32768.0 approaches but never reaches exactly 1.0 —
    # only -32768 (clamped via min(peak, 1.0)) hits the ceiling exactly.
    assert peaks[0] == 32767 / 32768.0

def test_downsample_takes_max_abs_per_bucket():
    samples = [0] * 799 + [-16384]  # one bucket, one loud negative sample
    pcm = _pcm16(samples)
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert peaks[0] == 16384 / 32768.0

def test_downsample_bucket_count_matches_duration():
    pcm = _pcm16([100] * 8000 * 3)  # 3 seconds
    peaks = downsample_pcm16(pcm, sample_rate=8000, samples_per_second=10)
    assert len(peaks) == 30

def test_downsample_empty_pcm_gives_empty_peaks():
    assert downsample_pcm16(b"", sample_rate=8000, samples_per_second=10) == []

def test_peaks_for_media_decodes_and_caches(tmp_path):
    pcm = _pcm16([32767] * 800)
    with patch("app.waveform.subprocess.run") as run:
        run.return_value = MagicMock(stdout=pcm, returncode=0)
        peaks = peaks_for_media("media1", "song.mp3", tmp_path, samples_per_second=10)
    assert peaks == [32767 / 32768.0]
    cache_file = tmp_path / "peaks" / "media1.json"
    assert cache_file.exists()
    assert json.loads(cache_file.read_text()) == [32767 / 32768.0]

def test_peaks_for_media_uses_cache_without_calling_ffmpeg(tmp_path):
    cache_dir = tmp_path / "peaks"
    cache_dir.mkdir()
    (cache_dir / "media1.json").write_text(json.dumps([0.5, 0.6]))
    with patch("app.waveform.subprocess.run") as run:
        peaks = peaks_for_media("media1", "song.mp3", tmp_path, samples_per_second=10)
    run.assert_not_called()
    assert peaks == [0.5, 0.6]
