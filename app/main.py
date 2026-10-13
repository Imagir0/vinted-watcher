import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import database as db
from . import scanner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(title="Vinted Web Scanner")
INDEX_PATH = Path(__file__).resolve().parent / "templates" / "index.html"
BASE_DIR = Path(__file__).resolve().parent
app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static"
)


@app.on_event("startup")
def startup():
    db.init_db()
    if db.get_config().get("auto_scan"):
        scanner.start_auto()


class ConfigUpdate(BaseModel):
    queries: list | None = None
    pages: int | None = None
    interval_seconds: int | None = None
    excluded_keywords: list | None = None


@app.get("/")
def index():
    return FileResponse(INDEX_PATH)


@app.get("/api/config")
def get_config():
    cfg = db.get_config()
    cfg["auto_running"] = scanner.is_running()
    return cfg


@app.post("/api/config")
def update_config(update: ConfigUpdate):
    updates = update.model_dump(exclude_none=True)
    if "pages" in updates:
        updates["pages"] = max(1, min(10, updates["pages"]))
    if "interval_seconds" in updates:
        updates["interval_seconds"] = max(60, updates["interval_seconds"])
    db.set_config(updates)
    return db.get_config() | {"auto_running": scanner.is_running()}


@app.post("/api/scan")
def scan_now():
    try:
        return {"ok": True, "new_items": scanner.run_scan()}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/auto/{action}")
def auto(action: str):
    if action == "start":
        scanner.start_auto()
    elif action == "stop":
        scanner.stop_auto()
    else:
        return JSONResponse({"ok": False, "error": "action inconnue"}, status_code=400)
    return {"ok": True, "auto_running": scanner.is_running()}


@app.get("/api/items")
def items(limit: int = 500):
    return {"count": limit, "items": db.list_items(limit=limit)}


@app.post("/api/reset")
def reset():
    db.reset_state()
    return {"ok": True}