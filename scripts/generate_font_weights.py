# scripts/generate_font_weights.py
# One-off dev script: bakes static per-weight .ttf files from the vendored variable fonts in
# static/fonts/, for app/font_metrics.py's FONT_WEIGHT_PATHS registry and libass's fontsdir
# lookup at export time. Run: .venv/Scripts/python scripts/generate_font_weights.py
# Re-run whenever a new font is vendored, or app/font_metrics.py's SOURCES-equivalent changes.
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# (source variable font path, output filename prefix, display family name, {weight: label})
# Only the four standard weights (400/500/600/700) are considered, and only if the source
# font's fvar table actually names an instance at that weight (checked at generation time,
# not hand-maintained here) — see the print output for which weights each font produced.
SOURCES = [
    ("static/fonts/PublicSans-Regular.woff2", "PublicSans", "Public Sans"),
    ("static/fonts/JetBrainsMono-Regular.woff2", "JetBrainsMono", "JetBrains Mono"),
]
STANDARD_WEIGHTS = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}


def _named_instance_weights(font: TTFont) -> set[int]:
    if "fvar" not in font:
        return set()
    return {int(inst.coordinates["wght"]) for inst in font["fvar"].instances if "wght" in inst.coordinates}


def _rename_family(font: TTFont, family_name: str, subfamily_name: str) -> None:
    name_table = font["name"]
    for name_id in (1, 4, 16):
        name_table.setName(family_name, name_id, 3, 1, 0x409)
        name_table.setName(family_name, name_id, 1, 0, 0)
    for name_id in (2, 17):
        name_table.setName(subfamily_name, name_id, 3, 1, 0x409)
        name_table.setName(subfamily_name, name_id, 1, 0, 0)
    name_table.setName((family_name + "-" + subfamily_name).replace(" ", ""), 6, 3, 1, 0x409)


def generate() -> None:
    for src_path, prefix, display_name in SOURCES:
        available = _named_instance_weights(TTFont(src_path))
        for weight, label in STANDARD_WEIGHTS.items():
            if weight not in available:
                print(f"skip {display_name} {label} ({weight}) — no named instance in {src_path}")
                continue
            font = TTFont(src_path)
            font.flavor = None
            instance = instantiateVariableFont(font, {"wght": float(weight)})
            family_name = f"{display_name} {label}"
            _rename_family(instance, family_name, "Regular")
            out_path = f"static/fonts/{prefix}-{label}.ttf"
            instance.save(out_path)
            print(f"wrote {out_path} (family={family_name!r})")


if __name__ == "__main__":
    generate()
