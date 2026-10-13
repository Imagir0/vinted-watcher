"""Moteur de scan + boucle automatique en arrière-plan."""
import logging
import threading

from . import database as db
from .vinted import VintedClient, normalize, parse_item

logger = logging.getLogger("scanner")


def run_scan() -> int:
    """Un passage complet sur toutes les requêtes. Retourne le nb de nouveaux."""
    cfg = db.get_config()
    excluded = [normalize(k) for k in cfg.get("excluded_keywords", [])]
    max_pages = int(cfg.get("pages") or 2)
    client = VintedClient()
    new_count = 0

    for params in cfg.get("queries", []):
        try:
            raw_items = client.fetch_items(dict(params), max_pages)
        except Exception as e:
            logger.error("Erreur pour la requête %s : %s", params, e)
            continue
        logger.info("Requête %r -> %s items",
                    params.get("search_text") or "(vide)", len(raw_items))

        for raw in raw_items:
            item = parse_item(raw)
            if db.is_seen(item["id"]):
                continue
            text = normalize(f"{item['title']} {item['description']}")
            if any(kw in text for kw in excluded):
                continue
            db.mark_seen(item["id"])
            db.insert_item(item)
            new_count += 1

    logger.info("Scan terminé : %s nouveaux items", new_count)
    return new_count

class AutoLoop(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.stop_event = threading.Event()

    def run(self):
        logger.info("Boucle auto démarrée")
        while not self.stop_event.is_set():
            try:
                run_scan()
            except Exception as e:
                logger.error("Erreur du scan auto : %s", e)
            interval = int(db.get_config().get("interval_seconds", 300))
            self.stop_event.wait(max(60, interval))
        logger.info("Boucle auto arrêtée")


_loop = None


def start_auto():
    global _loop
    if _loop and _loop.is_alive():
        return
    _loop = AutoLoop()
    _loop.start()
    db.set_config({"auto_scan": True})


def stop_auto():
    global _loop
    if _loop:
        _loop.stop_event.set()
    db.set_config({"auto_scan": False})


def is_running() -> bool:
    return bool(_loop and _loop.is_alive())