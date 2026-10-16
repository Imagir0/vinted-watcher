import logging
import re
import time
import unicodedata

import requests

TIMEOUT = 30
PAGE_SIZE = 96
MAX_PAGES = 10

VINTED_URL = "https://www.vinted.fr"
VINTED_API_URL = "https://api.vinted.fr"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Referer": "https://www.vinted.fr/",
}

logger = logging.getLogger("vinted")

def normalize(text):
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", str(text))
        if not unicodedata.combining(char)
    ).lower()


class VintedClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(BROWSER_HEADERS)

        try:
            response = self.session.get(
                f"{VINTED_URL}/",
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            logger.info(
                "Session Vinted initialisée ; cookies : %s",
                list(self.session.cookies.keys()),
            )
        except requests.exceptions.RequestException as exc:
            logger.warning("Initialisation de la session Vinted échouée : %s", exc)

    def fetch_items(self, params: dict, max_pages: int) -> list:
        items = []
        max_pages = max(1, min(int(max_pages), MAX_PAGES))

        for page in range(1, max_pages + 1):
            response = self.session.get(
                f"{VINTED_API_URL}/svc-catalogue/items",
                params={**params, "page": page},
                headers=BROWSER_HEADERS,
                timeout=TIMEOUT,
            )

            logger.info("GET %s", response.url)
            logger.info("Statut HTTP : %s", response.status_code)
            logger.info("Début de la réponse : %s", response.text[:500])
            response.raise_for_status()
            response.raise_for_status()

            data = response.json() or {}
            page_items = data.get("items")

            if not isinstance(page_items, list):
                raise RuntimeError(
                    "Réponse Vinted inattendue : le champ 'items' "
                    "est absent ou n'est pas une liste."
                )

            items.extend(page_items)
            logger.info("Page %s : %s annonces", page, len(page_items))

            if len(page_items) < PAGE_SIZE:
                break

        return items


def parse_item(raw: dict) -> dict:
    price_data = raw.get("price") or {}
    total_data = raw.get("total_item_price") or {}
    photo = raw.get("photo") or {}

    amount = price_data.get("amount")
    total = total_data.get("amount")

    return {
        "id": str(raw["id"]),
        "title": raw.get("title") or "",
        "url": VINTED_URL + (raw.get("url") or ""),
        "price": float(amount) if amount is not None else None,
        "total_price": float(total) if total is not None else None,
        "currency": "€",
        "favourite_count": raw.get("favourite_count") or 0,
        "image": photo.get("full_size_url") or photo.get("url"),
        "brand": (raw.get("brand_title") or "").strip(),
        "size": raw.get("size") or "",
        "description": (
            (raw.get("item_box") or {}).get("accessibility_label") or ""
        ),
        "found_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
