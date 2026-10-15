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
    const sizes = $("size_ids").value.trim();
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

    if (sizes) {
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
    $("size_ids").value = query.size_ids || "";
    $("status_ids").value = query.status_ids || "";
    $("pages").value = cfg.pages ?? 2;
    $("interval_seconds").value = cfg.interval_seconds ?? 300;

    $("excluded_keywords").value =
        (cfg.excluded_keywords || []).join("\n");

    $("stat-pages").textContent =
        `${cfg.pages ?? 2} page(s) par recherche · ` +
        `intervalle ${cfg.interval_seconds ?? 300} s`;
}
