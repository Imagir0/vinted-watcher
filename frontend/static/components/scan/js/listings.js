import { $, api, money, escapeHtml } from "./api.js";
import { renderStatistics } from "./statistics.js";

let allItems = [];
let trendData = null;

export async function loadItems() {
    const [itemsResponse, statsResponse] = await Promise.all([
        api("/api/items?limit=2000"),
        api("/api/stats")
    ]);

    allItems = itemsResponse.items || [];
    trendData = statsResponse;

    renderItems();
}

function filteredItems() {
    const text = $("filter-text").value
        .trim()
        .toLocaleLowerCase("fr");

    const brand = $("filter-brand").value
        .trim()
        .toLocaleLowerCase("fr");

    const min = $("filter-min").value === ""
        ? null
        : Number($("filter-min").value);

    const max = $("filter-max").value === ""
        ? null
        : Number($("filter-max").value);

    const items = allItems.filter(item => {
        const haystack = [
            item.title || "",
            item.brand || "",
            item.description || "",
            item.size || ""
        ].join(" ").toLocaleLowerCase("fr");

        if (text && !haystack.includes(text)) {
            return false;
        }

        if (
            brand &&
            !(item.brand || "").toLocaleLowerCase("fr").includes(brand)
        ) {
            return false;
        }

        if (
            min !== null &&
            (item.price == null || Number(item.price) < min)
        ) {
            return false;
        }

        if (
            max !== null &&
            (item.price == null || Number(item.price) > max)
        ) {
            return false;
        }

        return true;
    });

    const sort = $("display-sort").value;

    items.sort((a, b) => {
        if (sort === "price-asc") {
            return (a.price ?? Infinity) - (b.price ?? Infinity);
        }

        if (sort === "price-desc") {
            return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        }

        if (sort === "favourites") {
            return (b.favourite_count || 0) -
                (a.favourite_count || 0);
        }

        if (sort === "title") {
            return (a.title || "").localeCompare(b.title || "", "fr");
        }

        const difference = String(b.found_at || "")
            .localeCompare(String(a.found_at || ""));

        return sort === "oldest" ? -difference : difference;
    });

    return items;
}

export function renderItems() {
    const items = filteredItems();

    $("result-count").textContent =
        `${items.length} annonce(s) affichée(s) sur ` +
        `${allItems.length} enregistrée(s)`;

    // Les statistiques ne dépendent pas des filtres d'affichage locaux.
    renderStatistics(allItems, trendData);

    if (!items.length) {
        $("listings").innerHTML =
            '<div class="empty">Aucun article ne correspond aux filtres.</div>';
        return;
    }

    $("listings").innerHTML = items.map(item => {
        const title = escapeHtml(item.title || "Annonce sans titre");

        const url = /^https?:\/\/(?:www\.)?vinted\./i.test(item.url || "")
            ? item.url
            : "";

        const image = /^https?:\/\//i.test(item.image || "")
            ? item.image
            : "";

        return `
            <article class="listing">
                ${image ? `
                    <img
                        src="${escapeHtml(image)}"
                        alt=""
                        loading="lazy"
                        onerror="this.style.display='none'"
                    >
                ` : ""}

                <div class="listing-info">
                    <div class="listing-title">${title}</div>

                    <div class="muted">
                        ${escapeHtml(item.brand || "Marque inconnue")}
                        ${item.size
                            ? " · Taille " + escapeHtml(item.size)
                            : ""}
                    </div>

                    <div class="muted">
                        ${escapeHtml(item.found_at || "")}
                        ${item.favourite_count
                            ? " · ♥ " + escapeHtml(item.favourite_count)
                            : ""}
                    </div>
                </div>

                <div class="price">${money(item.price)}</div>

                ${url ? `
                    <a
                        href="${escapeHtml(url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="listing-link"
                    >
                        Voir l'article ↗
                    </a>
                ` : ""}
            </article>
        `;
    }).join("");
}
