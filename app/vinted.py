import logging
import re
import time
import unicodedata

import requests

TIMEOUT = 30
PAGE_SIZE = 96

VINTED_URL = "https://www.vinted.fr"
VINTED_API_URL = "https://api.vinted.fr"

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.8,en-US;q=0.5,en;q=0.3",
    "Upgrade-Insecure-Requests": "1",
    "Priority": "u=0, i",
    "Sec-GPC": "1",
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": "macOS",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
}

logger = logging.getLogger("vinted")


def normalize(text):
    return "".join(
        c for c in unicodedata.normalize("NFKD", str(text))
        if not unicodedata.combining(c)
    ).lower()


class VintedClient:

    def __init__(self):
        self.session = requests.Session()
        # 1) charger la vitrine
        resp = self.session.get(VINTED_URL + "/", headers=BROWSER_HEADERS, timeout=TIMEOUT)
        # 2) extraire l'URL du challenge anti-bot dans le HTML
        match = re.search(r'"(?:https?://www\.vinted\.fr)?(/[a-zA-Z0-9\-_/.]+)"', resp.text)
        if match:
            challenge_url = VINTED_URL + match.group(1)
            try:
                # 3) suivre le challenge -> cookies ___pt / ___vt
                self.session.get(challenge_url, headers=BROWSER_HEADERS, timeout=TIMEOUT)
                logger.info("Cookies de session : %s", list(self.session.cookies.keys()))
            except requests.exceptions.RequestException as e:
                logger.warning("Challenge anti-bot non résolu : %s", e)
        else:
            logger.warning("URL de challenge introuvable dans la vitrine")

    def fetch_items(self, params: dict, max_pages: int) -> list:
        items = []
        page = 1
        while page <= max_pages:
            response = self.session.get(
                f"{VINTED_API_URL}/svc-catalogue/items",
                params={**params, "page": page},
                headers=BROWSER_HEADERS,
                timeout=TIMEOUT,
            )
            logger.info("GET %s", response.url)
            response.raise_for_status()
            page_items = (response.json() or {}).get("items")
            if not isinstance(page_items, list):
                raise RuntimeError("Réponse Vinted inattendue")
            items.extend(page_items)
            if len(page_items) < PAGE_SIZE:
                break
            page += 1
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
        "url": VINTED_URL + raw.get("url", ""),
        "price": float(amount) if amount is not None else None,
        "total_price": float(total) if total is not None else None,
        "currency": "€",
        "favourite_count": raw.get("favourite_count") or 0,
        "image": photo.get("full_size_url"),
        "brand": (raw.get("brand_title") or "").strip(),
        "size": raw.get("size") or "",
        "description": (raw.get("item_box") or {}).get("accessibility_label") or "",
        "found_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }