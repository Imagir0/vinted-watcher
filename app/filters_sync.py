
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

import requests


logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
FILTERS_PATH = BASE_DIR / "vinted_filters.json"

API_BASE = "https://api.vinted.fr/svc-filters"
ROOT_CATALOG_ID = int(os.getenv("VINTED_ROOT_CATALOG_ID", "1904"))

FILTER_CODES = (
    "size",
    "brand",
    "status",
    "color",
    "patterns",
    "material",
)

SYNC_LOCK = Lock()

HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.vinted.fr/",
}



def _request_json(session, endpoint, params):
    url = f"{API_BASE}/{endpoint}"
    response = session.get(
        url,
        params={**params, "time": int(time.time())},
        timeout=30,
    )

    logger.info(
        "Réponse API Vinted : endpoint=%s, status=%s, content-type=%s",
        endpoint,
        response.status_code,
        response.headers.get("Content-Type"),
    )

    if response.status_code == 403:
        logger.error(
            "Détail du refus Vinted : %s",
            response.text[:1000],
        )
        raise RuntimeError(
            "Vinted refuse l'accès à son API (HTTP 403). "
            "Consulte le détail du refus dans les logs."
        )

    response.raise_for_status()

    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"Vinted a renvoyé une réponse JSON invalide ({endpoint})."
        ) from exc

    if not isinstance(payload, (dict, list)):
        raise RuntimeError(
            f"Format de réponse inattendu pour {endpoint}."
        )

    return payload



def _find_items(payload, code=None):
    """
    Repère les options d'une facette dans les formats de réponse
    courants de Vinted.
    """
    if isinstance(payload, list):
        for element in payload:
            result = _find_items(element, code)
            if result is not None:
                return result
        return None

    if not isinstance(payload, dict):
        return None

    current_code = str(payload.get("code", "")).lower()

    if code is not None and current_code == code:
        for key in ("items", "options", "values", "catalogs", "children"):
            value = payload.get(key)
            if isinstance(value, list):
                return value

    # Certaines réponses renvoient directement une liste de catégories.
    if code == "catalog":
        for key in ("catalogs", "categories", "items", "options"):
            value = payload.get(key)
            if isinstance(value, list):
                return value

    # Certaines réponses exposent directement les options d'une facette.
    if code is not None and code in payload:
        value = payload[code]
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            result = _find_items(value, code)
            if result is not None:
                return result
            for key in ("items", "options", "values"):
                if isinstance(value.get(key), list):
                    return value[key]

    for key in ("facets", "data", "result"):
        value = payload.get(key)
        if isinstance(value, (dict, list)):
            result = _find_items(value, code)
            if result is not None:
                return result

    return None


def _attribute_params(catalog_id):
    """Paramètres communs des endpoints de facettes."""
    return {
        "search_text": "",
        "order": "newest_first",
        "attribute_ids[catalog]": str(catalog_id),
        "attribute_ids[size]": "",
        "attribute_ids[brand]": "",
        "attribute_ids[status]": "",
        "attribute_ids[color]": "",
        "attribute_ids[patterns]": "",
        "attribute_ids[material]": "",
    }


def _get_categories(session, catalog_id):
    payload = _request_json(
        session,
        "faceted_categories",
        _attribute_params(catalog_id),
    )

    items = _find_items(payload, "catalog")

    if items is None:
        # Certaines variantes de réponse n'ont pas de code "catalog".
        items = _find_items(payload)

    if not isinstance(items, list):
        raise RuntimeError(
            f"Impossible de lire les catégories pour {catalog_id}."
        )

    return items


def _category_id(item):
    if not isinstance(item, dict):
        return None

    value = item.get("id", item.get("catalog_id"))
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _category_label(item):
    if not isinstance(item, dict):
        return str(item)

    return (
        item.get("title")
        or item.get("name")
        or item.get("label")
        or ""
    )


