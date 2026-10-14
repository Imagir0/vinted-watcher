
import logging
import re
from urllib.parse import urlparse

from playwright.async_api import (
    async_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

from .profile_info import _extract_profile_data
from .database import get_cached_profile, save_cached_profile
from .profile_items import (
    BATCH_SIZE,
    MAX_ITEMS,
    iter_items_in_batches,
)

VINTED_URL = "https://www.vinted.fr"

logger = logging.getLogger(__name__)


class ProfileFetchError(Exception):
    """Erreur lors de la lecture d'un profil Vinted."""


async def iter_public_profile_events(
    member_id: str,
    batch_size: int = BATCH_SIZE,
    max_items: int = MAX_ITEMS,
):
    member_id = str(member_id).strip()

    if not re.fullmatch(r"\d{1,20}", member_id):
        yield {
            "event": "error",
            "data": {"error": "L'identifiant doit être numérique."},
        }
        return

    if batch_size < 1:
        yield {
            "event": "error",
            "data": {
                "error": "La taille du lot doit être supérieure ou égale à 1."
            },
        }
        return

    if max_items < 1:
        yield {
            "event": "error",
            "data": {
                "error": "La limite d'articles doit être supérieure ou égale à 1."
            },
        }
        return

    profile_url = f"{VINTED_URL}/member/{member_id}"

    # On tente de récupérer le profil en cache.
    cached_profile = get_cached_profile(member_id)
    profile_data = None

    if cached_profile is not None:
        profile_data = dict(cached_profile)
        profile_data.update({
            "member_id": member_id,
            "profile_url": profile_url,
            "items": [],
            "items_count": 0,
            "items_batch_size": batch_size,
            "items_limit": max_items,
            "warning": None,
        })

        # Le profil peut être affiché immédiatement.
        yield {
            "event": "profile",
            "data": profile_data,
        }

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)

            try:
                page = await browser.new_page(
                    locale="fr-FR",
                    viewport={"width": 1440, "height": 1000},
                )

                response = await page.goto(
                    profile_url,
                    wait_until="domcontentloaded",
                    timeout=30000,
                )

                if response and response.status == 404:
                    raise ProfileFetchError("Profil introuvable.")

                try:
                    await page.wait_for_load_state(
                        "networkidle",
                        timeout=10000,
                    )
                except PlaywrightTimeoutError:
                    logger.debug(
                        "La page n'a pas atteint networkidle ; "
                        "poursuite avec le DOM courant."
                    )

                await page.wait_for_timeout(1200)

                parsed_url = urlparse(page.url)

                if parsed_url.hostname not in {
                    "vinted.fr",
                    "www.vinted.fr",
                }:
                    raise ProfileFetchError(
                        "Vinted a redirigé vers une page inattendue."
                    )

                grid_count = await page.locator(
                    'div[data-testid="grid-item"]'
                ).count()

                container_count = await page.locator(
                    '[data-testid^="product-item-id-"]'
                ).count()

                if grid_count == 0:
                    logger.warning(
                        "Aucune carte grid-item trouvée au chargement."
                    )

                # Si le profil n'était pas en cache, on l'extrait maintenant.
                if profile_data is None:
                    profile = await _extract_profile_data(
                        page,
                        member_id,
                    )

                    profile_data = {
                        "member_id": member_id,
                        "profile_url": profile_url,
                        "username": profile.get("username"),
                        "bio": profile.get("description"),
                        "avatar": profile.get("avatar"),
                        "followers_count": profile.get("followers_count"),
                        "following_count": profile.get("following_count"),
                        "ratings_count": profile.get("ratings_count"),
                        "rating_average": profile.get("rating_average"),
                        "items": [],
                        "items_count": 0,
                        "items_batch_size": batch_size,
                        "items_limit": max_items,
                        "warning": None,
                        "debug": {
                            "page_title": profile.get("pageTitle"),
                            "body_preview": (
                                profile.get("bodyText") or ""
                            )[:1200],
                            "final_url": page.url,
                            "initial_grid_count": grid_count,
                            "initial_item_container_count": container_count,
                        },
                    }

                    save_cached_profile(member_id, profile_data)

                    yield {
                        "event": "profile",
                        "data": profile_data,
                    }

                # Le profil a été envoyé : on collecte les annonces.
                total_items = 0

                async for batch in iter_items_in_batches(
                    page,
                    batch_size=batch_size,
                    max_items=max_items,
                ):
                    total_items += len(batch)

                    yield {
                        "event": "items",
                        "data": {
                            "items": batch,
                            "items_count": total_items,
                        },
                    }

                warning_messages = []

                if (
                    profile_data.get("followers_count") is None
                    or profile_data.get("following_count") is None
                    or profile_data.get("ratings_count") is None
                    or profile_data.get("rating_average") is None
                ):
                    warning_messages.append(
                        "Certaines données du profil sont absentes du DOM."
                    )

                warning = " ".join(warning_messages) or None

                yield {
                    "event": "done",
                    "data": {
                        "member_id": member_id,
                        "items_count": total_items,
                        "items_limit": max_items,
                        "items_limit_reached": total_items >= max_items,
                        "warning": warning,
                    },
                }

            finally:
                await browser.close()

    except ProfileFetchError as exc:
        yield {
            "event": "error",
            "data": {"error": str(exc)},
        }

    except Exception as exc:
        logger.exception(
            "Erreur pendant l'extraction DOM du profil %s",
            member_id,
        )

        yield {
            "event": "error",
            "data": {
                "error": (
                    "Impossible de lire le DOM du profil : "
                    f"{type(exc).__name__}: {exc}"
                )
            },
        }


async def get_public_profile(
    member_id: str,
    batch_size: int = BATCH_SIZE,
    max_items: int = MAX_ITEMS,
) -> dict:
    profile_result = None
    items = []

    async for message in iter_public_profile_events(
        member_id,
        batch_size=batch_size,
        max_items=max_items,
    ):
        event = message["event"]
        data = message["data"]

        if event == "error":
            raise ProfileFetchError(data["error"])

        if event == "profile":
            profile_result = data

        elif event == "items":
            items.extend(data["items"])

        elif event == "done":
            if profile_result is None:
                raise ProfileFetchError(
                    "Les données du profil n'ont pas été reçues."
                )

            profile_result.update(data)

    if profile_result is None:
        raise ProfileFetchError(
            "Aucune donnée n'a été reçue pour ce profil."
        )

    profile_result["items"] = items
    profile_result["items_count"] = len(items)

    return profile_result
