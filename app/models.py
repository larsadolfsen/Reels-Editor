# Data model for the editor: Project, clip/text/caption layers, savable text presets.
# Exposes Pydantic models with uuid4 ids and JSON round-trip via pydantic.
from uuid import uuid4
from pydantic import BaseModel, Field, model_validator

def new_id() -> str:
    return uuid4().hex

class MediaItem(BaseModel):
    id: str = Field(default_factory=new_id)
    file_path: str
    duration: float

class ClipLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    in_point: float = 0.0   # seconds into source
    out_point: float        # seconds into source (exclusive end)
    order: int

class TextPreset(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    font: str = "Public Sans"
    size_px: int = 96
    color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_px: int = 4
    bold: bool = False
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
    x: int = 540                   # anchor on 1080x1920 canvas
    y: int = 700
    entrance: str = "fade_pop"     # fade_pop|none
    pos_row: str = "mid"           # top|mid|btm — UI position-grid anchor row, x/y derives from this + offset
    pos_col: str = "mid"           # left|mid|right
    offset_x: int = 0
    offset_y: int = 0
    usage_count: int = 0    # how many times this saved preset has been applied to a block; drives the STYLE accordion's "most used" list

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_box_fields(cls, data):
        if isinstance(data, dict) and "box" in data and "box_background" not in data:
            data = dict(data)
            data["box_background"] = data.pop("box")
            if "box_color" in data:
                data["box_background_color"] = data.pop("box_color")
        return data

class TextBlockLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    heading: str
    preset_id: str
    start: float = 0.0             # timeline seconds
    end: float = 3.0

class CaptionWord(BaseModel):
    id: str = Field(default_factory=new_id)
    text: str
    t_start: float
    t_end: float

class CaptionTrack(BaseModel):
    id: str = Field(default_factory=new_id)
    words: list[CaptionWord] = []

class Project(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    width: int = 1080
    height: int = 1920
    fps: int = 30
    media_library: list[MediaItem] = []
    clips: list[ClipLayer] = []
    text_blocks: list[TextBlockLayer] = []
    text_presets: dict[str, TextPreset] = {}
    captions: CaptionTrack | None = None
