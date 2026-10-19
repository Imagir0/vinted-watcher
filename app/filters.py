
"""Filtres métier appliqués aux annonces avant leur sauvegarde."""

import json
import logging
import re
import unicodedata
from pathlib import Path

logger = logging.getLogger("filters")

SIZES_FILE = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "sizes"
    / "sizes.json"
)


def normalize(value) -> str:
    """Normalise une valeur pour les comparaisons textuelles."""
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", str(value or ""))
        if not unicodedata.combining(char)
    ).strip().lower()


def _as_set(value) -> set[str]:
    """Convertit une sélection en ensemble de valeurs comparables."""
    if value is None or value == "":
        return set()

    if isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = str(value).split(",")

    return {
        str(item).strip()
        for item in values
        if item is not None and str(item).strip()
    }


def _get_nested_id(value) -> str:
    """Récupère un identifiant depuis une valeur simple ou un objet."""
    if isinstance(value, dict):
        value = value.get("id")
    return str(value).strip() if value is not None else ""


def _load_size_labels() -> dict[str, str]:
    """Construit la correspondance entre les IDs et les libellés de tailles."""
    if not SIZES_FILE.exists():
        logger.warning("Fichier des tailles introuvable : %s", SIZES_FILE)
        return {}

    with SIZES_FILE.open("r", encoding="utf-8") as file:
        data = json.load(file)

    labels = {}

    def walk(value):
        if isinstance(value, dict):
            if "id" in value and "label" in value:
                labels[str(value["id"])] = str(value["label"])

            for child in value.values():
                walk(child)

        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(data)
    return labels


def _extract_size_label(item: dict) -> str:
    """Extrait le libellé de taille disponible dans une annonce brute."""
    size = item.get("size")

    if isinstance(size, str):
        return size.strip()

    if isinstance(size, dict):
        for key in ("title", "label", "name", "value"):
            value = size.get(key)
            if value is not None:
                return str(value).strip()

    item_box = item.get("item_box") or {}
    accessibility_label = item_box.get("accessibility_label") or ""

    match = re.search(
        r"(?:Taille|Size|Größe|Talla)\s*:\s*([^,]+)",
        accessibility_label,
        flags=re.IGNORECASE,
    )

    return match.group(1).strip() if match else ""


def _matches_sizes(item: dict, selected_sizes: set[str],
                   size_labels: dict[str, str]) -> bool:
    if not selected_sizes:
        return True

    actual_label = normalize(_extract_size_label(item))

    if not actual_label:
        return False

    wanted_labels = {
        normalize(size_labels[size])
        for size in selected_sizes
        if size in size_labels
    }

    # Permet aussi de comparer directement des libellés si la sélection
    # contient des noms plutôt que des IDs.
    wanted_labels.update(normalize(size) for size in selected_sizes)

    return actual_label in wanted_labels


def _matches_brands(item: dict, selected_brands: set[str]) -> bool:
    if not selected_brands:
        return True

    brand_id = _get_nested_id(item.get("brand_id"))
    brand_title = normalize(item.get("brand_title"))

    selected_ids = {value for value in selected_brands}
    selected_names = {normalize(value) for value in selected_brands}

    return (
        brand_id in selected_ids
        or brand_title in selected_names
    )


def _matches_status(item: dict, selected_statuses: set[str]) -> bool:
    if not selected_statuses:
        return True

    # Les structures exactes peuvent varier selon les réponses de l'API.
    actual_values = {
        _get_nested_id(item.get("status_id")),
        _get_nested_id(item.get("status")),
        _get_nested_id(item.get("condition")),
        _get_nested_id(item.get("condition_id")),
    }
    actual_values.discard("")

    return bool(actual_values & selected_statuses)


def filter_items(items: list[dict], params: dict) -> list[dict]:
    """
    Applique les filtres persistants d'une recherche aux annonces brutes.

    Clés attendues dans params :
    - size_ids
    - brand_ids
    - status_ids

    Les filtres absents ou vides ne limitent pas les résultats.
    """
    selected_sizes = _as_set(params.get("size_ids"))
    selected_brands = _as_set(params.get("brand_ids"))
    selected_statuses = _as_set(params.get("status_ids"))

    size_labels = _load_size_labels() if selected_sizes else {}

    filtered = []

    for item in items:
        if not _matches_sizes(item, selected_sizes, size_labels):
            continue

        if not _matches_brands(item, selected_brands):
            continue

        if not _matches_status(item, selected_statuses):
            continue

        filtered.append(item)

    logger.info(
        "Filtrage : %s annonce(s) conservée(s) sur %s "
        "(tailles=%s, marques=%s, états=%s)",
        len(filtered),
        len(items),
        len(selected_sizes),
        len(selected_brands),
        len(selected_statuses),
    )

    return filtered
