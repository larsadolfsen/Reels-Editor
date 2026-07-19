### Task 3: ASS rendering — subset support for banding

**Status:** not started

**Depends on:** Task 1 (merged). Independent of Tasks 2, 4–9 — dispatch in parallel with them.

**Files:**
- Modify: `app/ass_render.py`
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: `app.models.TextBlockLayer` (existing), `app.models.TextPreset` (existing).
- Produces: `app.ass_render.render_ass(project, presets, text_blocks=None) -> str` — new optional third parameter. When omitted (`None`), behavior is byte-identical to today (renders `project.text_blocks`). When given a list, renders only those blocks. Consumed by Task 4's `app/main.py` export orchestration (one call per text band from `app.timeline.banded_layers`).

- [ ] **Step 1: Write failing subset-rendering tests**

Add to `tests/test_ass_render.py`:

```python
def test_render_ass_subset_only_renders_given_blocks():
    pr1 = TextPreset(name="A")
    pr2 = TextPreset(name="B")
    b1 = TextBlockLayer(heading="FIRST", preset_id=pr1.id, start=0, end=2)
    b2 = TextBlockLayer(heading="SECOND", preset_id=pr2.id, start=2, end=4)
    p = Project(name="r", text_blocks=[b1, b2])
    out = render_ass(p, {pr1.id: pr1, pr2.id: pr2}, text_blocks=[b1])
    assert "FIRST" in out
    assert "SECOND" not in out

def test_render_ass_subset_none_matches_default_behavior():
    pr = TextPreset(name="A")
    b = TextBlockLayer(heading="ONLY", preset_id=pr.id, start=0, end=2)
    p = Project(name="r", text_blocks=[b])
    assert render_ass(p, {pr.id: pr}, text_blocks=None) == render_ass(p, {pr.id: pr})

def test_render_ass_subset_empty_list_has_no_dialogue_lines():
    pr = TextPreset(name="A")
    b = TextBlockLayer(heading="ONLY", preset_id=pr.id, start=0, end=2)
    p = Project(name="r", text_blocks=[b])
    out = render_ass(p, {pr.id: pr}, text_blocks=[])
    assert not any(l.startswith("Dialogue:") for l in out.splitlines())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k subset -v`
Expected: FAIL — `TypeError: render_ass() got an unexpected keyword argument 'text_blocks'`

- [ ] **Step 3: Add the text_blocks parameter to render_ass**

In `app/ass_render.py`, change the `render_ass` signature and body from:

```python
def render_ass(project: Project, presets: dict[str, TextPreset]) -> str:
    used = {b.preset_id: presets[b.preset_id] for b in project.text_blocks}
    header = (...)
    styles = "\n".join(_style(f"P{p.id[:8]}", p, _resolved_weight(p)) for p in used.values())
    event_lines = []
    for b in project.text_blocks:
```

to:

```python
def render_ass(project: Project, presets: dict[str, TextPreset], text_blocks: list | None = None) -> str:
    blocks = project.text_blocks if text_blocks is None else text_blocks
    used = {b.preset_id: presets[b.preset_id] for b in blocks}
    header = (...)
    styles = "\n".join(_style(f"P{p.id[:8]}", p, _resolved_weight(p)) for p in used.values())
    event_lines = []
    for b in blocks:
```

(Keep the `header`/`styles`/loop-body lines exactly as they are today — only the two `project.text_blocks` references become `blocks`, and `used` iterates a possibly-empty dict correctly since `blocks` may be `[]`.)

Update the module's header comment (line 1) to note the new parameter: `# Generates the ASS subtitle file burned into exports: text-block dialogues (+captions, Task 12). render_ass() accepts an optional text_blocks subset so app/main.py can render one ASS file per z-order band (see app.timeline.banded_layers).`

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: PASS (all, including every pre-existing test — this is a pure additive change, no existing call site passes `text_blocks`, so nothing else changes behavior)

- [ ] **Step 5: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: render_ass accepts a text_blocks subset for z-order banding"
```

**Next session:** This task is independent and complete on its own. If continuing in the same session, move on to Task 4 (`docs/superpowers/plans/2026-07-19-phase-3-video-box/task-4-ffmpeg-export-banding.md`) — it consumes this task's `render_ass(..., text_blocks=...)` signature. If dispatching separately, this should be subagent-driven: "Implement Task 4 from `docs/superpowers/plans/2026-07-19-phase-3-video-box/task-4-ffmpeg-export-banding.md` — Task 3's `render_ass(project, presets, text_blocks=None)` signature is complete and merged."
