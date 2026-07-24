# Tests for app.text_case: the pure "none"/"upper"/"lower" text transform.
from app.text_case import apply_text_case
from app.models import TextPreset

def test_none_passes_through():
    assert apply_text_case("MiXeD Case", "none") == "MiXeD Case"

def test_upper():
    assert apply_text_case("Hej med øh dig", "upper") == "HEJ MED ØH DIG"

def test_lower():
    assert apply_text_case("BIG News Æble", "lower") == "big news æble"

def test_unknown_value_passes_through():
    assert apply_text_case("AbC", "sponge") == "AbC"

def test_preset_defaults_to_none():
    assert TextPreset(name="x").text_case == "none"
