# Cloud hosting + access gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FastAPI app deployable on Railway (GitHub-connected) with persistent data storage and a shared-password login gate, per `docs/superpowers/specs/2026-07-23-cloud-hosting-auth-design.md`.

**Architecture:** `DATA_DIR` moves from a hardcoded path to an env var. A new `app/auth.py` module signs/verifies a stateless session cookie (itsdangerous). New `GET`/`POST /login` routes issue that cookie against a single shared `APP_PASSWORD`. A Starlette middleware gates every other route behind a valid cookie. A new `Dockerfile` installs `ffmpeg` and the base (non-`ml`) dependencies for Railway's build.

**Tech Stack:** FastAPI/Starlette (existing), itsdangerous (new), Docker (new), Railway GitHub-connected deploy (no CLI/MCP steps from this session).

## Global Constraints

- No accounts/database for auth — one shared `APP_PASSWORD`, verified via `hmac.compare_digest`; the cookie is a signed stateless token, nothing new persisted server-side.
- If `APP_PASSWORD` is unset, auth is skipped entirely — local `uvicorn --reload` dev stays frictionless.
- Only base dependencies (no `dev`/`ml` extras) go into the Docker image — `faster-whisper`/CUDA packages are excluded.
- `transcribe_project` must return `503`, not an unhandled `500`, when the `ml` extra isn't installed.
- Every new/modified file follows the existing header-comment and no-inline-`style` conventions (see root `CLAUDE.md`).
- Every task's commit updates `CLAUDE.md`'s codebase map for the files it touches, in the same commit.

---

### Task 1: `DATA_DIR` resolves from an environment variable

**Files:**
- Modify: `app/main.py:1-13`
- Test: `tests/test_main.py` (append)
- Modify: `CLAUDE.md:25`

**Interfaces:**
- Produces: `app.main._resolve_data_dir() -> Path`, `app.main.DATA_DIR: Path` (unchanged type/usage — every existing call site keeps working).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_main.py` (add `from pathlib import Path` to the top imports alongside the existing ones):

```python
def test_resolve_data_dir_uses_env_var(monkeypatch):
    monkeypatch.setenv("DATA_DIR", "/tmp/custom-data")
    from app.main import _resolve_data_dir
    assert _resolve_data_dir() == Path("/tmp/custom-data")

def test_resolve_data_dir_defaults_to_data(monkeypatch):
    monkeypatch.delenv("DATA_DIR", raising=False)
    from app.main import _resolve_data_dir
    assert _resolve_data_dir() == Path("data")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k resolve_data_dir -v`
Expected: FAIL with `ImportError: cannot import name '_resolve_data_dir'`

- [ ] **Step 3: Implement**

In `app/main.py`, change the top of the file from:

```python
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform
from app.font_metrics import available_weights, WEIGHT_LABELS

DATA_DIR = Path("data")
app = FastAPI()
```

to:

```python
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform
from app.font_metrics import available_weights, WEIGHT_LABELS

def _resolve_data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", "data"))

DATA_DIR = _resolve_data_dir()
app = FastAPI()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: PASS (all tests, including the two new ones and every pre-existing test in the file)

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, change:

```
  main.py           # FastAPI app wiring only (routes -> modules, static mount)
```

to:

```
  main.py           # FastAPI app wiring only (routes -> modules, static mount); DATA_DIR resolves via _resolve_data_dir() from the DATA_DIR env var (default "data"), added 2026-07-23 for cloud hosting
```

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_main.py CLAUDE.md
git commit -m "feat: resolve DATA_DIR from an environment variable"
```

---

### Task 2: `app/auth.py` — session-cookie signing

**Files:**
- Create: `app/auth.py`
- Modify: `pyproject.toml:5`
- Test: `tests/test_auth.py`
- Modify: `CLAUDE.md:25-26` (file tree), `CLAUDE.md` Inventory (new subsection after "### Export pipeline")

**Interfaces:**
- Produces: `auth.SESSION_COOKIE_NAME: str`, `auth.SESSION_MAX_AGE_SECONDS: int`, `auth.create_session_token(secret: str) -> str`, `auth.verify_session_token(token: str, secret: str) -> bool`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth.py`:

