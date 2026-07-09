# Pure ffmpeg export-command builder: per-clip trim, scale/pad to 1080x1920, concat, optional ASS burn.
# Exposes build_export_cmd, escape_filter_path. No subprocess here (see app.media).
from app.models import Project
from app.timeline import ordered

def escape_filter_path(path: str) -> str:
    return path.replace("\\", "/").replace(":", "\\:")

def _num(x: float) -> str:
    return f"{x:g}"

def build_export_cmd(p: Project, out_path: str, ass_path: str | None = None) -> list[str]:
    clips = ordered(p.clips)
    cmd = ["ffmpeg", "-y"]
    parts = []
    for i, c in enumerate(clips):
        cmd += ["-i", c.file_path]
        parts.append(
            f"[{i}:v]trim=start={_num(c.in_point)}:end={_num(c.out_point)},setpts=PTS-STARTPTS,"
            f"scale={p.width}:{p.height}:force_original_aspect_ratio=decrease,"
            f"pad={p.width}:{p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={p.fps}[v{i}];"
            f"[{i}:a]atrim=start={_num(c.in_point)}:end={_num(c.out_point)},asetpts=PTS-STARTPTS[a{i}];")
    streams = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    fc = "".join(parts) + f"{streams}concat=n={len(clips)}:v=1:a=1[vc][a]"
    vmap = "[vc]"
    if ass_path:
        fc += f";[vc]ass='{escape_filter_path(ass_path)}'[vo]"
        vmap = "[vo]"
    cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", out_path]
    return cmd
