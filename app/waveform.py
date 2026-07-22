# Waveform peak extraction for the timeline AUDIO row. downsample_pcm16 is a pure function
# (no I/O); peaks_for_media decodes a media file to mono 16-bit PCM via ffmpeg and caches the
# downsampled result as JSON at data/peaks/{media_id}.json — gitignored, invalidated by absence
# only (media files are immutable once imported, so no mtime/hash check is needed).
# Exposes downsample_pcm16, peaks_for_media. Depends on app.media's registry-PATH ffmpeg resolution.
import json
import struct
import subprocess
from pathlib import Path
from app.media import _resolve_cmd, _refreshed_path

PCM_SAMPLE_RATE = 8000  # decode target rate; low enough that even long files decode fast

def downsample_pcm16(pcm_bytes: bytes, sample_rate: int, samples_per_second: int) -> list[float]:
    n = len(pcm_bytes) // 2
    if n == 0:
        return []
    samples = struct.unpack(f"<{n}h", pcm_bytes[: n * 2])
    bucket_size = max(1, sample_rate // samples_per_second)
    peaks = []
    for i in range(0, len(samples), bucket_size):
        bucket = samples[i:i + bucket_size]
        peak = max(abs(s) for s in bucket) / 32768.0
        peaks.append(min(peak, 1.0))
    return peaks

def _ffmpeg_pcm_cmd(path: str) -> list[str]:
    return ["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(PCM_SAMPLE_RATE), "-"]

def _decode_pcm(path: str) -> bytes:
    cmd, env = _resolve_cmd(_ffmpeg_pcm_cmd(path), _refreshed_path())
    out = subprocess.run(cmd, capture_output=True, check=True, env=env)
    return out.stdout

def _cache_path(media_id: str, data_dir) -> Path:
    d = Path(data_dir) / "peaks"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{media_id}.json"

def peaks_for_media(media_id: str, file_path: str, data_dir, samples_per_second: int = 10) -> list[float]:
    cache_file = _cache_path(media_id, data_dir)
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    pcm = _decode_pcm(file_path)
    peaks = downsample_pcm16(pcm, sample_rate=PCM_SAMPLE_RATE, samples_per_second=samples_per_second)
    cache_file.write_text(json.dumps(peaks), encoding="utf-8")
    return peaks