```python
# Tests for app.auth's session-cookie signing: round-trip, wrong secret, and tampering.
from app.auth import create_session_token, verify_session_token

def test_valid_token_round_trips():
    token = create_session_token("my-secret")
    assert verify_session_token(token, "my-secret") is True

def test_wrong_secret_fails():
    token = create_session_token("my-secret")
    assert verify_session_token(token, "different-secret") is False

def test_tampered_token_fails():
    token = create_session_token("my-secret")
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    assert verify_session_token(tampered, "my-secret") is False

def test_garbage_token_fails():
    assert verify_session_token("not-a-real-token", "my-secret") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_auth.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.auth'`

- [ ] **Step 3: Add the dependency and implement**

In `pyproject.toml`, change:

```toml
dependencies = ["fastapi", "uvicorn[standard]", "pydantic", "python-multipart", "Pillow", "fonttools[woff]"]
```

to:

```toml
dependencies = ["fastapi", "uvicorn[standard]", "pydantic", "python-multipart", "Pillow", "fonttools[woff]", "itsdangerous"]
```

Run: `.venv/Scripts/pip install -e .[dev]`

Create `app/auth.py`:

```python
# Session-cookie signing for the shared-password login gate: no user accounts, just a signed
# token proving the visitor once submitted APP_PASSWORD. Exposes create_session_token/verify_session_token.
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

SESSION_COOKIE_NAME = "session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30  # 30 days
_SESSION_PAYLOAD = "ok"

def create_session_token(secret: str) -> str:
    return URLSafeTimedSerializer(secret).dumps(_SESSION_PAYLOAD)

def verify_session_token(token: str, secret: str) -> bool:
    try:
        return URLSafeTimedSerializer(secret).loads(token, max_age=SESSION_MAX_AGE_SECONDS) == _SESSION_PAYLOAD
    except (BadSignature, SignatureExpired):
        return False
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_auth.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, change:

```
  main.py           # FastAPI app wiring only (routes -> modules, static mount); DATA_DIR resolves via _resolve_data_dir() from the DATA_DIR env var (default "data"), added 2026-07-23 for cloud hosting
  models.py         # Pydantic data model (Project, ProjectSummary, MediaItem, ClipLayer, VideoBoxLayer, TextPreset, FormatRun, TextBlockLayer, CaptionWord, CaptionTrack)
```

to:

```
  main.py           # FastAPI app wiring only (routes -> modules, static mount); DATA_DIR resolves via _resolve_data_dir() from the DATA_DIR env var (default "data"), added 2026-07-23 for cloud hosting
  auth.py            # session-cookie signing for the shared-password login gate (added 2026-07-23, cloud hosting): create_session_token/verify_session_token (itsdangerous URLSafeTimedSerializer, 30-day max age), no accounts/DB
  models.py         # Pydantic data model (Project, ProjectSummary, MediaItem, ClipLayer, VideoBoxLayer, TextPreset, FormatRun, TextBlockLayer, CaptionWord, CaptionTrack)
```

Then, in `CLAUDE.md`, change:

```
- `static/fonts/` — vendored variable woff2 + generated static per-weight `.ttf` files.

### Settings & safe zones
```

to:

```
- `static/fonts/` — vendored variable woff2 + generated static per-weight `.ttf` files.

### Hosting, auth & deployment

Added 2026-07-23 for the "run this app on Android" project's piece 1 (cloud hosting + access gate) — see `docs/superpowers/specs/2026-07-23-cloud-hosting-auth-design.md`.

- `app/auth.py` — `create_session_token(secret) -> str`/`verify_session_token(token, secret) -> bool`: signs/verifies a stateless session cookie (itsdangerous `URLSafeTimedSerializer`, 30-day max age). No accounts or DB — one shared `APP_PASSWORD`, not per-user.

### Settings & safe zones
```

- [ ] **Step 6: Commit**

```bash
git add app/auth.py pyproject.toml tests/test_auth.py CLAUDE.md
git commit -m "feat: add session-cookie signing for the login gate"
```

---

### Task 3: Login page — `GET`/`POST /login`

**Files:**
- Create: `static/login.html`
- Create: `static/login.js`
- Create: `static/css/components/login.css`
- Modify: `app/main.py`
- Test: `tests/test_main.py` (append)
- Modify: `CLAUDE.md` (file tree + Inventory subsection from Task 2)

**Interfaces:**
- Consumes: `app.auth.SESSION_COOKIE_NAME`, `app.auth.SESSION_MAX_AGE_SECONDS`, `app.auth.create_session_token(secret)` (Task 2).
- Produces: `app.main.APP_PASSWORD: str`, `app.main.SESSION_SECRET: str` (module globals, read by Task 4's middleware), routes `GET /login`, `POST /login`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_main.py`:

