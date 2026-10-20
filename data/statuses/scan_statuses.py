
import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path

from playwright.async_api import (
    async_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

# ============================================================
# CONFIGURATION
# ============================================================

URL = "https://www.vinted.fr/catalog"

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = SCRIPT_DIR / "statuses.json"
PROGRESS_FILE = SCRIPT_DIR / "statuses_progress.json"
STATS_FILE = SCRIPT_DIR / "statuses_stats.json"

STATUS_TRIGGER = (
    '[data-testid="catalog--status-filter--trigger--text"]'
)
STATUS_ITEM_SELECTOR = (
    '[role="button"][data-testid^="selectable-item-status-"]'
)
STATUS_TITLE_SELECTOR = '[data-testid$="--title"]'
STATUS_DESCRIPTION_SELECTOR = '[data-testid$="--content"]'

NAVIGATION_DELAY_MS = 300
DEBUG_PAUSE = False


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ============================================================
# JSON ET PROGRESSION
# ============================================================

def save_json(path: Path, data):
    """Enregistre un JSON de manière atomique."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")

    with temporary_path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=4)
        file.flush()
        os.fsync(file.fileno())

    for attempt in range(6):
        try:
            os.replace(temporary_path, path)
            return
        except PermissionError:
            if attempt == 5:
                raise
            time.sleep(0.2 * (attempt + 1))



def save_progress(
    status,
    statuses_found=0,
    current_status=None,
    message=None,
):
    """Enregistre la progression du scan des états."""

    progress = {
        "status": status,
        "statuses_found": statuses_found,
        "current_status": current_status,
        "progress_percent": 0,
        "progress_label": current_status or "Préparation du scan…",
        "message": message or "",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    if status == "running":
        progress["progress_label"] = (
            current_status or "Récupération des états…"
        )

    elif status == "done":
        progress["progress_percent"] = 100
        progress["progress_label"] = "Terminé"

    elif status == "error":
        progress["progress_label"] = "Échec du scan"

    save_json(PROGRESS_FILE, progress)



# ============================================================
# FENÊTRES INITIALES
# ============================================================

async def close_initial_windows(page):
    """Ferme les fenêtres initiales si elles sont présentes."""

    try:
        country_button = page.locator(
            '[data-testid="domain-select-modal-close-button"]'
        )
        await country_button.click(timeout=2000)
        logger.info("Fenêtre de sélection du pays fermée.")
    except PlaywrightTimeoutError:
        logger.info("Aucune fenêtre de sélection du pays.")

    try:
        cookie_button = page.locator("#onetrust-reject-all-handler")
        await cookie_button.click(timeout=5000)
        logger.info("Cookies refusés.")
    except PlaywrightTimeoutError:
        logger.info("Bouton de refus des cookies absent.")
    except Exception:
        logger.exception("Impossible de fermer la fenêtre de cookies.")


# ============================================================
# OUVERTURE DU MENU DES ÉTATS
# ============================================================

async def open_status_filter(page):
    """Ouvre le menu des états si celui-ci n'est pas déjà visible."""

    trigger = page.locator(STATUS_TRIGGER)
    await trigger.wait_for(state="visible", timeout=15000)

    items = page.locator(STATUS_ITEM_SELECTOR)

    if await items.count() > 0:
        for index in range(await items.count()):
            if await items.nth(index).is_visible():
                logger.info("Le menu des états est déjà ouvert.")
                return

    await trigger.click()
    await page.wait_for_timeout(NAVIGATION_DELAY_MS)

    try:
        await page.locator(STATUS_ITEM_SELECTOR).first.wait_for(
            state="visible",
            timeout=10000,
        )
    except PlaywrightTimeoutError as error:
        raise RuntimeError(
            "Le menu des états ne s'est pas ouvert. "
            "Vérifie le sélecteur du bouton et le DOM de Vinted."
        ) from error

    logger.info("Menu des états ouvert.")


# ============================================================
# EXTRACTION DES ÉTATS
# ============================================================

async def extract_statuses(page):
    """Extrait les identifiants, libellés et descriptions des états."""

    elements = page.locator(STATUS_ITEM_SELECTOR)
    statuses = []
    seen_ids = set()

    count = await elements.count()
    logger.info("%s élément(s) détecté(s) dans le menu.", count)

    for index in range(count):
        element = elements.nth(index)

        try:
            if not await element.is_visible():
                continue

            test_id = await element.get_attribute("data-testid") or ""

            match = re.fullmatch(
                r"selectable-item-status-(\d+)",
                test_id,
            )

            if not match:
                continue

            status_id = match.group(1)

            if status_id in seen_ids:
                continue

            title_element = element.locator(
                STATUS_TITLE_SELECTOR
            )
            description_element = element.locator(
                STATUS_DESCRIPTION_SELECTOR
            )

            label = " ".join(
                (await title_element.inner_text()).split()
            )

            description = " ".join(
                (await description_element.inner_text()).split()
            )

            if not label:
                logger.warning(
                    "État ignoré : libellé vide (ID %s).",
                    status_id,
                )
                continue

            status = {
                "id": status_id,
                "label": label,
                "description": description,
            }

            statuses.append(status)
            seen_ids.add(status_id)

            logger.info(
                "État détecté : %s (ID : %s)",
                label,
                status_id,
            )

        except Exception:
            logger.exception(
                "Impossible d'extraire l'état à l'index %s.",
                index,
            )

    return statuses


# ============================================================
# PROGRAMME PRINCIPAL
# ============================================================

async def main():
    save_progress(
        status="running",
        message="Initialisation de Playwright.",
    )

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(locale="fr-FR")

        try:
            logger.info("Ouverture de Vinted...")

            await page.goto(
                URL,
                wait_until="domcontentloaded",
                timeout=60000,
            )

            await close_initial_windows(page)
            await open_status_filter(page)

            if DEBUG_PAUSE:
                logger.info("Pause de débogage activée.")
                await page.pause()

            save_progress(
                status="running",
                message="Extraction des états en cours.",
            )

            statuses = await extract_statuses(page)

            if not statuses:
                raise RuntimeError(
                    "Aucun état détecté. "
                    "Vérifie STATUS_ITEM_SELECTOR et le DOM."
                )

            # Tri par identifiant numérique pour obtenir un JSON stable.
            statuses.sort(key=lambda item: int(item["id"]))

            save_json(OUTPUT_FILE, statuses)

            save_json(
                STATS_FILE,
                {
                    "total_statuses": len(statuses),
                    "completed_at": time.strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ),
                },
            )

            save_progress(
                status="done",
                statuses_found=len(statuses),
                message="Récupération des états terminée.",
            )

            logger.info("========== RÉSUMÉ ==========")
            logger.info("États enregistrés : %s", len(statuses))
            logger.info("Fichier JSON : %s", OUTPUT_FILE)

        except Exception as error:
            logger.exception(
                "Erreur pendant la récupération des états."
            )

            save_progress(
                status="error",
                message=str(error),
            )

            raise

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
