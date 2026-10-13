import json
import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "scanner.db"
lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    title TEXT,
    url TEXT,
    price REAL,
    total_price REAL,
    currency TEXT DEFAULT '€',
    favourite_count INTEGER DEFAULT 0,
    image TEXT,
    brand TEXT,
    size TEXT,
    description TEXT,
    found_at TEXT
);

CREATE TABLE IF NOT EXISTS seen (
    id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

DEFAULT_CONFIG = {
    "queries": [
        {
            "search_text": "",
            "attribute_ids[brand]": "",
            "attribute_ids[catalog]": "",
            "order": "newest_first",
        }
    ],
    "pages": 2,
    "interval_seconds": 300,
    "excluded_keywords": [],
    "auto_scan": False,
}


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with lock, connect() as conn:
        conn.executescript(SCHEMA)

        for key, value in DEFAULT_CONFIG.items():
            conn.execute(
                "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)",
                (key, json.dumps(value)),
            )


def get_config() -> dict:
    with lock, connect() as conn:
        rows = conn.execute("SELECT key, value FROM config").fetchall()

    return {
        row["key"]: json.loads(row["value"])
        for row in rows
    }


def set_config(updates: dict):
    with lock, connect() as conn:
        for key, value in updates.items():
            if key in DEFAULT_CONFIG:
                conn.execute(
                    """
                    INSERT INTO config (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE
                    SET value = excluded.value
                    """,
                    (key, json.dumps(value)),
                )


def _search_name(config: dict) -> str:
    """Génère un nom lisible à partir des critères de recherche."""
    queries = config.get("queries") or [{}]
    query = queries[0] if queries else {}

    parts = []
    search_text = str(query.get("search_text") or "").strip()

    if search_text:
        parts.append(search_text)

    brand = query.get("attribute_ids[brand]")
    if brand:
        parts.append(f"Marque #{brand}")

    catalog = query.get("attribute_ids[catalog]")
    if catalog:
        parts.append(f"Catégorie #{catalog}")

    price_from = query.get("price_from")
    price_to = query.get("price_to")

    if price_from not in (None, "") and price_to not in (None, ""):
        parts.append(f"{price_from}–{price_to} €")
    elif price_from not in (None, ""):
        parts.append(f"Dès {price_from} €")
    elif price_to not in (None, ""):
        parts.append(f"Max. {price_to} €")

    sizes = query.get("size_ids")
    if sizes:
        parts.append(f"Tailles {sizes}")

    statuses = query.get("status_ids")
    if statuses:
        parts.append(f"États {statuses}")

    return " · ".join(parts) or "Recherche sans mot-clé"


def list_saved_searches() -> list[dict]:
    with lock, connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, config_json, created_at
            FROM saved_searches
            ORDER BY id DESC
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "config": json.loads(row["config_json"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def save_search(config: dict) -> dict:
    """Enregistre une copie indépendante de la configuration fournie."""
    snapshot = {
        "queries": config.get("queries", DEFAULT_CONFIG["queries"]),
        "pages": config.get("pages", DEFAULT_CONFIG["pages"]),
        "interval_seconds": config.get(
            "interval_seconds",
            DEFAULT_CONFIG["interval_seconds"],
        ),
        "excluded_keywords": config.get(
            "excluded_keywords",
            DEFAULT_CONFIG["excluded_keywords"],
        ),
    }

    name = _search_name(snapshot)

    with lock, connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO saved_searches (name, config_json)
            VALUES (?, ?)
            """,
            (name, json.dumps(snapshot, ensure_ascii=False)),
        )
        search_id = cursor.lastrowid

        row = conn.execute(
            """
            SELECT id, name, config_json, created_at
            FROM saved_searches
            WHERE id = ?
            """,
            (search_id,),
        ).fetchone()

    return {
        "id": row["id"],
        "name": row["name"],
        "config": json.loads(row["config_json"]),
        "created_at": row["created_at"],
    }


def get_saved_search(search_id: int) -> dict | None:
    with lock, connect() as conn:
        row = conn.execute(
            """
            SELECT id, name, config_json, created_at
            FROM saved_searches
            WHERE id = ?
            """,
            (search_id,),
        ).fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "config": json.loads(row["config_json"]),
        "created_at": row["created_at"],
    }


def delete_saved_search(search_id: int) -> bool:
    with lock, connect() as conn:
        cursor = conn.execute(
            "DELETE FROM saved_searches WHERE id = ?",
            (search_id,),
        )
        return cursor.rowcount > 0


def is_seen(item_id: str) -> bool:
    with lock, connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM seen WHERE id = ?",
            (item_id,),
        ).fetchone()
    return row is not None


def mark_seen(item_id: str):
    with lock, connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen (id) VALUES (?)",
            (item_id,),
        )


def insert_item(item: dict):
    with lock, connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO items
            (
                id, title, url, price, total_price, currency,
                favourite_count, image, brand, size, description, found_at
            )
            VALUES
            (
                :id, :title, :url, :price, :total_price, :currency,
                :favourite_count, :image, :brand, :size, :description, :found_at
            )
            """,
            item,
        )


def list_items(limit: int = 500, newest: bool = True):
    order = "DESC" if newest else "ASC"

    with lock, connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM items ORDER BY rowid {order} LIMIT ?",
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]


def reset_state():
    """Vide les annonces affichées et la liste des annonces déjà vues."""
    with lock, connect() as conn:
        conn.execute("DELETE FROM items")
        conn.execute("DELETE FROM seen")