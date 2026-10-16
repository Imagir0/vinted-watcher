
export function createItemsFilters({
    itemsSearch,
    priceMinInput,
    priceMaxInput,
    priceMinValue,
    priceMaxValue,
    itemsCount,
    getItems,
    renderItems
}) {
    let minPrice = 0;
    let maxPrice = 0;

    /**
     * Convertit un prix Vinted en nombre.
     */
    function parsePrice(price) {
        if (typeof price === "number") {
            return price;
        }

        if (!price) {
            return 0;
        }

        const normalizedPrice = String(price)
            .replace(/\s/g, "")
            .replace(",", ".")
            .replace(/[^\d.]/g, "");

        const parsedPrice = Number.parseFloat(normalizedPrice);

        return Number.isFinite(parsedPrice) ? parsedPrice : 0;
    }

    /**
     * Formate un prix pour l'affichage.
     */
    function formatPrice(price) {
        return `${Number(price).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })} €`;
    }

    /**
     * Met à jour les valeurs affichées sous les curseurs.
     */
    function updatePriceControls() {
        if (priceMinValue && priceMinInput) {
            priceMinValue.textContent = formatPrice(priceMinInput.value);
        }

        if (priceMaxValue && priceMaxInput) {
            priceMaxValue.textContent = formatPrice(priceMaxInput.value);
        }
    }

    /**
     * Met à jour la représentation visuelle de la plage de prix.
     * Fonctionne avec des curseurs HTML de type range superposés.
     */
    function updatePriceSliderVisual() {
        if (!priceMinInput || !priceMaxInput) {
            return;
        }

        const min = Number(priceMinInput.min || 0);
        const max = Number(priceMaxInput.max || 100);
        const range = max - min;

        if (range <= 0) {
            return;
        }

        const lowerValue = Number(priceMinInput.value);
        const upperValue = Number(priceMaxInput.value);

        const left = ((lowerValue - min) / range) * 100;
        const right = 100 - ((upperValue - min) / range) * 100;

        const slider = priceMinInput.parentElement;

        if (slider) {
            slider.style.setProperty("--range-left", `${left}%`);
            slider.style.setProperty("--range-right", `${right}%`);
        }
    }

    /**
     * Met à jour le compteur d'annonces filtrées.
     */
    function updateItemsCount(count) {
        if (!itemsCount) {
            return;
        }

        itemsCount.textContent = `${count} article${count > 1 ? "s" : ""}`;
    }

    /**
     * Filtre les annonces selon le titre et la plage de prix.
     */
    function filterItems() {
        const items = getItems();
        const searchTerm = itemsSearch?.value.trim().toLowerCase() || "";

        const min = Number(priceMinInput?.value ?? minPrice);
        const max = Number(priceMaxInput?.value ?? maxPrice);

        const filteredItems = items.filter(item => {
            const title = String(item.title || "").toLowerCase();
            const price = parsePrice(item.price);

            const matchesTitle = title.includes(searchTerm);
            const matchesPrice = price >= min && price <= max;

            return matchesTitle && matchesPrice;
        });

        renderItems(filteredItems, false);
        updateItemsCount(filteredItems.length);
    }

    /**
     * Initialise les bornes des filtres à partir des annonces.
     */
    function initializePriceRange(items) {
        if (!Array.isArray(items) || items.length === 0) {
            minPrice = 0;
            maxPrice = 0;
            return;
        }

        const prices = items
            .map(item => parsePrice(item.price))
            .filter(price => Number.isFinite(price) && price >= 0);

        if (prices.length === 0) {
            minPrice = 0;
            maxPrice = 0;
            return;
        }

        minPrice = Math.floor(Math.min(...prices));
        maxPrice = Math.ceil(Math.max(...prices));

        if (minPrice === maxPrice) {
            maxPrice = minPrice + 1;
        }

        if (priceMinInput && priceMaxInput) {
            priceMinInput.min = String(minPrice);
            priceMinInput.max = String(maxPrice);
            priceMaxInput.min = String(minPrice);
            priceMaxInput.max = String(maxPrice);

            priceMinInput.value = String(minPrice);
            priceMaxInput.value = String(maxPrice);
        }

        updatePriceControls();
        updatePriceSliderVisual();
    }

    /**
     * Réinitialise les filtres de prix et de titre.
     */
    function resetFilters() {
        if (itemsSearch) {
            itemsSearch.value = "";
        }

        if (priceMinInput) {
            priceMinInput.value = String(minPrice);
        }

        if (priceMaxInput) {
            priceMaxInput.value = String(maxPrice);
        }

        updatePriceControls();
        updatePriceSliderVisual();
        filterItems();
    }

    /**
     * Empêche le curseur minimum de dépasser le maximum.
     */
    function handleMinPriceChange() {
        if (!priceMinInput || !priceMaxInput) {
            return;
        }

        if (Number(priceMinInput.value) > Number(priceMaxInput.value)) {
            priceMinInput.value = priceMaxInput.value;
        }

        updatePriceControls();
        updatePriceSliderVisual();
        filterItems();
    }

    /**
     * Empêche le curseur maximum de passer sous le minimum.
     */
    function handleMaxPriceChange() {
        if (!priceMinInput || !priceMaxInput) {
            return;
        }

        if (Number(priceMaxInput.value) < Number(priceMinInput.value)) {
            priceMaxInput.value = priceMinInput.value;
        }

        updatePriceControls();
        updatePriceSliderVisual();
        filterItems();
    }

    /**
     * Branche les événements des contrôles.
     */
    itemsSearch?.addEventListener("input", filterItems);
    priceMinInput?.addEventListener("input", handleMinPriceChange);
    priceMaxInput?.addEventListener("input", handleMaxPriceChange);

    return {
        parsePrice,
        formatPrice,
        filterItems,
        initializePriceRange,
        resetFilters,
        updatePriceControls,
        updatePriceSliderVisual,
        updateItemsCount
    };
}
