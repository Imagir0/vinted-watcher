"""SQLite : configuration, recherches, annonces et historique des prix."""
import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timezone
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

CREATE TABLE IF NOT EXISTS item_searches (
    item_id TEXT NOT NULL,
    search_key TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (item_id, search_key)
);

CREATE INDEX IF NOT EXISTS idx_item_searches_key
ON item_searches(search_key);

CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    search_key TEXT NOT NULL,
    price REAL NOT NULL,
    observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_history_search_time
ON price_history(search_key, observed_at);

CREATE INDEX IF NOT EXISTS idx_price_history_item_time
ON price_history(item_id, observed_at);

CREATE TABLE IF NOT EXISTS profile_cache (
    member_id TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
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

    return {row["key"]: json.loads(row["value"]) for row in rows}


def set_config(updates: dict):
    with lock, connect() as conn:
        for key, value in updates.items():
            if key in DEFAULT_CONFIG:
                conn.execute(
                    """
                    INSERT INTO config (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE
                    SET value = excluded.value
                    """,
                    (key, json.dumps(value)),
                )


def search_key(params: dict) -> str:
    """Identifiant stable fondé sur les critères de recherche."""
    canonical = json.dumps(
        params or {},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def active_search_keys(queries: list) -> list[str]:
    return list({
        search_key(query)
        for query in (queries or [])
    })


def list_items_for_searches(search_keys: list[str], limit: int = 2000):
    if not search_keys:
        return []

    placeholders = ",".join("?" for _ in search_keys)

    with lock, connect() as conn:
        rows = conn.execute(
            f"""
            SELECT DISTINCT items.*
            FROM items
            JOIN item_searches
              ON item_searches.item_id = items.id
            WHERE item_searches.search_key IN ({placeholders})
            ORDER BY items.rowid DESC
            LIMIT ?
            """,
            (*search_keys, max(1, min(int(limit), 5000))),
        ).fetchall()

    return [dict(row) for row in rows]


def record_observation(item: dict, key: str):
    """Enregistre l'annonce, son association à la recherche et son prix."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    item_id = str(item["id"])
    price = item.get("price")

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

        # Mettre à jour les données courantes sans écraser l'historique.
        conn.execute(
            """
            UPDATE items SET
                title = :title,
                url = :url,
                price = :price,
                total_price = :total_price,
                currency = :currency,
                favourite_count = :favourite_count,
                image = :image,
                brand = :brand,
                size = :size,
                description = :description
            WHERE id = :id
            """,
            item,
        )

        conn.execute(
            """
            INSERT INTO item_searches
                (item_id, search_key, first_seen_at, last_seen_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(item_id, search_key)
            DO UPDATE SET last_seen_at = excluded.last_seen_at
            """,
            (item_id, key, now, now),
        )

        if price is not None:
            try:
                numeric_price = float(price)
            except (TypeError, ValueError):
                numeric_price = None

            if numeric_price is not None and numeric_price >= 0:
                conn.execute(
                    """
                    INSERT INTO price_history
                        (item_id, search_key, price, observed_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (item_id, key, numeric_price, now),
                )


def get_price_trend(search_keys: list[str]) -> dict:
    """Compare les prix les plus récents par annonce sur deux périodes de 7 jours."""
    if not search_keys:
        return _empty_trend("Aucune recherche active.")

    now = datetime.now(timezone.utc)
    current_start = now.timestamp() - 7 * 86400
    previous_start = now.timestamp() - 14 * 86400

    current_iso = datetime.fromtimestamp(
        current_start, timezone.utc
    ).isoformat(timespec="seconds")
    previous_iso = datetime.fromtimestamp(
        previous_start, timezone.utc
    ).isoformat(timespec="seconds")
    now_iso = now.isoformat(timespec="seconds")

    placeholders = ",".join("?" for _ in search_keys)

    def period_prices(conn, start, end):
        rows = conn.execute(
            f"""
            SELECT price
            FROM (
                SELECT
                    price,
                    ROW_NUMBER() OVER (
                        PARTITION BY item_id
                        ORDER BY observed_at DESC, id DESC
                    ) AS rank
                FROM price_history
                WHERE search_key IN ({placeholders})
                  AND observed_at >= ?
                  AND observed_at < ?
            )
            WHERE rank = 1
            """,
            (*search_keys, start, end),
        ).fetchall()
        return [float(row["price"]) for row in rows]

    with lock, connect() as conn:
        current = period_prices(conn, current_iso, now_iso)
        previous = period_prices(conn, previous_iso, current_iso)

    current_avg = sum(current) / len(current) if current else None
    previous_avg = sum(previous) / len(previous) if previous else None

    change = None
    percent = None
    direction = "insufficient"

    if current_avg is not None and previous_avg is not None:
        change = current_avg - previous_avg
        if previous_avg > 0:
            percent = (change / previous_avg) * 100

        if abs(change) < 0.005:
            direction = "stable"
        elif change > 0:
            direction = "up"
        else:
            direction = "down"

    return {
        "current_average": current_avg,
        "previous_average": previous_avg,
        "change": change,
        "percent": percent,
        "direction": direction,
        "current_count": len(current),
        "previous_count": len(previous),
        "period_days": 7,
        "current_from": current_iso,
        "current_to": now_iso,
        "previous_from": previous_iso,
        "previous_to": current_iso,
    }


def _empty_trend(message: str) -> dict:
    return {
        "current_average": None,
        "previous_average": None,
        "change": None,
        "percent": None,
        "direction": "insufficient",
        "current_count": 0,
        "previous_count": 0,
        "period_days": 7,
        "message": message,
    }


def is_seen(item_id: str) -> bool:
    with lock, connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM seen WHERE id = ?",
            (str(item_id),),
        ).fetchone()
    return row is not None


def mark_seen(item_id: str):
    with lock, connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen (id) VALUES (?)",
            (str(item_id),),
        )


def _search_name(config: dict) -> str:
    queries = config.get("queries") or [{}]
    query = queries[0] if queries else {}
    parts = []

    if query.get("search_text"):
        parts.append(str(query["search_text"]).strip())

    if query.get("attribute_ids[brand]"):
        parts.append(f"Marque #{query['attribute_ids[brand]']}")

    if query.get("attribute_ids[catalog]"):
        parts.append(f"Catégorie #{query['attribute_ids[catalog]']}")

    low = query.get("price_from")
    high = query.get("price_to")

    if low not in (None, "") and high not in (None, ""):
        parts.append(f"{low}–{high} €")
    elif low not in (None, ""):
        parts.append(f"Dès {low} €")
    elif high not in (None, ""):
        parts.append(f"Max. {high} €")

    if query.get("size_ids"):
        parts.append(f"Tailles {query['size_ids']}")

    if query.get("status_ids"):
        parts.append(f"États {query['status_ids']}")

    return " · ".join(parts) or "Recherche sans mot-clé"


def list_saved_searches() -> list[dict]:
    with lock, connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, config_json, created_at
            FROM saved_searches ORDER BY id DESC
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
    snapshot = {
        "queries": config.get("queries", DEFAULT_CONFIG["queries"]),
        "pages": config.get("pages", DEFAULT_CONFIG["pages"]),
        "interval_seconds": config.get(
            "interval_seconds", DEFAULT_CONFIG["interval_seconds"]
        ),
        "excluded_keywords": config.get("excluded_keywords", []),
    }
    name = _search_name(snapshot)

    with lock, connect() as conn:
        cursor = conn.execute(
            "INSERT INTO saved_searches (name, config_json) VALUES (?, ?)",
            (name, json.dumps(snapshot, ensure_ascii=False)),
        )
        row = conn.execute(
            """
            SELECT id, name, config_json, created_at
            FROM saved_searches WHERE id = ?
            """,
            (cursor.lastrowid,),
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
            FROM saved_searches WHERE id = ?
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


def reset_state():
    """Vide les annonces, les associations et l'historique."""
    with lock, connect() as conn:
        conn.execute("DELETE FROM items")
        conn.execute("DELETE FROM seen")
        conn.execute("DELETE FROM item_searches")
        conn.execute("DELETE FROM price_history")

def get_cached_profile(member_id: str) -> dict | None:
    """Retourne le profil enregistré, s'il existe."""
    member_id = str(member_id).strip()

    with lock, connect() as conn:
        row = conn.execute(
            """
            SELECT profile_json
            FROM profile_cache
            WHERE member_id = ?
            """,
            (member_id,),
        ).fetchone()

    if row is None:
        return None

    try:
        profile = json.loads(row["profile_json"])
    except (json.JSONDecodeError, TypeError):
        return None

    return profile if isinstance(profile, dict) else None


def save_cached_profile(member_id: str, profile: dict):
    """Enregistre ou actualise les données d'un profil."""
    member_id = str(member_id).strip()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with lock, connect() as conn:
        conn.execute(
            """
            INSERT INTO profile_cache (
                member_id,
                profile_json,
                updated_at
            )
            VALUES (?, ?, ?)
            ON CONFLICT(member_id) DO UPDATE SET
                profile_json = excluded.profile_json,
                updated_at = excluded.updated_at
            """,
            (
                member_id,
                json.dumps(profile, ensure_ascii=False),
                now,
            ),
        )
