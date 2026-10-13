import { $, api, notice } from "./api.js";
import { currentQuery, loadConfigIntoForm } from "./search.js";
import { loadItems, renderItems } from "./listings.js";

let config = {};

function updateAutoButton(running) {
    $("auto-btn").textContent = running
        ? "Arrêter l'auto-scan"
        : "Démarrer l'auto-scan";

    $("stat-auto").textContent = running ? "Actif" : "Inactif";
}

async function loadConfig() {
    config = await api("/api/config");
    loadConfigIntoForm(config);
    updateAutoButton(Boolean(config.auto_running));
}

$("search-form").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const query = currentQuery();

        const pages = Math.max(
            1,
            Math.min(10, Number($("pages").value) || 2)
        );

        const interval = Math.max(
            60,
            Number($("interval_seconds").value) || 300
        );

        const excluded = $("excluded_keywords").value
            .split(/\r?\n/)
            .map(value => value.trim())
            .filter(Boolean);

        config = await api("/api/config", {
            method: "POST",
            body: JSON.stringify({
                queries: [query],
                pages,
                interval_seconds: interval,
                excluded_keywords: excluded
            })
        });

        loadConfigIntoForm(config);
        updateAutoButton(Boolean(config.auto_running));

        notice("Recherche enregistrée. Les prochains scans utiliseront ces paramètres.");
    } catch (error) {
        notice(`Impossible d'enregistrer : ${error.message}`, true);
    }
});

$("scan-btn").addEventListener("click", async () => {
    $("scan-btn").disabled = true;
    notice("Scan en cours…");

    try {
        const result = await api("/api/scan", {
            method: "POST",
            body: "{}"
        });

        await loadItems();

        notice(`Scan terminé : ${result.new_items} nouvelle(s) annonce(s).`);
    } catch (error) {
        notice(`Échec du scan : ${error.message}`, true);
    } finally {
        $("scan-btn").disabled = false;
    }
});

$("auto-btn").addEventListener("click", async () => {
    try {
        const action = config.auto_running ? "stop" : "start";

        const result = await api(`/api/auto/${action}`, {
            method: "POST",
            body: "{}"
        });

        config.auto_running = result.auto_running;

        updateAutoButton(Boolean(result.auto_running));

        notice(result.auto_running
            ? "Surveillance automatique activée."
            : "Surveillance automatique arrêtée."
        );
    } catch (error) {
        notice(`Impossible de modifier l'auto-scan : ${error.message}`, true);
    }
});

$("display-sort").addEventListener("change", renderItems);

[
    "filter-text",
    "filter-brand",
    "filter-min",
    "filter-max"
].forEach(id => {
    $(id).addEventListener("input", renderItems);
});

async function init() {
    try {
        await loadConfig();
        await loadItems();

        notice("Prêt. Les annonces affichées sont celles déjà enregistrées par le scanner.");

        setInterval(async () => {
            try {
                const latest = await api("/api/config");

                config.auto_running = latest.auto_running;
                updateAutoButton(Boolean(latest.auto_running));

                await loadItems();
            } catch (_) {
            }
        }, 15000);
    } catch (error) {
        notice(`Erreur au chargement : ${error.message}`, true);
    }
}

init();