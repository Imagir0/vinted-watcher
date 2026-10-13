"""SQLite : config, items trouvés, items déjà vus."""
import json
import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "scanner.db"
lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    title       TEXT,
    url         TEXT,
    price       REAL,
    total_price REAL,
    currency    TEXT DEFAULT '€',
    favourite_count INTEGER DEFAULT 0,
    image       TEXT,
    brand       TEXT,
    size        TEXT,
    description TEXT,
    found_at    TEXT
);
CREATE TABLE IF NOT EXISTS seen (
    id TEXT PRIMARY KEY
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
    cfg = {}
    for row in rows:
        cfg[row["key"]] = json.loads(row["value"])
    return cfg


def set_config(updates: dict):
    with lock, connect() as conn:
        for key, value in updates.items():
            if key in DEFAULT_CONFIG:  # on ne sauvegarde que des clés connues
                conn.execute(
                    "INSERT INTO config (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, json.dumps(value)),
                )


def is_seen(item_id: str) -> bool:
    with lock, connect() as conn:
        row = conn.execute("SELECT 1 FROM seen WHERE id = ?", (item_id,)).fetchone()
    return row is not None


def mark_seen(item_id: str):
    with lock, connect() as conn:
        conn.execute("INSERT OR IGNORE INTO seen (id) VALUES (?)", (item_id,))


def insert_item(item: dict):
    with lock, connect() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO items
               (id, title, url, price, total_price, currency,
                favourite_count, image, brand, size, description, found_at)
               VALUES (:id, :title, :url, :price, :total_price, :currency,
                       :favourite_count, :image, :brand, :size, :description, :found_at)""",
            item,
        )


def list_items(limit: int = 500, newest: bool = True):
    order = "DESC" if newest else "ASC"
    with lock, connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM items ORDER BY rowid {order} LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def reset_state():
    """Vide les items affichés et la liste des vus."""
    with lock, connect() as conn:
        conn.execute("DELETE FROM items")
        conn.execute("DELETE FROM seen")