def _build_category_tree(session, root_id):
    visited = set()
    count = 0
    max_categories = 10000

    def walk(parent_id, depth=0):
        nonlocal count

        if depth > 20:
            raise RuntimeError("Profondeur de catégories excessive.")

        raw_items = _get_categories(session, parent_id)
        nodes = []

        for item in raw_items:
            if not isinstance(item, dict):
                continue

            item_id = _category_id(item)
            if item_id is None:
                continue

            # Évite les boucles et les doublons dans l'arborescence.
            if item_id in visited:
                continue

            visited.add(item_id)
            count += 1

            if count > max_categories:
                raise RuntimeError(
                    "Limite de sécurité du nombre de catégories dépassée."
                )

            node = dict(item)
            node["id"] = item_id
            node["title"] = _category_label(item)

            children = walk(item_id, depth + 1)
            node["children"] = children
            nodes.append(node)

        return nodes

    tree = walk(root_id)

    if not tree:
        raise RuntimeError(
            "Aucune catégorie récupérée. Le fichier existant est conservé."
        )

    return tree


def _get_filter(session, catalog_id, code):
    payload = _request_json(
        session,
        "filters/facets",
        {
            **_attribute_params(catalog_id),
            "filter_code": code,
        },
    )

    items = _find_items(payload, code)

    if items is None:
        raise RuntimeError(
            f"Impossible de lire la facette « {code} »."
        )

    return items


def _validate_filters(filters):
    for code in FILTER_CODES:
        if code not in filters or not isinstance(filters[code], list):
            raise RuntimeError(f"Facette absente ou invalide : {code}")

        # Les listes vides peuvent être légitimes pour certains catalogues.
        # On vérifie surtout que la réponse a été correctement interprétée.
        for item in filters[code]:
            if not isinstance(item, dict):
                raise RuntimeError(
                    f"Option invalide dans la facette « {code} »."
                )


def _atomic_write(payload):
    """Écrit dans un fichier temporaire puis remplace le JSON existant."""
    temp_path = FILTERS_PATH.with_suffix(".json.tmp")

    try:
        FILTERS_PATH.parent.mkdir(parents=True, exist_ok=True)

        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(
                payload,
                file,
                ensure_ascii=False,
                indent=2,
            )
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())

        temp_path.replace(FILTERS_PATH)

    finally:
        if temp_path.exists():
            temp_path.unlink()


def sync_filters():
    """
    Synchronise catégories et facettes, puis remplace le JSON
    seulement si toutes les étapes ont réussi.
    """
    if not SYNC_LOCK.acquire(blocking=False):
        raise RuntimeError("Une synchronisation est déjà en cours.")

    try:
        with requests.Session() as session:
            session.headers.update(HEADERS)

            logger.info("Synchronisation des catégories Vinted…")
            categories = _build_category_tree(
                session,
                ROOT_CATALOG_ID,
            )

            logger.info("Synchronisation des facettes Vinted…")
            filters = {
                code: _get_filter(session, ROOT_CATALOG_ID, code)
                for code in FILTER_CODES
            }

            _validate_filters(filters)

            payload = {
                "schema_version": 1,
                "synced_at": datetime.now(timezone.utc).isoformat(),
                "source": "Vinted API",
                "root_catalog_id": ROOT_CATALOG_ID,
                "categories": categories,
                "filters": filters,
            }

            _atomic_write(payload)

            total_categories = sum(
                1 for _ in _walk_tree(categories)
            )

            logger.info(
                "Filtres Vinted synchronisés : %s catégories.",
                total_categories,
            )

            return {
                "ok": True,
                "synced_at": payload["synced_at"],
                "root_catalog_id": ROOT_CATALOG_ID,
                "categories_count": total_categories,
                "filters_count": {
                    code: len(values)
                    for code, values in filters.items()
                },
                "file": str(FILTERS_PATH),
            }

    finally:
        SYNC_LOCK.release()


def _walk_tree(nodes):
    for node in nodes:
        yield node
        yield from _walk_tree(node.get("children", []))


def read_filters():
    """Lit le JSON sans utiliser la base de données."""
    if not FILTERS_PATH.is_file():
        return None

    with FILTERS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)
