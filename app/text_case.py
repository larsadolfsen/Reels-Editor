# Pure text-case transform shared by ASS rendering (text blocks + captions):
# apply_text_case maps "upper"/"lower" to str.upper()/str.lower(), anything else passes through.
def apply_text_case(text: str, text_case: str) -> str:
    if text_case == "upper":
        return text.upper()
    if text_case == "lower":
        return text.lower()
    return text
