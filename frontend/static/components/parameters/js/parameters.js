document.addEventListener("DOMContentLoaded", () => {
    const syncButton = document.getElementById("sync-categories-btn");
    const totalElement = document.getElementById("categories-total");
    const statusElement = document.getElementById("categories-status");
    const lastUpdateElement = document.getElementById("categories-last-update");
    const progressContainer = document.getElementById("categories-progress-container");
    const progressBar = document.getElementById("categories-progress-bar");
    const progressLabel = document.getElementById("categories-progress-label");
    const progressPercent = document.getElementById("categories-progress-percent");
    const scannedElement = document.getElementById("categories-scanned");
    const foundElement = document.getElementById("categories-found");

    if (!syncButton) return;

    let statusPolling = null;
    let scanIsRunning = false;

    async function loadCategoryStats() {
        try {
            const response = await fetch(
                `/data/categories/categories_stats.json?t=${Date.now()}`
            );

            if (!response.ok) return;

            const stats = await response.json();

            if (
                !scanIsRunning &&
                Number.isFinite(Number(stats.total_categories))
            ) {
                totalElement.textContent =
                    Number(stats.total_categories).toLocaleString("fr-FR");
            }

            if (stats.completed_at) {
                const date = new Date(stats.completed_at.replace(" ", "T"));

                if (!Number.isNaN(date.getTime())) {
                    lastUpdateElement.textContent =
                        `Dernière mise à jour : ${date.toLocaleString("fr-FR")}`;
                }
            }
        } catch (error) {
            console.error("Erreur de lecture des statistiques :", error);
        }
    }

    function renderScanStatus(data) {
        const running = data.status === "running";
        const done = data.status === "done";
        const failed = data.status === "error";
        scanIsRunning = running;

        syncButton.disabled = running;
        syncButton.textContent = running
            ? "Récupération en cours…"
            : "Récupérer les catégories";

        if (running) {
            statusElement.textContent =
                data.message || "Récupération des catégories en cours…";
            
            if (
                totalElement &&
                Number.isFinite(Number(data.categories_found))
            ) {
                totalElement.textContent =
                    Number(data.categories_found).toLocaleString("fr-FR");
            }

            progressContainer.hidden = false;

            if (Number.isFinite(data.progress_percent)) {
                const percent = Math.max(
                    0,
                    Math.min(100, data.progress_percent)
                );

                progressBar.style.width = `${percent}%`;
                progressPercent.textContent = `${Math.round(percent)} %`;
            } else {
                progressBar.style.width = "35%";
                progressPercent.textContent = "En cours";
            }

            progressLabel.textContent = data.progress_label || "Scan en cours…";
        } else if (done) {
            statusElement.textContent = "Récupération terminée.";
            progressContainer.hidden = false;
            progressBar.style.width = "100%";
            progressPercent.textContent = "100 %";
            progressLabel.textContent = "Terminé";

            loadCategoryStats();
        } else if (failed) {
            statusElement.textContent =
                data.message || "La récupération a échoué.";
            progressContainer.hidden = true;
        } else {
            statusElement.textContent =
                "Prêt à récupérer les catégories.";
            progressContainer.hidden = true;
        }

        if (scannedElement) {
            const scanned = Number(data.scanned_ids || 0);
            const total = Number(data.total_ids);

            scannedElement.textContent =
                `${scanned.toLocaleString("fr-FR")} / ${
                    Number.isFinite(total)
                        ? total.toLocaleString("fr-FR")
                        : "—"
                }`;
        }

        if (foundElement && Number.isFinite(Number(data.categories_found))) {
            foundElement.textContent =
                Number(data.categories_found).toLocaleString("fr-FR");
        }
    }

    async function checkScanStatus() {
        try {
            const response = await fetch(
                `/api/categories/scan/status?t=${Date.now()}`,
                { cache: "no-store" }
            );

            if (!response.ok) {
                console.error(
                    "Erreur HTTP lors de la lecture de la progression :",
                    response.status
                );
                return;
            }

            const data = await response.json();

            renderScanStatus(data);

            if (data.status === "running") {
                if (statusPolling === null) {
                    statusPolling = setInterval(checkScanStatus, 1000);
                }
            } else {
                if (statusPolling !== null) {
                    clearInterval(statusPolling);
                    statusPolling = null;
                }
            }
        } catch (error) {
            console.error(
                "Erreur de vérification du scan :",
                error
            );
        }
    }

    syncButton.addEventListener("click", async () => {
        syncButton.disabled = true;
        syncButton.textContent = "Lancement…";
        statusElement.textContent = "Lancement du scan des catégories…";

        // Réinitialiser les compteurs visuels au lancement
        if (totalElement) {
            totalElement.textContent = "0";
        }

        if (scannedElement) {
            scannedElement.textContent = "0 / —";
        }

        if (foundElement) {
            foundElement.textContent = "0";
        }

        progressBar.style.width = "0%";
        progressPercent.textContent = "0 %";
        progressLabel.textContent = "Préparation du scan…";
        progressContainer.hidden = false;

        try {
            const response = await fetch("/api/categories/scan", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                },
            });

            const result = await response.json();

            if (!response.ok || !result.ok) {
                throw new Error(
                    result.error || "Impossible de lancer le scan."
                );
            }

            statusElement.textContent =
                result.message || "Scan lancé.";

            await checkScanStatus();
        } catch (error) {
            statusElement.textContent = `Erreur : ${error.message}`;
            syncButton.disabled = false;
            syncButton.textContent = "Récupérer les catégories";
        }
    });

    loadCategoryStats();
    checkScanStatus();
});
