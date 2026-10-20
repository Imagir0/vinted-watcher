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

    // Tailles sélectionnées
    let sizes = [];

    try {
        const parsed = JSON.parse($("selected_sizes").value || "[]");

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

    // États sélectionnés
    let statuses = [];

    try {
        const parsed = JSON.parse(
            $("selected_statuses").value || "[]"
        );

        statuses = Array.isArray(parsed)
            ? parsed
                .map(status =>
                    typeof status === "object" && status !== null
                        ? String(status.id ?? "")
                        : String(status)
                )
                .filter(Boolean)
            : [];
    } catch (error) {
        console.error("Format des états invalide :", error);
    }

    if (brand) {
        query["attribute_ids[brand]"] = brand;
    }

    if (catalog) {
        query["attribute_ids[catalog]"] = catalog;
    }

    if (priceFrom !== "") {
        query.price_from = Math.max(
            0,
            Number(priceFrom) - 0.01
        ).toFixed(2);
    }

    if (priceTo !== "") {
        query.price_to = (
            Number(priceTo) + 0.01
        ).toFixed(2);
    }

    if (sizes.length > 0) {
        query.size_ids = sizes;
    }

    if (statuses.length > 0) {
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

    // Restaurer les tailles
    $("selected_sizes").value = JSON.stringify(
        (
            Array.isArray(query.size_ids)
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

    // Restaurer les états
    $("selected_statuses").value = JSON.stringify(
        (
            Array.isArray(query.status_ids)
                ? query.status_ids
                : query.status_ids
                    ? [query.status_ids]
                    : []
        ).map(status => {
            if (typeof status === "object" && status !== null) {
                return status;
            }

            return {
                id: String(status),
                label: String(status)
            };
        })
    );

    $("pages").value = cfg.pages ?? 2;
    $("interval_seconds").value = cfg.interval_seconds ?? 300;

    // Synchroniser les composants visuels
    window.refreshCategoryPickerSelection?.();
    window.refreshSizePickerSelection?.();
    window.refreshStatusPickerSelection?.();

    $("excluded_keywords").value =
        (cfg.excluded_keywords || []).join("\n");

    $("stat-pages").textContent =
        `${cfg.pages ?? 2} page(s) par recherche · ` +
        `intervalle ${cfg.interval_seconds ?? 300} s`;
}
