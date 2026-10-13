export const $ = id => document.getElementById(id);

export function notice(message, isError = false) {
    const el = $("notice");
    el.textContent = message;
    el.style.background = isError ? "#fff0ef" : "#eef7f7";
    el.style.color = isError ? "#8b1e16" : "#222";
}

export function money(value) {
    if (value === null || value === undefined || value === "") {
        return "Prix indisponible";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "Prix indisponible";
    }

    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR"
    }).format(number);
}

export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[ch]);
}

export async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json"
        },
        ...options
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `Erreur HTTP ${response.status}`);
    }

    return data;
}
