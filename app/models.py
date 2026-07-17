# Data model for the editor: Project, clip/text/caption layers, savable text presets.
# Exposes Pydantic models with uuid4 ids and JSON round-trip via pydantic.
from uuid import uuid4
from pydantic import BaseModel, Field

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
    box: bool = False
    box_color: str = "#000000"
    align: str = "center"          # left|center|right
    x: int = 540                   # anchor on 1080x1920 canvas
    y: int = 700
    entrance: str = "fade_pop"     # fade_pop|none
    pos_row: str = "mid"           # top|mid|btm — UI position-grid anchor row, x/y derives from this + offset
    pos_col: str = "mid"           # left|mid|right
    offset_x: int = 0
    offset_y: int = 0

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
