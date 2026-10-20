import asyncio
import json
import logging
import re
import os
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
OUTPUT_FILE = SCRIPT_DIR / "categories.json"
PROGRESS_FILE = SCRIPT_DIR / "categories_progress.json"
STATS_FILE = SCRIPT_DIR / "categories_stats.json"

FILTER_TRIGGER = '[data-testid="catalog--catalog-filter--trigger"]'
DROPDOWN_SELECTOR = '[data-testid="dropdown-content"]'
CATEGORY_SELECTOR = '[id^="catalog_ids-list-item-"]'
BACK_BUTTON_SELECTOR = '[data-testid="catalog-filter-go-back"]'

MAX_DEPTH = 20
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
    """Enregistre un JSON de manière atomique avec des tentatives en cas de verrouillage."""
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

            delay = 0.2 * (attempt + 1)
            time.sleep(delay)



def save_progress(
    status,
    scanned_categories,
    categories_found,
    current_category=None,
    message=None,
    total_categories=None,
):
    """Enregistre la progression dans le format attendu par la page Paramètres."""

    # Le total connu correspond au nombre de catégories déjà enregistrées.
    # Il ne représente pas nécessairement le nombre final de catégories.
    progress = {
        "status": status,
        "scanned_categories": scanned_categories,
        "scanned_ids": scanned_categories,
        "total_ids": total_categories if total_categories is not None else 0,
        "categories_found": categories_found,
        "current_category": current_category,
        "progress_percent": 0,
        "progress_label": current_category or "Préparation du scan…",
        "message": message or "",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    if total_categories is not None and total_categories > 0:
        progress["progress_percent"] = min(
            99,
            round(scanned_categories / total_categories * 100),
        )

    if status == "done":
        progress["progress_percent"] = 100
        progress["progress_label"] = "Terminé"
    elif status == "done_with_errors":
        progress["progress_percent"] = 100
        progress["progress_label"] = "Terminé avec des erreurs"
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
        await country_button.wait_for(state="visible", timeout=2000)
        await country_button.click()
        logger.info("Fenêtre de sélection du pays fermée.")
    except PlaywrightTimeoutError:
        logger.info("Aucune fenêtre de sélection du pays.")

    try:
        cookie_button = page.locator("#onetrust-reject-all-handler")
        await cookie_button.wait_for(state="visible", timeout=5000)
        await cookie_button.click()
        logger.info("Cookies refusés.")
    except PlaywrightTimeoutError:
        logger.info("Bouton de refus des cookies absent.")
    except Exception:
        logger.exception("Impossible de fermer la fenêtre de cookies.")


# ============================================================
# DÉTECTION DU MENU
# ============================================================

async def visible_dropdowns(page):
    dropdowns = page.locator(DROPDOWN_SELECTOR)
    result = []

    for index in range(await dropdowns.count()):
        item = dropdowns.nth(index)
        try:
            if await item.is_visible():
                result.append(item)
        except Exception:
            pass

    return result


async def active_dropdown(page):
    """Renvoie le menu visible actif, et non un dropdown masqué."""
    dropdowns = await visible_dropdowns(page)

    for dropdown in reversed(dropdowns):
        try:
            if await dropdown.locator(CATEGORY_SELECTOR).count() > 0:
                return dropdown
        except Exception:
            pass

    if dropdowns:
        return dropdowns[-1]

    raise RuntimeError("Aucun menu de catégories visible.")


async def open_category_filter(page):
    trigger = page.locator(FILTER_TRIGGER)
    await trigger.wait_for(state="visible", timeout=15000)

    if await trigger.get_attribute("aria-expanded") != "true":
        await trigger.click()

    try:
        await page.wait_for_function(
            """() => {
                const trigger = document.querySelector(
                    '[data-testid="catalog--catalog-filter--trigger"]'
                );
                return trigger?.getAttribute("aria-expanded") === "true";
            }""",
            timeout=10000,
        )
    except PlaywrightTimeoutError:
        if not await visible_dropdowns(page):
            raise RuntimeError("Le filtre des catégories ne s'est pas ouvert.")

    await page.wait_for_timeout(NAVIGATION_DELAY_MS)
    await active_dropdown(page)
    logger.info("Filtre des catégories ouvert.")


async def ensure_filter_open(page):
    """Ouvre le filtre uniquement si le menu n'est pas déjà visible."""
    try:
        await active_dropdown(page)
        return
    except RuntimeError:
        pass

    await open_category_filter(page)


async def has_back_button(page):
    """Indique si le menu actif affiche un bouton de retour."""
    try:
        dropdown = await active_dropdown(page)
        buttons = dropdown.locator(BACK_BUTTON_SELECTOR)

        for index in range(await buttons.count()):
            if await buttons.nth(index).is_visible():
                return True
    except Exception:
        return False

    return False


async def return_to_root(page):
    """Remonte au menu principal en suivant les boutons de retour."""
    await ensure_filter_open(page)

    for _ in range(MAX_DEPTH + 1):
        if not await has_back_button(page):
            return

        dropdown = await active_dropdown(page)
        buttons = dropdown.locator(BACK_BUTTON_SELECTOR)
        clicked = False

        for index in range(await buttons.count()):
            button = buttons.nth(index)
            if await button.is_visible():
                await button.click()
                await page.wait_for_timeout(NAVIGATION_DELAY_MS)
                clicked = True
                break

        if not clicked:
            raise RuntimeError("Le bouton Retour est présent mais non cliquable.")

    raise RuntimeError(
        "Impossible de revenir au niveau principal : profondeur maximale atteinte."
    )


async def extract_visible_categories(page):
    """Extrait les catégories affichées dans le menu actif."""
    dropdown = await active_dropdown(page)
    elements = dropdown.locator(CATEGORY_SELECTOR)

    categories = []
    seen_ids = set()

    for index in range(await elements.count()):
        element = elements.nth(index)

        try:
            if not await element.is_visible():
                continue

            html_id = await element.get_attribute("id") or ""
            match = re.fullmatch(r"catalog_ids-list-item-(\d+)", html_id)
            if not match:
                continue

            category_id = match.group(1)
            if category_id in seen_ids:
                continue

            label = " ".join((await element.inner_text()).split())
            if not label:
                continue

            # Vinted ajoute cette classe aux catégories qui ouvrent un sous-menu.
            # On peut donc reconnaître les feuilles avant de cliquer dessus.
            class_names = set((await element.get_attribute("class") or "").split())
            has_children = "web_ui__Cell__with-chevron" in class_names

            seen_ids.add(category_id)
            categories.append(
                {
                    "id": category_id,
                    "label": label,
                    "has_children": has_children,
                }
            )

        except Exception:
            logger.debug("Élément de catégorie ignoré.", exc_info=True)

    logger.info("%s catégorie(s) détectée(s).", len(categories))
    for category in categories:
        logger.info("  - %s (ID : %s)", category["label"], category["id"])

    return categories


async def click_category(page, category_id):
    dropdown = await active_dropdown(page)
    element = dropdown.locator(f'[id="catalog_ids-list-item-{category_id}"]')

    await element.wait_for(state="visible", timeout=10000)
    await element.scroll_into_view_if_needed()
    await element.click()
    await page.wait_for_timeout(NAVIGATION_DELAY_MS)

    logger.info("Catégorie sélectionnée : %s", category_id)


async def navigate_to_path(page, path_ids):
    """Reconstitue un chemin uniquement en cas de perte de l'état du menu."""
    await ensure_filter_open(page)
    await return_to_root(page)

    for category_id in path_ids:
        await click_category(page, category_id)

        if not await has_back_button(page):
            raise RuntimeError(
                f"La catégorie {category_id} n'a pas ouvert de sous-menu "
                "alors qu'un niveau enfant était attendu."
            )


async def menu_matches_categories(page, expected_categories):
    """Vérifie que le menu courant affiche encore le niveau attendu."""
    try:
        dropdown = await active_dropdown(page)
        elements = dropdown.locator(CATEGORY_SELECTOR)
        visible_ids = set()

        for index in range(await elements.count()):
            element = elements.nth(index)
            if not await element.is_visible():
                continue
            html_id = await element.get_attribute("id") or ""
            match = re.fullmatch(r"catalog_ids-list-item-(\d+)", html_id)
            if match:
                visible_ids.add(match.group(1))

        expected_ids = {item["id"] for item in expected_categories}
        return visible_ids == expected_ids
    except Exception:
        return False


async def restore_level(page, path_ids, expected_categories):
    """
    Conserve le niveau courant si possible. Le chemin complet n'est rejoué
    qu'en secours, si le clic a fermé ou déplacé le menu.
    """
    if await menu_matches_categories(page, expected_categories):
        return

    logger.debug("Le menu a changé d'état ; restauration du niveau courant.")
    await navigate_to_path(page, path_ids)

    if not await menu_matches_categories(page, expected_categories):
        raise RuntimeError(
            f"Impossible de restaurer le niveau de menu pour le chemin {path_ids}."
        )


async def return_one_level(page, expected_parent_categories):
    """Clique une seule fois sur Retour pour revenir au menu parent."""
    dropdown = await active_dropdown(page)
    buttons = dropdown.locator(BACK_BUTTON_SELECTOR)

    for index in range(await buttons.count()):
        button = buttons.nth(index)
        if await button.is_visible():
            await button.click()
            await page.wait_for_timeout(NAVIGATION_DELAY_MS)
            if await menu_matches_categories(page, expected_parent_categories):
                return
            break

    raise RuntimeError("Le bouton Retour n'a pas restauré le niveau parent attendu.")


# ============================================================
# SCAN RÉCURSIF
# ============================================================

class CategoryScanner:
    def __init__(self, page):
        self.page = page
        self.scanned = 0
        self.errors = []
        self.categories = []

    def persist(self, current_path=None, message=None):
        save_json(OUTPUT_FILE, self.categories)
        total = sum(1 for _ in iter_category_nodes(self.categories))
        save_progress(
            status="running",
            scanned_categories=self.scanned,
            categories_found=total,
            current_category=current_path,
            message=message or "",
        )

    async def scan_level(
        self, path_ids, parent_path="", depth=0, parent_options=None,
        return_to_parent=True
    ):
        """Explore le niveau actuellement ouvert, puis remonte avec Retour."""
        if depth > MAX_DEPTH:
            logger.warning("Profondeur maximale atteinte : %s", parent_path)
            return []

        visible_options = await extract_visible_categories(self.page)
        options = list(visible_options)

        # Dans certains menus, « Tous » reprend l'ID de la catégorie parente.
        # On l'ignore pour éviter de cliquer sur la catégorie déjà sélectionnée.
        parent_id = path_ids[-1] if path_ids else None
        options = [item for item in options if item["id"] != parent_id]

        nodes = [
            {"id": item["id"], "label": item["label"], "children": []}
            for item in options
        ]

        for option, node in zip(options, nodes):
            category_id = node["id"]
            label = node["label"]
            path = f"{parent_path} > {label}" if parent_path else label

            logger.info("Exploration : %s (ID : %s)", path, category_id)
            save_progress(
                status="running",
                scanned_categories=self.scanned,
                categories_found=sum(1 for _ in iter_category_nodes(self.categories)),
                current_category=path,
                message=f"Exploration de {path}",
            )

            try:
                if not option.get("has_children", False):
                    # Feuille : son ID et son libellé sont déjà connus.
                    # Ne pas cliquer évite de sélectionner « Tous » ou de fermer
                    # le menu ; on passe directement à l'élément suivant.
                    logger.info("Feuille détectée, aucun clic : %s (ID : %s)", label, category_id)
                else:
                    # Seules les catégories avec chevron sont ouvertes.
                    await click_category(self.page, category_id)

                    if not await has_back_button(self.page):
                        raise RuntimeError(
                            f"La catégorie {category_id} ({label}) possède un chevron, "
                            "mais aucun bouton Retour n'a été détecté après le clic."
                        )

                    # La récursion revient elle-même au menu parent via Retour.
                    node["children"] = await self.scan_level(
                        path_ids=path_ids + [category_id],
                        parent_path=path,
                        depth=depth + 1,
                        parent_options=visible_options,
                        return_to_parent=True,
                    )

                self.scanned += 1
                self.persist(path, f"Catégorie traitée : {path}")

            except Exception as error:
                logger.exception("Erreur sur la catégorie : %s", path)
                self.errors.append(
                    {
                        "id": category_id,
                        "label": label,
                        "path": path,
                        "error": str(error),
                    }
                )
                # Après une erreur, tenter de retrouver le niveau attendu avant
                # de poursuivre avec la catégorie suivante.
                try:
                    await restore_level(self.page, path_ids, visible_options)
                except Exception:
                    logger.exception("Impossible de restaurer le menu après erreur.")
                    raise

        if return_to_parent and path_ids:
            # À la fin d'un niveau, un seul Retour suffit pour remonter.
            # Le niveau parent est fourni par le chemin sans le dernier ID.
            if parent_options is None:
                raise RuntimeError(
                    "Les catégories du niveau parent sont nécessaires pour le retour."
                )
            await return_one_level(self.page, parent_options)

        return nodes


# ============================================================
# PROGRAMME PRINCIPAL
# ============================================================

async def main():
    save_progress(
        status="running",
        scanned_categories=0,
        categories_found=0,
        message="Initialisation de Playwright.",
    )

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(locale="fr-FR")

        try:
            logger.info("Ouverture de Vinted...")
            await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
            await close_initial_windows(page)
            await open_category_filter(page)

            if DEBUG_PAUSE:
                logger.info("Pause de débogage activée.")
                await page.pause()

            main_categories = await extract_visible_categories(page)
            if not main_categories:
                raise RuntimeError(
                    "Aucune catégorie principale détectée. "
                    "Vérifie CATEGORY_SELECTOR et le DOM."
                )

            scanner = CategoryScanner(page)
            scanner.categories = [
                {"id": item["id"], "label": item["label"], "children": []}
                for item in main_categories
            ]
            scanner.persist(message="Catégories principales détectées.")

            for index, category in enumerate(scanner.categories, start=1):
                logger.info(
                    "========== %s/%s : %s ==========",
                    index,
                    len(scanner.categories),
                    category["label"],
                )

                try:
                    # Relecture du menu racine pour éviter un état obsolète.
                    await return_to_root(page)
                    current_categories = await extract_visible_categories(page)
                    current = next(
                        (
                            item for item in current_categories
                            if item["id"] == category["id"]
                        ),
                        None,
                    )

                    if current is None:
                        logger.warning(
                            "Catégorie principale absente du menu : %s",
                            category["label"],
                        )
                        continue

                    category["label"] = current["label"]

                    if current.get("has_children", False):
                        await click_category(page, category["id"])

                        if not await has_back_button(page):
                            raise RuntimeError(
                                f"La catégorie principale {category['id']} "
                                "possède un chevron, mais aucun bouton Retour "
                                "n'a été détecté après le clic."
                            )

                        category["children"] = await scanner.scan_level(
                            path_ids=[category["id"]],
                            parent_path=category["label"],
                            depth=1,
                            parent_options=main_categories,
                        )
                    else:
                        logger.info(
                            "Catégorie principale terminale, aucun clic : %s (ID : %s)",
                            category["label"], category["id"]
                        )

                    scanner.scanned += 1
                    scanner.persist(
                        category["label"],
                        f"Catégorie principale terminée : {category['label']}",
                    )

                except Exception as error:
                    logger.exception(
                        "Erreur sur la catégorie principale : %s",
                        category["label"],
                    )
                    scanner.errors.append(
                        {
                            "id": category["id"],
                            "label": category["label"],
                            "error": str(error),
                        }
                    )
                    save_json(OUTPUT_FILE, scanner.categories)

            total_nodes = sum(1 for _ in iter_category_nodes(scanner.categories))
            save_json(
                STATS_FILE,
                {
                    "total_categories": total_nodes,
                    "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "errors": scanner.errors,
                },
            )
            save_progress(
                status="done_with_errors" if scanner.errors else "done",
                scanned_categories=scanner.scanned,
                categories_found=total_nodes,
                message=(
                    "Récupération terminée avec des erreurs."
                    if scanner.errors
                    else "Récupération des catégories terminée."
                ),
            )

            logger.info("========== RÉSUMÉ ==========")
            logger.info("Catégories enregistrées : %s", total_nodes)
            logger.info("Fichier JSON : %s", OUTPUT_FILE)
            logger.info("Nombre d'erreurs : %s", len(scanner.errors))

        except Exception as error:
            logger.exception("Erreur pendant la récupération des catégories.")
            save_progress(
                status="error",
                scanned_categories=0,
                categories_found=0,
                message=str(error),
            )
            raise

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
