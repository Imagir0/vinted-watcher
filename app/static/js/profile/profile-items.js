export function createProfileItems({
    itemsGrid,
    itemsCount
}) {
    let collectedItemCount = 0;
    const itemsFilters = document.getElementById("items-filters");

    /**
     * Virifie s'il y a au moins une annonce.
     */
    function updateItemsFiltersVisibility(count) {
        if (itemsFilters) {
            itemsFilters.hidden = count === 0;
        }
    }

    /**
     * Convertit un prix en nombre exploitable.
     */
    function parsePrice(price) {
        if (price === null || price === undefined || price === "") {
            return null;
        }

        if (typeof price === "number") {
            return Number.isFinite(price) ? price : null;
        }

        const normalized = String(price)
            .replace(/\s/g, "")
            .replace(",", ".")
            .replace(/[^\d.-]/g, "");

        if (!normalized) {
            return null;
        }

        const parsed = Number.parseFloat(normalized);

        return Number.isFinite(parsed) ? parsed : null;
    }

    /**
     * Formate un prix pour l'affichage.
     */
    function formatPrice(price) {
        const parsed = parsePrice(price);

        if (parsed === null) {
            return "Prix non renseigné";
        }

        return `${parsed.toLocaleString("fr-FR", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })} €`;
    }

    /**
     * Récupère une valeur textuelle parmi plusieurs propriétés possibles.
     */
    function getItemValue(item, keys, fallback = "") {
        for (const key of keys) {
            const value = item?.[key];

            if (value !== null && value !== undefined && value !== "") {
                return value;
            }
        }

        return fallback;
    }

    /**
     * Construit une carte d'annonce.
     */
    function createItemCard(item) {
        const card = document.createElement("article");
        card.className = "item-card";

        const itemUrl = getItemValue(item, [
            "url",
            "item_url",
            "absolute_url"
        ]);

        const imageUrl = getItemValue(item, [
            "photo",
            "image",
            "image_url",
            "thumbnail"
        ]);

        const title = String(
            getItemValue(item, ["title", "name"], "Annonce Vinted")
        );

        const price = getItemValue(item, [
            "price",
            "total_item_price"
        ]);

        if (itemUrl) {
            card.classList.add("item-card-clickable");
            card.tabIndex = 0;
            card.setAttribute("role", "link");
            card.setAttribute("aria-label", title);

            card.addEventListener("click", event => {
                if (event.target.closest("a")) {
                    return;
                }

                window.open(
                    itemUrl,
                    "_blank",
                    "noopener,noreferrer"
                );
            });

            card.addEventListener("keydown", event => {
                if (event.target !== card) {
                    return;
                }

                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();

                    window.open(
                        itemUrl,
                        "_blank",
                        "noopener,noreferrer"
                    );
                }
            });
        }

        if (imageUrl) {
            const imageContainer = document.createElement("div");
            imageContainer.className = "item-image-container";

            const image = document.createElement("img");
            image.className = "item-image";
            image.src = imageUrl;
            image.alt = title;
            image.loading = "lazy";
            image.referrerPolicy = "no-referrer";

            image.addEventListener("error", () => {
                image.remove();
                imageContainer.classList.add("item-image-missing");
            }, { once: true });

            imageContainer.appendChild(image);
            card.appendChild(imageContainer);
        }

        const content = document.createElement("div");
        content.className = "item-content";

        const titleElement = document.createElement("h3");
        titleElement.className = "item-title";
        titleElement.textContent = title;

        const priceElement = document.createElement("p");
        priceElement.className = "item-price";
        priceElement.textContent = formatPrice(price);

        content.append(titleElement, priceElement);

        const itemState = getItemValue(item, [
            "status",
            "condition",
            "state"
        ]);

        if (itemState) {
            const stateElement = document.createElement("p");
            stateElement.className = "item-condition";
            stateElement.textContent = String(itemState);
            content.appendChild(stateElement);
        }

        card.appendChild(content);

        return card;
    }

    /**
     * Affiche une liste d'annonces.
     *
     * append = true : ajoute les annonces au contenu existant.
     * append = false : remplace le contenu actuel.
     */
    function renderItems(items, append = false) {
        if (!itemsGrid) {
            return;
        }

        if (!Array.isArray(items)) {
            items = [];
        }

        if (!append) {
            itemsGrid.replaceChildren();
            collectedItemCount = 0;
        }

        const fragment = document.createDocumentFragment();

        for (const item of items) {
            fragment.appendChild(createItemCard(item));
        }

        itemsGrid.appendChild(fragment);
        collectedItemCount += items.length;

        updateItemsCount();
    }

    /**
     * Met à jour le compteur d'annonces affichées.
     */
    function updateItemsCount() {
        const count = itemsGrid
            ? itemsGrid.querySelectorAll(".item-card").length
            : collectedItemCount;

        updateItemsFiltersVisibility(count);

        if (!itemsCount) {
            return;
        }

        if (count === 0) {
            itemsCount.textContent = "Aucun article pour cet utilisateur";
            return;
        }

        itemsCount.textContent =
            `${count} annonce${count !== 1 ? "s" : ""} affichée${count !== 1 ? "s" : ""}`;
    }

    /**
     * Affiche le message de chargement des annonces.
     */
    function startLoadingItems() {
        if (itemsCount) {
            itemsCount.textContent = "Chargement des annonces…";
        }

        if (itemsFilters) {
            itemsFilters.hidden = true;
        }
    }

    /**
     * Réinitialise les annonces affichées.
     */
    function resetItems() {
        if (itemsGrid) {
            itemsGrid.replaceChildren();
        }

        collectedItemCount = 0;
        startLoadingItems();
    }

    /**
     * Termine le chargement en actualisant le compteur.
     */
    function finishItems(total = null) {
        const displayedCount = itemsGrid
            ? itemsGrid.querySelectorAll(".item-card").length
            : collectedItemCount;

        updateItemsFiltersVisibility(displayedCount);

        if (!itemsCount) {
            return;
        }

        if (displayedCount === 0) {
            itemsCount.textContent = "Aucun article pour cet utilisateur";
            return;
        }

        itemsCount.textContent =
            `${displayedCount} annonce${displayedCount !== 1 ? "s" : ""} affichée${displayedCount !== 1 ? "s" : ""}`;

        if (
            total !== null &&
            total !== undefined &&
            Number.isFinite(Number(total)) &&
            Number(total) > displayedCount
        ) {
            itemsCount.textContent += ` sur ${total}`;
        }
    }

    return {
        parsePrice,
        formatPrice,
        createItemCard,
        renderItems,
        updateItemsCount,
        resetItems,
        finishItems,
        startLoadingItems
    };
}