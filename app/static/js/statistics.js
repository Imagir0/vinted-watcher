import { $, money } from "./api.js";

export function renderStatistics(items, trend = null) {
    const prices = items
        .filter(item =>
            item.price !== null &&
            item.price !== undefined &&
            item.price !== ""
        )
        .map(item => Number(item.price))
        .filter(Number.isFinite);

    $("stat-total").textContent = String(items.length);

    $("stat-average").textContent = prices.length
        ? money(
            prices.reduce((sum, price) => sum + price, 0) /
            prices.length
        )
        : "—";

    $("stat-min").textContent = prices.length
        ? money(Math.min(...prices))
        : "—";

    $("stat-max").textContent = prices.length
        ? money(Math.max(...prices))
        : "—";

    renderPriceTrend(trend);
}

function renderPriceTrend(trend) {
    const value = $("stat-trend");
    const detail = $("stat-trend-detail");

    if (!value || !detail) {
        return;
    }

    value.classList.remove("trend-up", "trend-down", "trend-stable");

    if (!trend || trend.direction === "insufficient") {
        value.textContent = "Données insuffisantes";
        detail.textContent =
            "Il faut des observations de prix sur les deux périodes de 7 jours.";
        return;
    }

    const change = Number(trend.change);
    const percent = trend.percent == null
        ? null
        : Number(trend.percent);

    if (!Number.isFinite(change)) {
        value.textContent = "Données insuffisantes";
        detail.textContent = "Tendance indisponible.";
        return;
    }

    if (trend.direction === "up") {
        value.textContent = `↑ ${money(Math.abs(change))}`;
        value.classList.add("trend-up");
    } else if (trend.direction === "down") {
        value.textContent = `↓ ${money(Math.abs(change))}`;
        value.classList.add("trend-down");
    } else {
        value.textContent = "→ Stable";
        value.classList.add("trend-stable");
    }

    const percentageText = percent === null
        ? ""
        : ` (${percent > 0 ? "+" : ""}${percent.toFixed(1)} %)`;

    detail.textContent =
        `Moyenne actuelle : ${money(trend.current_average)} · ` +
        `Période précédente : ${money(trend.previous_average)}` +
        percentageText +
        ` · ${trend.current_count} annonce(s) contre ` +
        `${trend.previous_count}`;
}
