"""Moteur de scan et boucle automatique en arrière-plan."""
import logging
import threading

from . import database as db
from .vinted import VintedClient, normalize, parse_item

logger = logging.getLogger("scanner")


def run_scan() -> int:
    """Scanne les recherches actives et retourne le nombre de nouvelles annonces."""
    cfg = db.get_config()
    excluded = [
        normalize(keyword)
        for keyword in cfg.get("excluded_keywords", [])
        if keyword
    ]
    max_pages = max(1, min(10, int(cfg.get("pages") or 2)))
    client = VintedClient()
    new_count = 0

    for params in cfg.get("queries", []):
        key = db.search_key(params)

        try:
            raw_items = client.fetch_items(dict(params), max_pages)
        except Exception:
            logger.exception("Erreur pour la requête %s", params)
            continue

        logger.info(
            "Requête %r -> %s items",
            params.get("search_text") or "(vide)",
            len(raw_items),
        )

        for raw in raw_items:
            try:
                item = parse_item(raw)
                item_id = str(item["id"])

                text = normalize(
                    f"{item.get('title') or ''} "
                    f"{item.get('description') or ''}"
                )

                if any(keyword in text for keyword in excluded):
                    continue

                was_seen = db.is_seen(item_id)

                # Enregistre ou actualise l'annonce, son association à la
                # recherche active et son prix observé.
                db.record_observation(item, key)

                if not was_seen:
                    db.mark_seen(item_id)
                    new_count += 1

            except Exception:
                logger.exception("Impossible de traiter une annonce")

    logger.info("Scan terminé : %s nouvelles annonces", new_count)
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
            except Exception:
                logger.exception("Erreur du scan automatique")

            interval = int(
                db.get_config().get("interval_seconds", 300)
            )
            self.stop_event.wait(max(60, interval))

        logger.info("Boucle auto arrêtée")


_loop = None


def start_auto():
    global _loop

    if _loop and _loop.is_alive():
        return

    _loop = AutoLoop()
    db.set_config({"auto_scan": True})
    _loop.start()


def stop_auto():
    global _loop

    if _loop:
        _loop.stop_event.set()

    db.set_config({"auto_scan": False})


def is_running() -> bool:
    return bool(_loop and _loop.is_alive())
