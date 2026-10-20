import asyncio
import json
import logging
from pathlib import Path
import time

from playwright.async_api import (
    async_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

# ============================================================
# CONFIGURATION
# ============================================================

URL = (
    "https://www.vinted.fr/catalog"
    "?search_id=4673972922"
    "&page=1"
    "&time=1792342318"
)

CATEGORIES = [
    "Femmes",
    "Hommes",
    "Enfants",
    "Maison",
    "Électronique",
    "Sport",
]

# Fichier situé dans le même dossier que ce script :
# data/sizes/scan_sizes.py
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = SCRIPT_DIR / "sizes.json"
PROGRESS_FILE = SCRIPT_DIR / "sizes_progress.json"
STATS_FILE = SCRIPT_DIR / "sizes_stats.json"

FILTER_TRIGGER = '[data-testid="catalog--size-filter--trigger"]'
DROPDOWN_SELECTOR = '[data-testid="dropdown-content"]'
OPTION_SELECTOR = '[data-testid^="filter-grid-option-"]'

def save_progress(
    status,
    scanned_categories,
    sizes_found,
    category=None,
    message=None,
):
    total_categories = len(CATEGORIES)

    progress = {
        "status": status,
        "scanned_categories": scanned_categories,
        "total_categories": total_categories,
        "sizes_found": sizes_found,
        "progress_percent": round(
            scanned_categories / total_categories * 100
        ) if total_categories else 100,
        "progress_label": (
            f"Catégorie {scanned_categories}/{total_categories}"
        ),
        "current_category": category,
        "message": message or "",
    }

    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)

    with PROGRESS_FILE.open("w", encoding="utf-8") as file:
        json.dump(progress, file, ensure_ascii=False, indent=2)

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
# OUTILS PLAYWRIGHT
# ============================================================

async def click_if_visible(page, selector, description):
    """Clique sur un élément s'il est présent et visible."""
    locator = page.locator(selector).first

    try:
        await locator.wait_for(state="visible", timeout=3000)
        await locator.click()
        logger.info("%s : cliqué", description)
        return True
    except PlaywrightTimeoutError:
        logger.info("%s : absent, ignoré", description)
        return False


async def wait_for_dropdown(page):
    """Attend que le menu des tailles soit prêt."""
    dropdown = page.locator(DROPDOWN_SELECTOR)

    await dropdown.wait_for(state="visible", timeout=15000)

    # Le menu peut afficher un loader pendant le chargement.
    loader = dropdown.locator(
        '[data-testid="catalog-filter-loader"]'
    )

    try:
        await loader.wait_for(state="hidden", timeout=10000)
    except PlaywrightTimeoutError:
        logger.warning("Le loader est toujours présent ou a expiré.")

    await dropdown.locator("h2").first.wait_for(
        state="visible",
        timeout=15000,
    )

    return dropdown


async def open_size_filter(page):
    """Ouvre le filtre des tailles et attend son contenu."""
    trigger = page.locator(FILTER_TRIGGER)

    await trigger.wait_for(state="visible", timeout=15000)
    await trigger.click()

    return await wait_for_dropdown(page)




async def reset_to_main_categories(page):
    """Remonte au niveau des catégories principales."""
    dropdown = page.locator('[data-testid="dropdown-content"]')
    back_button = dropdown.locator(
        '[data-testid="size-dropdown-go-back"]'
    )

    # Tant que le bouton retour existe et est visible,
    # remonter d'un niveau.
    while await back_button.count() > 0 and await back_button.is_visible():
        await back_button.click()

        # Attendre que le menu soit actualisé.
        await page.wait_for_timeout(300)

        # Réinitialiser le locator après le changement de contenu.
        dropdown = page.locator('[data-testid="dropdown-content"]')
        back_button = dropdown.locator(
            '[data-testid="size-dropdown-go-back"]'
        )

    # Attendre le retour des catégories principales.
    await dropdown.locator("h2").first.wait_for(
        state="visible",
        timeout=10000,
    )

    logger.info("Retour aux catégories principales effectué.")

    return dropdown




# ============================================================
# EXTRACTION DES TAILLES
# ============================================================

