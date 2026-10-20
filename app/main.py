import logging
import json
import subprocess
import sys
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import database as db
from . import scanner
from . import filters_sync
from .profile.profile import iter_public_profile_events


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(title="Vinted Web Scanner")

# ============================================================
# CHEMINS DU PROJET
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"

FAVICON_PATH = BASE_DIR / "static" / "favicon.ico"
INDEX_PATH = FRONTEND_DIR / "index.html"

SEARCH_PATH = STATIC_DIR / "components" / "search" / "search.html"
SCAN_PATH = STATIC_DIR / "components" / "scan" / "scan.html"
PARAMETERS_PATH = STATIC_DIR / "components" / "parameters" / "parameters.html"
PROFILE_PATH = STATIC_DIR / "components" / "profile" / "profile.html"

DATA_DIR = PROJECT_DIR / "data"


# ============================================================
# FICHIERS STATIQUES
# ============================================================

app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static",
)

app.mount(
    "/data",
    StaticFiles(directory=DATA_DIR),
    name="data",
)

app.mount(
    "/assets",
    StaticFiles(directory=FRONTEND_DIR / "assets"),
    name="assets",
)


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    if not FAVICON_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="Favicon introuvable.",
        )

    return FileResponse(
        FAVICON_PATH,
        media_type="image/x-icon",
    )


@app.get("/index.css")
def index_css():
    css_path = FRONTEND_DIR / "index.css"

    if not css_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Fichier index.css introuvable.",
        )

    return FileResponse(
        css_path,
        media_type="text/css",
    )


@app.get("/profile.js")
def profile_js():
    js_path = BASE_DIR / "profile" / "profile.js"

    if not js_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Fichier profile.js introuvable : {js_path}",
        )

    return FileResponse(
        js_path,
        media_type="application/javascript",
    )


# ============================================================
# DÉMARRAGE
# ============================================================

@app.on_event("startup")
def startup():
    db.init_db()

    if db.get_config().get("auto_scan"):
        scanner.start_auto()


# ============================================================
# MODÈLES
# ============================================================

class ConfigUpdate(BaseModel):
    queries: list | None = None
    pages: int | None = None
    interval_seconds: int | None = None
    excluded_keywords: list | None = None


class SavedSearchLoad(BaseModel):
    id: int


# ============================================================
# PAGES
# ============================================================

@app.get("/")
def index():
    if not INDEX_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Fichier index.html introuvable : {INDEX_PATH}",
        )

    return FileResponse(
        INDEX_PATH,
        media_type="text/html",
    )


@app.get("/search", response_class=FileResponse)
def search_page():
    if not SEARCH_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Fichier search.html introuvable : {SEARCH_PATH}",
        )

    return FileResponse(SEARCH_PATH, media_type="text/html")


@app.get("/scan", response_class=FileResponse)
def scan_page():
    if not SCAN_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Fichier scan.html introuvable : {SCAN_PATH}",
        )

    return FileResponse(SCAN_PATH, media_type="text/html")


@app.get("/parameters", response_class=FileResponse)
def parameters_page():
    if not PARAMETERS_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Fichier parameters.html introuvable : {PARAMETERS_PATH}",
        )

    return FileResponse(PARAMETERS_PATH, media_type="text/html")


@app.get("/profile", response_class=FileResponse)
def profile_page():
    if not PROFILE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Fichier profile.html introuvable : {PROFILE_PATH}",
        )

    return FileResponse(PROFILE_PATH, media_type="text/html")


# ============================================================
# CONFIGURATION
# ============================================================

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
            60,
            updates["interval_seconds"],
        )

    db.set_config(updates)

    return db.get_config() | {
        "auto_running": scanner.is_running(),
    }


# ============================================================
# SCAN DES ARTICLES
# ============================================================

