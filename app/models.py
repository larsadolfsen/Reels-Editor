# Data model for the editor: Project, clip/text/caption layers, savable text presets.
# Exposes Pydantic models with uuid4 ids and JSON round-trip via pydantic.
from datetime import datetime, timezone
from uuid import uuid4
from pydantic import BaseModel, Field, model_validator

def new_id() -> str:
    return uuid4().hex

class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    name: str = ""
    duration: float
    has_audio: bool = True

    @property
    def display_name(self) -> str:
        """Return name if non-empty, else the basename of file_path."""
        if self.name.strip():
            return self.name
        # Split on both / and \ to handle cross-platform paths
        return self.file_path.replace("\\", "/").split("/")[-1]

class ClipLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    in_point: float = 0.0   # seconds into source
    out_point: float        # seconds into source (exclusive end)
    order: int
    fill_mode: str = "fit"  # "fit" (letterbox, default) or "fill" (center-crop, no padding)
    speed: float = Field(default=1.0, gt=0)  # playback speed multiplier (UI clamps 0.5-2.0); gt=0 guards clip_duration's divide. timeline duration = (out-in)/speed
    volume: float = Field(default=1.0, ge=0.0, le=2.0)  # UI clamps 0.0-2.0; export volume=<v> filter, preview clamps to <=1.0 (HTML5 audio cap)
    muted: bool = False

class VideoBoxLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    in_point: float = 0.0    # seconds into source
    out_point: float          # seconds into source (exclusive end)
    start: float = 0.0        # timeline seconds; end is always derived (start + out_point - in_point)
    x: int = 0                 # px, left edge on the 1080x1920 canvas
    y: int = 0                 # px, top edge
    width: int = 1080
    height: int                # px; set from source aspect ratio at creation, kept locked on resize
    z_index: int = -1          # new boxes default just below the default text z_index (0)

class TextPreset(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    font: str = "Public Sans"
    size_px: int = 96
    color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_px: int = 4
    weight: int = 400              # 400 | 500 | 600 | 700 — replaces the old `bold: bool`
    italic: bool = False
    underline: bool = False
    box_width_mode: str = "fit"        # "fit" | "fixed"
    box_height_mode: str = "fit"       # "fit" | "fixed"
    box_width: int = 0                 # px on 1080x1920 canvas; used when box_width_mode == "fixed"
    box_height: int = 0                # px; used when box_height_mode == "fixed"
    box_background: bool = False       # was `box`
    box_background_color: str = "#000000"   # was `box_color`
    box_background_opacity: int = 100  # 0-100 percent; drives the Background row's Opacity field
    box_border_width: int = 0
    box_border_color: str = "#FFFFFF"
    box_border_radius: int = 0
    align: str = "center"          # left|center|right
    x: int = 540                   # horizontal px: left/center/right edge of the box, per `align`
    y: int = 700                   # vertical px: always the top edge of the box
    entrance: str = "fade_pop"     # fade_pop|none
    usage_count: int = 0    # how many times this saved preset has been applied to a block; drives the STYLE accordion's "most used" list
    highlight_color: str = "#FFD400"   # shared: caption karaoke highlight color AND rich-text highlight color
    highlight_mode: str = "current_word"   # current_word | progressive_fill; unused by TextBlockLayer consumers
    max_words_per_line: int = 4        # caption line-grouping size; unused by TextBlockLayer consumers
    highlight: bool = False            # block-level highlight default (off); highlight_color above is shared with captions

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_box_fields(cls, data):
        if isinstance(data, dict) and "box" in data and "box_background" not in data:
            data = dict(data)
            data["box_background"] = data.pop("box")
            if "box_color" in data:
                data["box_background_color"] = data.pop("box_color")
        if isinstance(data, dict) and "bold" in data and "weight" not in data:
            data = dict(data)
            data["weight"] = 700 if data.pop("bold") else 400
        return data

class FormatRun(BaseModel):
    # Character-offset range into a TextBlockLayer.heading string. All style fields below are
    # sparse overrides — None means "fall through to the block's base TextPreset" — so an
    # unstyled edit to the base preset (e.g. changing font size) still applies to any part of
    # the heading that isn't explicitly overridden by a run.
    start: int
    end: int
    font: str | None = None
    size_px: int | None = None
    color: str | None = None
    outline_color: str | None = None
    outline_px: int | None = None
    weight: int | None = None
    italic: bool | None = None
    underline: bool | None = None
    highlight: bool | None = None
    highlight_color: str | None = None

class TextBlockLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    heading: str
    preset_id: str
    start: float = 0.0             # timeline seconds
    end: float = 3.0
    z_index: int = 0
    formatting_runs: list[FormatRun] = []   # sparse per-range style overrides; [] = today's flat-style rendering

class CaptionWord(BaseModel):
    id: str = Field(default_factory=new_id)
    text: str
    t_start: float
    t_end: float

class CaptionTrack(BaseModel):
    id: str = Field(default_factory=new_id)
    words: list[CaptionWord] = []
    z_index: int = 0
    preset_id: str = Field(default_factory=new_id)   # points at a TextPreset, same pattern as TextBlockLayer.preset_id

class Project(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    name: str
    width: int = 1080
    height: int = 1920
    fps: int = 30
    media_library: list[MediaItem] = []
    clips: list[ClipLayer] = []
    video_boxes: list[VideoBoxLayer] = []
    text_blocks: list[TextBlockLayer] = []
    text_presets: dict[str, TextPreset] = {}
    captions: CaptionTrack | None = None
    export_filename: str = ""
    export_quality: str = "high"

class ProjectSummary(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
