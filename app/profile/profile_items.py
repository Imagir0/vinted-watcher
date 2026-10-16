
import logging

from playwright.async_api import TimeoutError as PlaywrightTimeoutError


BATCH_SIZE = 10
MAX_ITEMS = 500
MAX_IDLE_ROUNDS = 4
SCROLL_TIMEOUT_MS = 2500
SCROLL_PAUSE_MS = 800

logger = logging.getLogger(__name__)


async def _extract_visible_items(page):
    return await page.evaluate(
        r"""
        () => {
            const text = (el) =>
                el?.textContent?.replace(/\s+/g, ' ').trim() || null;

            const parseCount = (value) => {
                if (!value) return null;

                const match = value.match(/[\d\s\u00a0.,]+/);
                if (!match) return null;

                const digits = match[0].replace(/[^\d]/g, '');
                if (!digits) return null;

                const result = Number.parseInt(digits, 10);
                return Number.isFinite(result) ? result : null;
            };

            const cards = [
                ...document.querySelectorAll(
                    'div[data-testid="grid-item"]'
                )
            ];

            const items = [];

            for (const card of cards) {
                const link = card.querySelector(
                    'a[data-testid$="--overlay-link"]'
                );

                const image = card.querySelector(
                    'img[data-testid$="--image--img"]'
                );

                const priceElement = card.querySelector(
                    '[data-testid$="--price-text"]'
                );

                const viewsElement = card.querySelector(
                    '[data-testid$="--description-title"]'
                );

                const favoritesElement = card.querySelector(
                    '[data-testid$="--description-subtitle"]'
                );

                const containers = [
                    ...card.querySelectorAll(
                        '[data-testid^="product-item-id-"]'
                    )
                ];

                const idContainer = containers.find((element) =>
                    /^product-item-id-\d+$/.test(
                        element.getAttribute('data-testid') || ''
                    )
                );

                const testId =
                    idContainer?.getAttribute('data-testid') || '';

                const idMatch = testId.match(
                    /^product-item-id-(\d+)$/
                );

                const href = link?.getAttribute('href') || null;
                const hrefMatch = href?.match(/\/items\/(\d+)/);

                const id = idMatch?.[1] || hrefMatch?.[1] || null;

                if (!id) continue;

                const title = (
                    link?.getAttribute('title') ||
                    image?.getAttribute('alt') ||
                    'Annonce Vinted'
                ).split(',', 1)[0].trim();

                items.push({
                    id,
                    title,
                    url: href
                        ? new URL(href, location.origin).href
                        : null,
                    photo:
                        image?.currentSrc ||
                        image?.getAttribute('src') ||
                        image?.getAttribute('data-src') ||
                        null,
                    price: text(priceElement),
                    views: parseCount(text(viewsElement)),
                    favorites: parseCount(text(favoritesElement))
                });
            }

            return items;
        }
        """
    )


async def iter_items_in_batches(
    page,
    batch_size=BATCH_SIZE,
    max_items=MAX_ITEMS,
):
    collected = {}
    idle_rounds = 0
    last_logged_batch = 0

    logger.info(
        "Début de la collecte DOM : lot=%s, limite=%s",
        batch_size,
        max_items,
    )

    while len(collected) < max_items:
        visible_items = await _extract_visible_items(page)
        count_before = len(collected)
        new_items = []

        for item in visible_items:
            item_id = item["id"]

            if item_id not in collected:
                collected[item_id] = item
                new_items.append(item)

                if len(collected) >= max_items:
                    break

        current_count = len(collected)
        current_batch = (current_count + batch_size - 1) // batch_size

        if current_batch > last_logged_batch:
            last_logged_batch = current_batch
            logger.info("Annonces récupérées : %s", current_count)

        if new_items:
            yield new_items

        if current_count >= max_items:
            break

        if current_count > count_before:
            idle_rounds = 0
        else:
            idle_rounds += 1

        if idle_rounds >= MAX_IDLE_ROUNDS:
            break

        await page.evaluate(
            """
            () => {
                window.scrollBy({
                    top: Math.max(500, window.innerHeight * 0.8),
                    left: 0,
                    behavior: 'instant'
                });
            }
            """
        )

        try:
            await page.wait_for_function(
                """
                previousCount =>
                    document.querySelectorAll(
                        'div[data-testid="grid-item"]'
                    ).length > previousCount
                """,
                arg=len(visible_items),
                timeout=SCROLL_TIMEOUT_MS,
            )
        except PlaywrightTimeoutError:
            pass

        await page.wait_for_timeout(SCROLL_PAUSE_MS)

    logger.info("Collecte terminée : %s annonce(s).", len(collected))


async def _collect_items_in_batches(
    page,
    batch_size=BATCH_SIZE,
    max_items=MAX_ITEMS,
):
    result = []

    async for batch in iter_items_in_batches(
        page,
        batch_size=batch_size,
        max_items=max_items,
    ):
        result.extend(batch)

    return result