async def extract_category_sizes(page, category):
    dropdown = page.locator(DROPDOWN_SELECTOR)

    # Recherche le titre correspondant exactement à la catégorie.
    headings = dropdown.locator("h2")
    heading_count = await headings.count()
    category_heading = None

    for index in range(heading_count):
        heading = headings.nth(index)
        heading_text = (await heading.inner_text()).strip()

        if heading_text == category:
            category_heading = heading
            break

    if category_heading is None:
        raise RuntimeError(
            f"Catégorie principale introuvable : {category}"
        )

    logger.info("Ouverture de la catégorie : %s", category)
    await category_heading.click()

    # Attend que les sous-sections apparaissent.
    await dropdown.locator("ul[aria-label]").first.wait_for(
        state="visible",
        timeout=15000,
    )

    # Extrait toutes les listes directement depuis le DOM.
    sections = await dropdown.evaluate(
        """
        (element) => {
            const result = {};

            const lists = element.querySelectorAll(
                'ul[aria-label]'
            );

            for (const list of lists) {
                const sectionName = (
                    list.getAttribute('aria-label') || ''
                ).trim();

                if (!sectionName) {
                    continue;
                }

                const options = Array.from(
                    list.querySelectorAll(
                        '[data-testid^="filter-grid-option-"]'
                    )
                ).map((option) => {
                    const testId = option.getAttribute(
                        'data-testid'
                    ) || '';

                    const id = testId.replace(
                        'filter-grid-option-',
                        ''
                    );

                    return {
                        id: id,
                        label: (
                            option.getAttribute('aria-label')
                            || option.innerText
                            || ''
                        ).trim()
                    };
                });

                // Évite d'écraser une section si plusieurs listes
                // portent le même nom.
                if (Object.prototype.hasOwnProperty.call(
                    result,
                    sectionName
                )) {
                    result[sectionName].push(...options);
                } else {
                    result[sectionName] = options;
                }
            }

            return result;
        }
        """
    )

    total_options = sum(
        len(options) for options in sections.values()
    )

    logger.info(
        "%s : %s sous-sections, %s options",
        category,
        len(sections),
        total_options,
    )

    for section_name, options in sections.items():
        logger.info(
            "  - %s : %s options",
            section_name,
            len(options),
        )

    if not sections:
        logger.warning(
            "Aucune option récupérée pour %s.",
            category,
        )

    return sections


# ============================================================
# SAUVEGARDE JSON
# ============================================================

def save_json(data):
    """Enregistre les données dans data/sizes/sizes.json."""
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT_FILE.open("w", encoding="utf-8") as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=4,
        )

    logger.info("Fichier JSON enregistré : %s", OUTPUT_FILE)


# ============================================================
# PROGRAMME PRINCIPAL
# ============================================================

async def main():
    results = {}
    errors = {}

    save_progress(
        status="running",
        scanned_categories=0,
        sizes_found=0,
        message="Initialisation de Playwright…",
    )

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
        )

        page = await browser.new_page(
            locale="fr-FR",
        )

        try:
            logger.info("Ouverture de Vinted...")
            await page.goto(
                URL,
                wait_until="domcontentloaded",
                timeout=60000,
            )

            # Ferme les éventuelles fenêtres initiales.
            await click_if_visible(
                page,
                '[data-testid="domain-select-modal-close-button"]',
                "Fenêtre de sélection du pays",
            )

            await click_if_visible(
                page,
                "#onetrust-reject-all-handler",
                "Refus des cookies",
            )

            # Ouvre le filtre avant de commencer.
            await open_size_filter(page)

            for index, category in enumerate(CATEGORIES):
                logger.info(
                    "========== %s/%s : %s ==========",
                    index + 1,
                    len(CATEGORIES),
                    category,
                )

                try:
                    # Pour les catégories suivantes, revenir
                    # à la liste des catégories principales.
                    if index > 0:
                        await reset_to_main_categories(page)

                    results[category] = await extract_category_sizes(
                        page,
                        category,
                    )

                    # Sauvegarde progressive : les données déjà
                    # récupérées restent disponibles si le script
                    # rencontre ensuite une erreur.
                    save_json(results)

                except Exception as error:
                    logger.exception(
                        "Erreur pour la catégorie %s",
                        category,
                    )

                    errors[category] = str(error)

                    # Conserve une entrée explicite dans le JSON.
                    results.setdefault(category, {})

                    save_json(results)

                sizes_found = sum(
                    len(options)
                    for sections in results.values()
                    for options in sections.values()
                )

                save_progress(
                    status="running",
                    scanned_categories=index + 1,
                    sizes_found=sizes_found,
                    category=category,
                    message=f"Traitement terminé pour {category}",
                )

            logger.info("========== RÉSUMÉ ==========")

            total_options = 0

            for category, sections in results.items():
                category_total = sum(
                    len(options)
                    for options in sections.values()
                )

                total_options += category_total

                logger.info(
                    "%s : %s sous-sections, %s options",
                    category,
                    len(sections),
                    category_total,
                )

            sizes_found = sum(
                len(options)
                for sections in results.values()
                for options in sections.values()
            )

            save_progress(
                status="done",
                scanned_categories=len(CATEGORIES),
                sizes_found=sizes_found,
                message=(
                    "Récupération des tailles terminée."
                    if not errors
                    else f"Synchronisation terminée avec {len(errors)} erreur(s)."
                ),
            )

            with STATS_FILE.open("w", encoding="utf-8") as file:
                json.dump(
                    {
                        "total_sizes": sizes_found,
                        "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            logger.info(
                "Total : %s options récupérées.",
                total_options,
            )

            if errors:
                logger.warning(
                    "Catégories en erreur : %s",
                    ", ".join(errors.keys()),
                )
                logger.warning(
                    "Détails des erreurs : %s",
                    json.dumps(errors, ensure_ascii=False),
                )

            logger.info("Terminé.")

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