@app.post("/api/scan")
def scan_now():
    try:
        return {
            "ok": True,
            "new_items": scanner.run_scan(),
        }

    except Exception as exc:
        logging.exception("Échec du scan manuel")

        return JSONResponse(
            {
                "ok": False,
                "error": str(exc),
            },
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
            {
                "ok": False,
                "error": "action inconnue",
            },
            status_code=400,
        )

    return {
        "ok": True,
        "auto_running": scanner.is_running(),
    }


@app.get("/api/items")
def items(limit: int = 2000):
    cfg = db.get_config()
    keys = db.active_search_keys(cfg.get("queries", []))
    results = db.list_items_for_searches(keys, limit=limit)

    return {
        "count": len(results),
        "items": results,
    }


@app.get("/api/stats")
def stats():
    cfg = db.get_config()
    keys = db.active_search_keys(cfg.get("queries", []))
    return db.get_price_trend(keys)


@app.post("/api/reset")
def reset():
    db.reset_state()
    return {"ok": True}


# ============================================================
# RECHERCHES SAUVEGARDÉES
# ============================================================

@app.get("/api/saved-searches")
def get_saved_searches():
    return {
        "items": db.list_saved_searches(),
    }


@app.post("/api/saved-searches")
def create_saved_search():
    saved = db.save_search(db.get_config())

    return {
        "ok": True,
        "item": saved,
    }


@app.post("/api/saved-searches/load")
def load_saved_search(data: SavedSearchLoad):
    saved = db.get_saved_search(data.id)

    if saved is None:
        return JSONResponse(
            {
                "ok": False,
                "error": "Recherche introuvable.",
            },
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
            {
                "ok": False,
                "error": "Recherche introuvable.",
            },
            status_code=404,
        )

    return {"ok": True}


# ============================================================
# PROFIL PUBLIC
# ============================================================

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


# ============================================================
# FILTRES VINTED
# ============================================================

@app.get("/api/filters")
def get_filters():
    try:
        data = filters_sync.read_filters()

    except (OSError, json.JSONDecodeError):
        logging.exception("Impossible de lire vinted_filters.json")

        raise HTTPException(
            status_code=500,
            detail="Le fichier des filtres est illisible.",
        )

    if data is None:
        raise HTTPException(
            status_code=404,
            detail="Aucun référentiel disponible. Lance une synchronisation.",
        )

    return data


@app.post("/api/filters/sync")
def sync_filters():
    try:
        return filters_sync.sync_filters()

    except RuntimeError as exc:
        logging.warning(
            "Synchronisation des filtres interrompue : %s",
            exc,
        )

        return JSONResponse(
            {"ok": False, "error": str(exc)},
            status_code=409 if "déjà en cours" in str(exc) else 502,
        )

    except Exception:
        logging.exception("Échec de la synchronisation des filtres Vinted")

        return JSONResponse(
            {
                "ok": False,
                "error": (
                    "La synchronisation a échoué. "
                    "Le fichier JSON précédent a été conservé."
                ),
            },
            status_code=502,
        )


# ============================================================
# SYNCHRONISATION DES CATÉGORIES
# ============================================================

category_scan_process = None
category_scan_lock = threading.Lock()


