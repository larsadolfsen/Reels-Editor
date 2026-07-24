# Persistence: one JSON file per project under <data>/projects, global <data>/presets.json.
# Exposes save/load for projects and presets. Depends on app.models.
import json
from datetime import datetime, timezone
from pathlib import Path
from app.models import Project, TextPreset

def _projects_dir(data_dir) -> Path:
    d = Path(data_dir) / "projects"; d.mkdir(parents=True, exist_ok=True); return d

def save_project(p: Project, data_dir) -> None:
    p.updated_at = datetime.now(timezone.utc)
    (_projects_dir(data_dir) / f"{p.id}.json").write_text(p.model_dump_json(indent=2), encoding="utf-8")

def load_project(project_id: str, data_dir) -> Project:
    return Project.model_validate_json((_projects_dir(data_dir) / f"{project_id}.json").read_text(encoding="utf-8"))

def list_projects(data_dir) -> list[Project]:
    projects = []
    for f in _projects_dir(data_dir).glob("*.json"):
        try:
            projects.append(Project.model_validate_json(f.read_text(encoding="utf-8")))
        except Exception:
            continue
    return projects

def delete_project(project_id: str, data_dir) -> None:
    (_projects_dir(data_dir) / f"{project_id}.json").unlink(missing_ok=True)

def _presets_path(data_dir) -> Path:
    Path(data_dir).mkdir(parents=True, exist_ok=True); return Path(data_dir) / "presets.json"

def load_presets(data_dir) -> list[TextPreset]:
    p = _presets_path(data_dir)
    if not p.exists(): return []
    return [TextPreset.model_validate(x) for x in json.loads(p.read_text(encoding="utf-8"))]

def save_preset(preset: TextPreset, data_dir) -> None:
    items = [x for x in load_presets(data_dir) if x.id != preset.id] + [preset]
    _presets_path(data_dir).write_text(json.dumps([x.model_dump() for x in items], indent=2), encoding="utf-8")

def delete_preset(preset_id: str, data_dir) -> None:
    items = [x for x in load_presets(data_dir) if x.id != preset_id]
    _presets_path(data_dir).write_text(json.dumps([x.model_dump() for x in items], indent=2), encoding="utf-8")