```python
def test_login_correct_password_sets_cookie_and_redirects(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    res = client.post("/login", data={"password": "correct-horse"}, follow_redirects=False)
    assert res.status_code == 303
    assert res.headers["location"] == "/"
    assert "session" in res.cookies

def test_login_wrong_password_redirects_without_cookie(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    res = client.post("/login", data={"password": "wrong"}, follow_redirects=False)
    assert res.status_code == 303
    assert res.headers["location"] == "/login?error=1"
    assert "session" not in res.cookies

def test_login_page_serves_html(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "")
    client = TestClient(fastapi_app)
    res = client.get("/login")
    assert res.status_code == 200
    assert "login-form" in res.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k login -v`
Expected: FAIL — `POST`/`GET /login` return 404 (routes don't exist yet)

- [ ] **Step 3: Implement**

Create `static/login.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reels Editor — Login</title>
<link rel="stylesheet" href="/static/css/tokens.css">
<link rel="stylesheet" href="/static/css/base.css">
<link rel="stylesheet" href="/static/css/components/login.css">
</head>
<body>
<div id="login-page">
  <form id="login-form" method="POST" action="/login">
    <h1>Reels Editor</h1>
    <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
    <p id="login-error" hidden>Incorrect password.</p>
    <button type="submit">Log in</button>
  </form>
</div>
<script src="/static/login.js"></script>
</body>
</html>
```

Create `static/login.js`:

```javascript
// Login page: shows the error message when redirected back with ?error=1.
if (new URLSearchParams(window.location.search).get("error") === "1") {
  document.getElementById("login-error").hidden = false;
}
```

Create `static/css/components/login.css`:

```css
/* Full-screen centered password form for the shared-password login gate (GET/POST /login). */
#login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg-0);
}

#login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 280px;
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
}

#login-form h1 {
  font-family: var(--font-ui);
  font-size: 16px;
  color: var(--text);
  margin: 0 0 var(--space-2) 0;
}

#login-form input {
  font-family: var(--font-content);
  font-size: 14px;
  padding: var(--space-2);
  background: var(--bg-1);
  border: 1px solid var(--border);
  color: var(--text);
}

#login-error {
  font-family: var(--font-content);
  font-size: 12px;
  color: var(--danger);
  margin: 0;
}

#login-form button {
  font-family: var(--font-ui);
  font-size: 13px;
  padding: var(--space-2);
  background: var(--accent);
  color: var(--on-accent);
  border: none;
  cursor: pointer;
}
```

In `app/main.py`, change the imports at the top from:

```python
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform
from app.font_metrics import available_weights, WEIGHT_LABELS
```

to:

```python
import hmac
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, Form
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform, auth
from app.font_metrics import available_weights, WEIGHT_LABELS
```

Then, immediately after `app = FastAPI()`, add:

```python
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
```

so the top of the file reads:

```python
def _resolve_data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", "data"))

DATA_DIR = _resolve_data_dir()
app = FastAPI()

APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
```

Then add the two login routes right after the `index()` route:

```python
@app.get("/")
def index():
    return FileResponse("static/index.html")

@app.get("/login")
def login_page():
    return FileResponse("static/login.html")

@app.post("/login")
def login_submit(password: str = Form(...)):
    if APP_PASSWORD and hmac.compare_digest(password, APP_PASSWORD):
        resp = RedirectResponse("/", status_code=303)
        resp.set_cookie(
            auth.SESSION_COOKIE_NAME,
            auth.create_session_token(SESSION_SECRET),
            max_age=auth.SESSION_MAX_AGE_SECONDS,
            httponly=True,
            samesite="lax",
        )
        return resp
    return RedirectResponse("/login?error=1", status_code=303)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: PASS (all tests)

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, change:

```
  export-progress.js     # ExportProgress.start(jobId, {onDone, onFailed}): polls Api.exportStatus every 500ms, drives #panel-export's progress bar
```

to:

```
  export-progress.js     # ExportProgress.start(jobId, {onDone, onFailed}): polls Api.exportStatus every 500ms, drives #panel-export's progress bar
  login.html              # standalone login page (added 2026-07-23, cloud hosting) served at GET /login — password field posting to POST /login, not part of the index.html SPA
  login.js                # login.html's script: shows #login-error when redirected back with ?error=1 (added 2026-07-23, cloud hosting)
```

Then, in `CLAUDE.md`, insert the `login.css` file-tree entry into the existing `components/` list. Change:

```
      safe-zones.css               # #safe-zones: 4 `.safe-zone-*` guide bands (top nav / right action rail / caption area / bottom nav, percentages matching TikTok's real UI chrome) overlaid on #stage — shaded tint + solid accent edge (not dashed) plus opaque label chips (same recipe as .slice-btn) for legibility over arbitrary video content, toggled via [hidden]; #safe-zones-toggle lives in the timeline toolbar (`#timeline-toolbar`, next to zoom −/+, shield icon), preview-only, persisted in localStorage
  fonts/                # vendored variable woff2 (JetBrainsMono-Regular, PublicSans-Regular, 400-700) + static per-weight .ttf files baked by scripts/generate_font_weights.py (for PIL measurement + libass fontsdir)
```

to:

```
      safe-zones.css               # #safe-zones: 4 `.safe-zone-*` guide bands (top nav / right action rail / caption area / bottom nav, percentages matching TikTok's real UI chrome) overlaid on #stage — shaded tint + solid accent edge (not dashed) plus opaque label chips (same recipe as .slice-btn) for legibility over arbitrary video content, toggled via [hidden]; #safe-zones-toggle lives in the timeline toolbar (`#timeline-toolbar`, next to zoom −/+, shield icon), preview-only, persisted in localStorage
      login.css                    # full-screen centered password form for GET/POST /login (added 2026-07-23, cloud hosting)
  fonts/                # vendored variable woff2 (JetBrainsMono-Regular, PublicSans-Regular, 400-700) + static per-weight .ttf files baked by scripts/generate_font_weights.py (for PIL measurement + libass fontsdir)
```

Then append to the "### Hosting, auth & deployment" Inventory subsection (added in Task 2). In `CLAUDE.md`, change:

```
- `app/auth.py` — `create_session_token(secret) -> str`/`verify_session_token(token, secret) -> bool`: signs/verifies a stateless session cookie (itsdangerous `URLSafeTimedSerializer`, 30-day max age). No accounts or DB — one shared `APP_PASSWORD`, not per-user.

### Settings & safe zones
```

to:

```
- `app/auth.py` — `create_session_token(secret) -> str`/`verify_session_token(token, secret) -> bool`: signs/verifies a stateless session cookie (itsdangerous `URLSafeTimedSerializer`, 30-day max age). No accounts or DB — one shared `APP_PASSWORD`, not per-user.
- `app/main.py` — `GET /login` serves `static/login.html`; `POST /login` (form-encoded `password`) compares against `APP_PASSWORD` via `hmac.compare_digest`, sets a signed session cookie and redirects to `/` on match, else redirects to `/login?error=1`.
- `static/login.html`/`static/login.js`/`static/css/components/login.css` — standalone login page (not part of the `index.html` SPA): password field, posts to `/login`, `login.js` shows `#login-error` when redirected back with `?error=1`.

### Settings & safe zones
```

- [ ] **Step 6: Commit**

```bash
git add app/main.py static/login.html static/login.js static/css/components/login.css tests/test_main.py CLAUDE.md
git commit -m "feat: add login page (GET/POST /login)"
```

---

### Task 4: Auth middleware — gate every other route behind the session cookie

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_main.py` (append)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `app.main.APP_PASSWORD`, `app.main.SESSION_SECRET` (Task 3), `app.auth.SESSION_COOKIE_NAME`, `app.auth.verify_session_token` (Task 2).
- Produces: nothing new consumed by later tasks — this is the terminal piece of the auth flow.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_main.py`:

```python
def test_unauthenticated_request_redirected_to_login(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    res = client.get("/", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"] == "/login"

def test_unauthenticated_api_request_returns_401(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    res = client.get("/api/projects", follow_redirects=False)
    assert res.status_code == 401

def test_no_app_password_skips_auth_entirely(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "")
    client = TestClient(fastapi_app)
    res = client.get("/")
    assert res.status_code == 200

def test_valid_cookie_allows_request_through(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    from app import auth
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    token = auth.create_session_token("test-secret")
    client.cookies.set(auth.SESSION_COOKIE_NAME, token)
    res = client.get("/")
    assert res.status_code == 200

def test_tampered_cookie_redirected_to_login(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    from app import auth
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    monkeypatch.setattr("app.main.SESSION_SECRET", "test-secret")
    client = TestClient(fastapi_app)
    client.cookies.set(auth.SESSION_COOKIE_NAME, "garbage-token")
    res = client.get("/", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"] == "/login"

def test_login_page_itself_reachable_without_cookie(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    monkeypatch.setattr("app.main.APP_PASSWORD", "correct-horse")
    client = TestClient(fastapi_app)
    res = client.get("/login")
    assert res.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k "unauthenticated or valid_cookie or tampered_cookie or no_app_password or login_page_itself" -v`
Expected: FAIL — every request currently succeeds regardless of `APP_PASSWORD`/cookie (no middleware yet), so the redirect/401 assertions fail.

- [ ] **Step 3: Implement**

In `app/main.py`, change the import block from:

```python
import hmac
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, Form
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform, auth
from app.font_metrics import available_weights, WEIGHT_LABELS
```

to:

```python
import hmac
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, Form, Request
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from app.models import Project, TextPreset, ProjectSummary, new_id, CaptionTrack
from app import store, media, ffmpeg_cmd, ass_render, timeline, transcribe, export_jobs, waveform, auth
from app.font_metrics import available_weights, WEIGHT_LABELS
```

Then, immediately after the `login_submit` route (added in Task 3) and before `@app.post("/api/projects")`, add:

```python
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not APP_PASSWORD:
            return await call_next(request)
        if request.url.path.startswith("/login") or request.url.path.startswith("/static"):
            return await call_next(request)
        token = request.cookies.get(auth.SESSION_COOKIE_NAME)
        if token and auth.verify_session_token(token, SESSION_SECRET):
            return await call_next(request)
        if request.url.path.startswith("/api/"):
            return Response(status_code=401)
        return RedirectResponse("/login")

app.add_middleware(AuthMiddleware)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -v`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS — no regressions in unrelated test files (the middleware must not break existing route-function-level tests, since those call route functions directly rather than going through `TestClient`/middleware).

- [ ] **Step 6: Update the codebase map**

In `CLAUDE.md`, change:

```
- `app/main.py` — `GET /login` serves `static/login.html`; `POST /login` (form-encoded `password`) compares against `APP_PASSWORD` via `hmac.compare_digest`, sets a signed session cookie and redirects to `/` on match, else redirects to `/login?error=1`.
```

to:

```
- `app/main.py` — `GET /login` serves `static/login.html`; `POST /login` (form-encoded `password`) compares against `APP_PASSWORD` via `hmac.compare_digest`, sets a signed session cookie and redirects to `/` on match, else redirects to `/login?error=1`. `AuthMiddleware` (Starlette `BaseHTTPMiddleware`) gates every other route: skipped entirely when `APP_PASSWORD` is unset; `/login`/`/static` paths always pass through; elsewhere a missing/invalid session cookie redirects to `/login` (or returns `401` for `/api/*` paths).
```

- [ ] **Step 7: Commit**

```bash
git add app/main.py tests/test_main.py CLAUDE.md
git commit -m "feat: add auth middleware gating routes behind the session cookie"
```

---

### Task 5: Transcription 503 fallback when the `ml` extra isn't installed

**Files:**
- Modify: `app/main.py:106-125` (line numbers approximate — locate `transcribe_project`)
- Test: `tests/test_transcribe_route.py` (append)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `app.transcribe.transcribe_file` (existing, unchanged signature).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_transcribe_route.py`:

```python
def test_transcribe_returns_503_when_ml_extra_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATA_DIR", tmp_path)
    p = Project(name="r")
    store.save_project(p, tmp_path)

    with patch("app.main.media.run_export"), \
         patch("app.main.transcribe.transcribe_file", side_effect=ImportError("faster_whisper not installed")):
        res = client.post(f"/api/projects/{p.id}/transcribe")

    assert res.status_code == 503
    assert res.json()["detail"] == "Transcription not available on this deployment"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe_route.py -k 503 -v`
Expected: FAIL with `500` returned instead of `503` (the `ImportError` currently propagates as an unhandled server error)

- [ ] **Step 3: Implement**

In `app/main.py`, change:

```python
@app.post("/api/projects/{pid}/transcribe")
def transcribe_project(pid: str) -> Project:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_dir / f"{p.id[:8]}-audio.wav"

    media.run_export(ffmpeg_cmd.build_audio_cmd(p, str(wav_path)))
    words = transcribe.transcribe_file(str(wav_path))
```

to:

```python
@app.post("/api/projects/{pid}/transcribe")
def transcribe_project(pid: str) -> Project:
    p = store.load_project(pid, DATA_DIR)
    out_dir = DATA_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_dir / f"{p.id[:8]}-audio.wav"

    media.run_export(ffmpeg_cmd.build_audio_cmd(p, str(wav_path)))
    try:
        words = transcribe.transcribe_file(str(wav_path))
    except ImportError:
        raise HTTPException(503, "Transcription not available on this deployment")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_transcribe_route.py -v`
Expected: PASS (all tests, including the two pre-existing ones)

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, find the Captions & transcription Inventory section's `app/main.py` bullet:

```
- `app/main.py` — `POST /api/projects/{pid}/transcribe`.
```

Change it to:

```
- `app/main.py` — `POST /api/projects/{pid}/transcribe`; returns `503` (not an unhandled `500`) when `transcribe.transcribe_file` raises `ImportError` — i.e. when the `ml` extra isn't installed, as on the Railway deployment (added 2026-07-23, cloud hosting).
```

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_transcribe_route.py CLAUDE.md
git commit -m "fix: return 503 instead of 500 when transcription's ml extra is missing"
```

---

### Task 6: Dockerfile, `.dockerignore`, and Railway deploy docs

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docs/deploy-railway.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses `pyproject.toml`'s base dependencies as installed by Tasks 1-5's edits to it).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Create the Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml .
COPY app ./app
COPY static ./static
RUN pip install --no-cache-dir .
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

- [ ] **Step 2: Create `.dockerignore`**

Create `.dockerignore`:

```
.venv
__pycache__
*.pyc
data
tests
docs
.git
.claude
*.md
```

- [ ] **Step 3: Attempt a local build if Docker is available**

Run: `docker build -t tiktok-reels-test .`

- If Docker is installed and the build succeeds: expected output ends with `Successfully tagged tiktok-reels-test:latest` (or the equivalent buildkit "naming to docker.io/library/tiktok-reels-test" line). Run `docker run --rm tiktok-reels-test ffmpeg -version` and confirm it prints an ffmpeg version banner, confirming `ffmpeg` is on `PATH` in the image.
- If Docker is not installed in this environment: skip this step — it will be verified when Railway builds the image (see the checklist in `docs/deploy-railway.md`, created next).

- [ ] **Step 4: Write the Railway deploy docs**

Create `docs/deploy-railway.md`:

```markdown
# Deploying to Railway

This app deploys to Railway as a GitHub-connected service using the repo's `Dockerfile`.

## One-time setup (in the Railway dashboard, not from this repo)

1. Create a new Railway project, connect it to this GitHub repo, and let Railway build from `Dockerfile`.
2. Attach a Volume to the service, mounted at `/data`.
3. Set service environment variables:
   - `DATA_DIR=/data`
   - `APP_PASSWORD=<a password only you know>`
   - `SESSION_SECRET=<a long random string>` — generate one with `python -c "import secrets; print(secrets.token_hex(32))"`
4. Deploy. Railway sets `PORT` automatically; the Dockerfile's `CMD` already reads it.

## What's not included yet

- Transcription (auto-captions) is disabled on this deployment — it returns `503` (see `app/transcribe.py`/`app/main.py`'s `transcribe_project`). Desktop use with the `ml` extra installed is unaffected.
- No way to import new media from the deployed app yet — the native file-picker (`app/media.py`'s `pick_file`/`pick_files`) only works when the server runs on your own machine. Remote media upload is piece 2 of the Android-app project (see `docs/superpowers/specs/2026-07-23-cloud-hosting-auth-design.md`).

## Manual verification checklist (do this once deployed)

- [ ] Visit the Railway URL — you're redirected to `/login`.
- [ ] Enter the wrong password — redisplays the form with an error, no cookie set.
- [ ] Enter the correct password — redirected to `/`, the editor loads, cookie persists across a page reload.
- [ ] Create a project, trigger a redeploy from Railway, confirm the project is still there (volume persistence).
- [ ] Confirm `ffmpeg`/`ffprobe` are on PATH inside the container (Railway's shell/exec into the running service, run `ffmpeg -version`).
```

- [ ] **Step 5: Update the codebase map**

In `CLAUDE.md`, change:

```
- `app/auth.py` — `create_session_token(secret) -> str`/`verify_session_token(token, secret) -> bool`: signs/verifies a stateless session cookie (itsdangerous `URLSafeTimedSerializer`, 30-day max age). No accounts or DB — one shared `APP_PASSWORD`, not per-user.
- `app/main.py` — `GET /login` serves `static/login.html`; `POST /login` (form-encoded `password`) compares against `APP_PASSWORD` via `hmac.compare_digest`, sets a signed session cookie and redirects to `/` on match, else redirects to `/login?error=1`. `AuthMiddleware` (Starlette `BaseHTTPMiddleware`) gates every other route: skipped entirely when `APP_PASSWORD` is unset; `/login`/`/static` paths always pass through; elsewhere a missing/invalid session cookie redirects to `/login` (or returns `401` for `/api/*` paths).
- `static/login.html`/`static/login.js`/`static/css/components/login.css` — standalone login page (not part of the `index.html` SPA): password field, posts to `/login`, `login.js` shows `#login-error` when redirected back with `?error=1`.

### Settings & safe zones
```

to:

```
- `app/auth.py` — `create_session_token(secret) -> str`/`verify_session_token(token, secret) -> bool`: signs/verifies a stateless session cookie (itsdangerous `URLSafeTimedSerializer`, 30-day max age). No accounts or DB — one shared `APP_PASSWORD`, not per-user.
- `app/main.py` — `GET /login` serves `static/login.html`; `POST /login` (form-encoded `password`) compares against `APP_PASSWORD` via `hmac.compare_digest`, sets a signed session cookie and redirects to `/` on match, else redirects to `/login?error=1`. `AuthMiddleware` (Starlette `BaseHTTPMiddleware`) gates every other route: skipped entirely when `APP_PASSWORD` is unset; `/login`/`/static` paths always pass through; elsewhere a missing/invalid session cookie redirects to `/login` (or returns `401` for `/api/*` paths).
- `static/login.html`/`static/login.js`/`static/css/components/login.css` — standalone login page (not part of the `index.html` SPA): password field, posts to `/login`, `login.js` shows `#login-error` when redirected back with `?error=1`.
- `Dockerfile`/`.dockerignore` — `python:3.12-slim` + `ffmpeg`, base (non-`dev`/`ml`) dependencies only; Railway's GitHub-connected service builds from this on push.
- `docs/deploy-railway.md` — one-time Railway dashboard setup (volume, env vars) and the manual post-deploy verification checklist (login flow, volume persistence, `ffmpeg` on `PATH`).

### Settings & safe zones
```

Also add a Run-commands note. In `CLAUDE.md`, change:

```
- Requires `ffmpeg`/`ffprobe` on PATH for clip probing/export (not required for `pytest`, which mocks subprocess calls).
```

to:

```
- Requires `ffmpeg`/`ffprobe` on PATH for clip probing/export (not required for `pytest`, which mocks subprocess calls).
- Cloud deploy: Railway, GitHub-connected, builds from the repo's `Dockerfile`. See `docs/deploy-railway.md` for one-time setup and the post-deploy verification checklist.
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docs/deploy-railway.md CLAUDE.md
git commit -m "feat: add Dockerfile and Railway deploy docs"
```

---

## After all tasks

Run the full suite once more to confirm nothing regressed across the whole piece:

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all tests pass, including every new test added across Tasks 1-5.

At that point, piece 1 (cloud hosting + access gate) is complete and ready for you to connect Railway (per `docs/deploy-railway.md`) and walk through the manual verification checklist together.