@app.post("/api/categories/scan")
def scan_categories():
    global category_scan_process

    script_path = DATA_DIR / "categories" / "scan_categories.py"
    log_path = DATA_DIR / "categories" / "scan_categories.log"
    progress_path = DATA_DIR / "categories" / "categories_progress.json"

    if not script_path.is_file():
        return JSONResponse(
            {
                "ok": False,
                "error": f"Script introuvable : {script_path}",
            },
            status_code=404,
        )

    with category_scan_lock:
        if (
            category_scan_process is not None
            and category_scan_process.poll() is None
        ):
            return {
                "ok": True,
                "status": "running",
                "message": (
                    "Récupération des catégories en cours. "
                    "Vous pouvez changer de page : le scan continue en arrière-plan."
                ),
            }

        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)

            with progress_path.open("w", encoding="utf-8") as file:
                json.dump(
                    {
                        "status": "running",
                        "scanned_ids": 0,
                        "total_ids": 0,
                        "progress_percent": 0,
                        "categories_found": 0,
                        "progress_label": "Préparation du scan…",
                        "message": "Démarrage du scan des catégories…",
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            with log_path.open("w", encoding="utf-8") as log_file:
                category_scan_process = subprocess.Popen(
                    [sys.executable, str(script_path)],
                    cwd=str(PROJECT_DIR),
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )

            return {
                "ok": True,
                "status": "running",
                "message": "Récupération des catégories lancée.",
            }

        except Exception as exc:
            logging.exception("Impossible de lancer scan_categories.py")

            return JSONResponse(
                {
                    "ok": False,
                    "error": str(exc),
                },
                status_code=500,
            )


@app.get("/api/categories/scan/status")
def category_scan_status():
    progress_path = DATA_DIR / "categories" / "categories_progress.json"

    if not progress_path.is_file():
        return {
            "status": "idle",
            "message": "Aucun scan n'a encore été lancé.",
        }

    try:
        with progress_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    except (OSError, json.JSONDecodeError):
        logging.exception("Impossible de lire la progression des catégories.")

        return JSONResponse(
            {
                "status": "error",
                "message": "Impossible de lire la progression du scan.",
            },
            status_code=500,
        )


# ============================================================
# SYNCHRONISATION DES TAILLES
# ============================================================

size_scan_process = None
size_scan_lock = threading.Lock()


@app.post("/api/sizes/scan")
def scan_sizes():
    global size_scan_process

    script_path = DATA_DIR / "sizes" / "scan_sizes.py"
    log_path = DATA_DIR / "sizes" / "scan_sizes.log"
    progress_path = DATA_DIR / "sizes" / "sizes_progress.json"

    if not script_path.is_file():
        return JSONResponse(
            {
                "ok": False,
                "error": f"Script introuvable : {script_path}",
            },
            status_code=404,
        )

    with size_scan_lock:
        if (
            size_scan_process is not None
            and size_scan_process.poll() is None
        ):
            return {
                "ok": True,
                "status": "running",
                "message": "Récupération des tailles déjà en cours.",
            }

        try:
            progress_path.parent.mkdir(parents=True, exist_ok=True)

            with progress_path.open("w", encoding="utf-8") as file:
                json.dump(
                    {
                        "status": "running",
                        "scanned_categories": 0,
                        "total_categories": 6,
                        "sizes_found": 0,
                        "progress_percent": 0,
                        "progress_label": "Préparation du scan…",
                        "message": "Démarrage de la récupération des tailles.",
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            with log_path.open("a", encoding="utf-8") as log_file:
                size_scan_process = subprocess.Popen(
                    [sys.executable, str(script_path)],
                    cwd=str(PROJECT_DIR),
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )

            return {
                "ok": True,
                "status": "running",
                "message": "Récupération des tailles lancée.",
            }

        except Exception as exc:
            logging.exception("Impossible de lancer scan_sizes.py")

            return JSONResponse(
                {
                    "ok": False,
                    "error": str(exc),
                },
                status_code=500,
            )


@app.get("/api/sizes/scan/status")
def sizes_scan_status():
    progress_path = DATA_DIR / "sizes" / "sizes_progress.json"

    if not progress_path.is_file():
        return {
            "status": "idle",
            "message": "Aucun scan des tailles n'a encore été lancé.",
        }

    try:
        with progress_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    except (OSError, json.JSONDecodeError):
        logging.exception("Impossible de lire la progression des tailles.")

        return JSONResponse(
            {
                "status": "error",
                "message": "Impossible de lire la progression du scan.",
            },
            status_code=500,
        )


# ============================================================
# SYNCHRONISATION DES ÉTATS
# ============================================================

status_scan_process = None
status_scan_lock = threading.Lock()


@app.post("/api/statuses/scan")
def scan_statuses():
    global status_scan_process

    script_path = DATA_DIR / "statuses" / "scan_statuses.py"
    log_path = DATA_DIR / "statuses" / "scan_statuses.log"
    progress_path = DATA_DIR / "statuses" / "statuses_progress.json"

    if not script_path.is_file():
        return JSONResponse(
            {
                "ok": False,
                "error": f"Script introuvable : {script_path}",
            },
            status_code=404,
        )

    with status_scan_lock:
        if (
            status_scan_process is not None
            and status_scan_process.poll() is None
        ):
            return {
                "ok": True,
                "status": "running",
                "message": "Récupération des états déjà en cours.",
            }

        try:
            progress_path.parent.mkdir(parents=True, exist_ok=True)

            with progress_path.open("w", encoding="utf-8") as file:
                json.dump(
                    {
                        "status": "running",
                        "statuses_found": 0,
                        "progress_percent": 0,
                        "progress_label": "Préparation du scan…",
                        "message": "Démarrage de la récupération des états.",
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            with log_path.open("w", encoding="utf-8") as log_file:
                status_scan_process = subprocess.Popen(
                    [sys.executable, str(script_path)],
                    cwd=str(PROJECT_DIR),
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )

            return {
                "ok": True,
                "status": "running",
                "message": "Récupération des états lancée.",
            }

        except Exception as exc:
            logging.exception("Impossible de lancer scan_statuses.py")

            try:
                with progress_path.open("w", encoding="utf-8") as file:
                    json.dump(
                        {
                            "status": "error",
                            "statuses_found": 0,
                            "progress_percent": 0,
                            "progress_label": "Échec du démarrage",
                            "message": str(exc),
                        },
                        file,
                        ensure_ascii=False,
                        indent=2,
                    )
            except OSError:
                logging.exception(
                    "Impossible d'enregistrer l'erreur du scan des états."
                )

            return JSONResponse(
                {
                    "ok": False,
                    "error": str(exc),
                },
                status_code=500,
            )


@app.get("/api/statuses/scan/status")
def statuses_scan_status():
    progress_path = DATA_DIR / "statuses" / "statuses_progress.json"

    if not progress_path.is_file():
        return {
            "status": "idle",
            "message": "Aucun scan des états n'a encore été lancé.",
        }

    try:
        with progress_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    except (OSError, json.JSONDecodeError):
        logging.exception("Impossible de lire la progression des états.")

        return JSONResponse(
            {
                "status": "error",
                "message": "Impossible de lire la progression du scan.",
            },
            status_code=500,
        )


@app.get("/api/statuses/scan/stats")
def statuses_scan_stats():
    statuses_path = DATA_DIR / "statuses" / "statuses.json"

    if not statuses_path.is_file():
        return {
            "total_statuses": 0,
            "completed_at": None,
        }

    try:
        with statuses_path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if isinstance(data, list):
            total = len(data)
        elif isinstance(data, dict):
            total = len(data)
        else:
            total = 0

        from datetime import datetime

        completed_at = datetime.fromtimestamp(
            statuses_path.stat().st_mtime
        ).isoformat(timespec="seconds")

        return {
            "total_statuses": total,
            "completed_at": completed_at,
        }

    except (OSError, json.JSONDecodeError):
        logging.exception("Impossible de lire les statistiques des états.")

        return JSONResponse(
            {
                "error": "Impossible de lire les données des états.",
            },
            status_code=500,
        )


# ============================================================
# DISPONIBILITÉ DES DONNÉES
# ============================================================

@app.get("/api/scan/data-status")
def scan_data_status():
    categories_file = DATA_DIR / "categories" / "categories.json"
    sizes_file = DATA_DIR / "sizes" / "sizes.json"
    statuses_file = DATA_DIR / "statuses" / "statuses.json"

    def is_valid_json(path: Path) -> bool:
        if not path.is_file():
            return False

        try:
            with path.open("r", encoding="utf-8") as file:
                data = json.load(file)

            return isinstance(data, (dict, list)) and len(data) > 0

        except (OSError, json.JSONDecodeError):
            return False

    return {
        "categories_available": is_valid_json(categories_file),
        "sizes_available": is_valid_json(sizes_file),
        "statuses_available": is_valid_json(statuses_file),
    }
