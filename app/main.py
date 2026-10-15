import logging
import json

from fastapi.responses import StreamingResponse
from .profile import iter_public_profile_events, ProfileFetchError
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi import HTTPException, Query
from fastapi.responses import HTMLResponse

from . import database as db
from . import scanner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(title="Vinted Web Scanner")

BASE_DIR = Path(__file__).resolve().parent
INDEX_PATH = BASE_DIR / "templates" / "index.html"
PROFILE_PATH = BASE_DIR / "templates" / "profile.html"

app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static",
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


class SavedSearchLoad(BaseModel):
    id: int


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
        updates["interval_seconds"] = max(
            60, updates["interval_seconds"]
        )

    db.set_config(updates)
    return db.get_config() | {"auto_running": scanner.is_running()}


@app.post("/api/scan")
def scan_now():
    try:
        return {"ok": True, "new_items": scanner.run_scan()}
    except Exception as exc:
        logging.exception("Échec du scan manuel")
        return JSONResponse(
            {"ok": False, "error": str(exc)},
            status_code=500,
        )


@app.post("/api/auto/{action}")
def auto(action: str):
    if action == "start":
        scanner.start_auto()
    elif action == "stop":
        scanner.stop_auto()
    else:
        return JSONResponse(
            {"ok": False, "error": "action inconnue"},
            status_code=400,
        )

    return {"ok": True, "auto_running": scanner.is_running()}


@app.get("/api/items")
def items(limit: int = 2000):
    cfg = db.get_config()
    keys = db.active_search_keys(cfg.get("queries", []))
    results = db.list_items_for_searches(keys, limit=limit)
    return {"count": len(results), "items": results}


@app.get("/api/stats")
def stats():
    cfg = db.get_config()
    keys = db.active_search_keys(cfg.get("queries", []))
    return db.get_price_trend(keys)


@app.get("/api/saved-searches")
def get_saved_searches():
    return {"items": db.list_saved_searches()}


@app.post("/api/saved-searches")
def create_saved_search():
    saved = db.save_search(db.get_config())
    return {"ok": True, "item": saved}


@app.post("/api/saved-searches/load")
def load_saved_search(data: SavedSearchLoad):
    saved = db.get_saved_search(data.id)

    if saved is None:
        return JSONResponse(
            {"ok": False, "error": "Recherche introuvable."},
            status_code=404,
        )

    db.set_config(saved["config"])

    return {
        "ok": True,
        "item": saved,
        "config": db.get_config(),
        "auto_running": scanner.is_running(),
    }


@app.delete("/api/saved-searches/{search_id}")
def remove_saved_search(search_id: int):
    if not db.delete_saved_search(search_id):
        return JSONResponse(
            {"ok": False, "error": "Recherche introuvable."},
            status_code=404,
        )

    return {"ok": True}


@app.get("/api/items-legacy")
def legacy_items(limit: int = 500):
    """Accès à toutes les annonces, conservé pour les besoins de diagnostic."""
    return {"items": db.list_items(limit=limit)}


@app.post("/api/reset")
def reset():
    db.reset_state()
    return {"ok": True}


@app.get("/profile", response_class=HTMLResponse)
def profile_page():
    if not PROFILE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Le template profile.html est introuvable.",
        )
    return FileResponse(PROFILE_PATH, media_type="text/html")


@app.get("/api/profile/{member_id}")
def profile_data(member_id: str):
    async def event_stream():
        async for message in iter_public_profile_events(member_id):
            event = message["event"]
            data = json.dumps(
                message["data"],
                ensure_ascii=False,
            )

            yield f"event: {event}\ndata: {data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


GLOBAL_SEARCH_PATH = (
    BASE_DIR / "templates" / "global-search" / "global-search.html"
)


@app.get("/global-search", response_class=HTMLResponse)
def global_search_page():
    if not GLOBAL_SEARCH_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Template introuvable : {GLOBAL_SEARCH_PATH}",
        )

    return FileResponse(GLOBAL_SEARCH_PATH, media_type="text/html")
