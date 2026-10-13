import { $, money } from "./api.js";

export function renderStatistics(items) {
    const prices = items
        .filter(item => item.price !== null &&
            item.price !== undefined &&
            item.price !== "")
        .map(item => Number(item.price))
        .filter(Number.isFinite);

    $("stat-total").textContent = String(items.length);

    $("stat-average").textContent = prices.length
        ? money(prices.reduce((sum, price) => sum + price, 0) / prices.length)
        : "—";

    $("stat-min").textContent = prices.length
        ? money(Math.min(...prices))
        : "—";

    $("stat-max").textContent = prices.length
        ? money(Math.max(...prices))
        : "—";
}