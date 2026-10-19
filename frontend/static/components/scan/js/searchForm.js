import { $ } from "./api.js";

export function currentQuery() {
    const query = {
        search_text: $("search_text").value.trim(),
        order: $("order").value
    };

    const brand = $("brand_id").value.trim();
    const catalog = $("catalog_id").value.trim();
    const priceFrom = $("price_from").value;
    const priceTo = $("price_to").value;

    const rawSizes = $("selected_sizes").value;
    let sizes = [];

    try {
        const parsed = JSON.parse(rawSizes || "[]");

        sizes = Array.isArray(parsed)
            ? parsed
                .map(size =>
                    typeof size === "object" && size !== null
                        ? String(size.id ?? "")
                        : String(size)
                )
                .filter(Boolean)
            : [];
    } catch (error) {
        console.error("Format des tailles invalide :", error);
    }

    const statuses = $("status_ids").value.trim();

    if (brand) {
        query["attribute_ids[brand]"] = brand;
    }

    if (catalog) {
        query["attribute_ids[catalog]"] = catalog;
    }

    if (priceFrom !== "") {
        query.price_from = priceFrom;
    }

    if (priceTo !== "") {
        query.price_to = priceTo;
    }

    if (sizes.length > 0) {
        query.size_ids = sizes;
    }

    if (statuses) {
        query.status_ids = statuses;
    }

    return query;
}

export function loadConfigIntoForm(cfg) {
    const query = (cfg.queries && cfg.queries[0]) || {};

    $("search_text").value = query.search_text || "";
    $("order").value = query.order || "newest_first";
    $("brand_id").value = query["attribute_ids[brand]"] || "";
    $("catalog_id").value = query["attribute_ids[catalog]"] || "";
    $("price_from").value = query.price_from || "";
    $("price_to").value = query.price_to || "";
    $("selected_sizes").value = JSON.stringify(
        (Array.isArray(query.size_ids)
            ? query.size_ids
            : query.size_ids
                ? [query.size_ids]
                : []
        ).map(size => {
            if (typeof size === "object" && size !== null) {
                return size;
            }

            return {
                id: String(size),
                label: String(size),
                category: "",
                section: ""
            };
        })
    );
    $("status_ids").value = query.status_ids || "";

    $("pages").value = cfg.pages ?? 2;
    $("interval_seconds").value = cfg.interval_seconds ?? 300;

    // Synchroniser les composants visuels après la restauration.
    window.refreshCategoryPickerSelection?.();
    window.refreshSizePickerSelection?.();
    window.refreshStatusPickerSelection?.();

    $("excluded_keywords").value =
        (cfg.excluded_keywords || []).join("\n");

    $("stat-pages").textContent =
        `${cfg.pages ?? 2} page(s) par recherche · ` +
        `intervalle ${cfg.interval_seconds ?? 300} s`;
}
