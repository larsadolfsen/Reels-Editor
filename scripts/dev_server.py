# Local dev server launcher: forces DATA_DIR to data-dev/ so live/manual testing
# never reads or writes data/ (real projects). Run via .claude/launch.json.
import os

os.environ.setdefault("DATA_DIR", "data-dev")

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        reload=True,
        host="127.0.0.1",
        port=int(os.environ.get("PORT", "8123")),
    )
