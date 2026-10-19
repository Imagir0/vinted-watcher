document.addEventListener("DOMContentLoaded", () => {
    // =========================================================
    // CATÉGORIES
    // =========================================================

    const categoryElements = {
        button: document.getElementById("sync-categories-btn"),
        total: document.getElementById("categories-total"),
        status: document.getElementById("categories-status"),
        lastUpdate: document.getElementById("categories-last-update"),
        progressContainer: document.getElementById("categories-progress-container"),
        progressBar: document.getElementById("categories-progress-bar"),
        progressLabel: document.getElementById("categories-progress-label"),
        progressPercent: document.getElementById("categories-progress-percent"),
        scanned: document.getElementById("categories-scanned"),
        found: document.getElementById("categories-found"),
    };

    function formatDate(value) {
        if (!value) return null;

        const date = new Date(String(value).replace(" ", "T"));

        if (Number.isNaN(date.getTime())) return null;

        return date.toLocaleString("fr-FR");
    }

    function setLastUpdate(element, value) {
        if (!element) return;

        const formattedDate = formatDate(value);

        if (formattedDate) {
            element.textContent = `Dernière mise à jour : ${formattedDate}`;
        }
    }

    // Ne pas bloquer l'initialisation des tailles si la carte
    // des catégories n'est pas présente dans la page.
    if (categoryElements.button) {
        let statusPolling = null;
        let scanIsRunning = false;

        async function loadCategoryStats() {
            try {
                const response = await fetch(
                    `/data/categories/categories_stats.json?t=${Date.now()}`,
                    { cache: "no-store" }
                );

                if (!response.ok) return;

                const stats = await response.json();

                if (
                    !scanIsRunning &&
                    categoryElements.total &&
                    Number.isFinite(Number(stats.total_categories))
                ) {
                    categoryElements.total.textContent =
                        Number(stats.total_categories).toLocaleString("fr-FR");
                }

                setLastUpdate(categoryElements.lastUpdate, stats.completed_at);
            } catch (error) {
                console.error(
                    "Erreur de lecture des statistiques des catégories :",
                    error
                );
            }
        }

        function renderCategoryStatus(data) {
            const running = data.status === "running";
            const done = data.status === "done";
            const failed = data.status === "error";

            scanIsRunning = running;
            categoryElements.button.disabled = running;
            categoryElements.button.textContent = running
                ? "Récupération en cours…"
                : "Récupérer les catégories";

            if (running) {
                if (categoryElements.status) {
                    categoryElements.status.textContent =
                        data.message || "Récupération des catégories en cours…";
                }

                if (
                    categoryElements.total &&
                    Number.isFinite(Number(data.categories_found))
                ) {
                    categoryElements.total.textContent =
                        Number(data.categories_found).toLocaleString("fr-FR");
                }

                if (categoryElements.progressContainer) {
                    categoryElements.progressContainer.hidden = false;
                }

                if (categoryElements.progressBar) {
                    const percent = Number(data.progress_percent);

                    categoryElements.progressBar.style.width =
                        Number.isFinite(percent)
                            ? `${Math.max(0, Math.min(100, percent))}%`
                            : "35%";
                }

                if (categoryElements.progressPercent) {
                    const percent = Number(data.progress_percent);

                    categoryElements.progressPercent.textContent =
                        Number.isFinite(percent)
                            ? `${Math.round(Math.max(0, Math.min(100, percent)))} %`
                            : "En cours";
                }

                if (categoryElements.progressLabel) {
                    categoryElements.progressLabel.textContent =
                        data.progress_label || "Scan en cours…";
                }
            } else if (done) {
                if (categoryElements.status) {
                    categoryElements.status.textContent =
                        data.message || "Récupération des catégories terminée.";
                }

                if (categoryElements.progressContainer) {
                    categoryElements.progressContainer.hidden = false;
                }

                if (categoryElements.progressBar) {
                    categoryElements.progressBar.style.width = "100%";
                }

                if (categoryElements.progressPercent) {
                    categoryElements.progressPercent.textContent = "100 %";
                }

                if (categoryElements.progressLabel) {
                    categoryElements.progressLabel.textContent = "Terminé";
                }

                loadCategoryStats();
            } else if (failed) {
                if (categoryElements.status) {
                    categoryElements.status.textContent =
                        data.message || "La récupération des catégories a échoué.";
                }

                if (categoryElements.progressContainer) {
                    categoryElements.progressContainer.hidden = true;
                }
            } else {
                if (categoryElements.status) {
                    categoryElements.status.textContent =
                        "Prêt à récupérer les catégories.";
                }

                if (categoryElements.progressContainer) {
                    categoryElements.progressContainer.hidden = true;
                }
            }

            if (categoryElements.scanned) {
                const scanned = Number(data.scanned_ids || 0);
                const total = Number(data.total_ids);

                categoryElements.scanned.textContent =
                    `${scanned.toLocaleString("fr-FR")} / ${
                        Number.isFinite(total)
                            ? total.toLocaleString("fr-FR")
                            : "—"
                    }`;
            }

            if (
                categoryElements.found &&
                data.categories_found !== undefined &&
                Number.isFinite(Number(data.categories_found))
            ) {
                categoryElements.found.textContent =
                    Number(data.categories_found).toLocaleString("fr-FR");
            }
        }

        async function checkCategoryStatus() {
            try {
                const response = await fetch(
                    `/api/categories/scan/status?t=${Date.now()}`,
                    { cache: "no-store" }
                );

                if (!response.ok) {
                    console.error(
                        "Erreur HTTP lors de la lecture de la progression des catégories :",
                        response.status
                    );
                    return;
                }

                const data = await response.json();
                renderCategoryStatus(data);

                if (data.status === "running") {
                    if (statusPolling === null) {
                        statusPolling = setInterval(checkCategoryStatus, 1000);
                    }
                } else if (statusPolling !== null) {
                    clearInterval(statusPolling);
                    statusPolling = null;
                }
            } catch (error) {
                console.error(
                    "Erreur de vérification du scan des catégories :",
                    error
                );
            }
        }

        categoryElements.button.addEventListener("click", async () => {
            categoryElements.button.disabled = true;
            categoryElements.button.textContent = "Lancement…";

            if (categoryElements.status) {
                categoryElements.status.textContent =
                    "Lancement du scan des catégories…";
            }

            if (categoryElements.total) {
                categoryElements.total.textContent = "0";
            }

            if (categoryElements.scanned) {
                categoryElements.scanned.textContent = "0 / —";
            }

            if (categoryElements.found) {
                categoryElements.found.textContent = "0";
            }

            if (categoryElements.progressBar) {
                categoryElements.progressBar.style.width = "0%";
            }

            if (categoryElements.progressPercent) {
                categoryElements.progressPercent.textContent = "0 %";
            }

            if (categoryElements.progressLabel) {
                categoryElements.progressLabel.textContent = "Préparation du scan…";
            }

            if (categoryElements.progressContainer) {
                categoryElements.progressContainer.hidden = false;
            }

            try {
                const response = await fetch("/api/categories/scan", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                });

                const result = await response.json();

                if (!response.ok || !result.ok) {
                    throw new Error(
                        result.error || "Impossible de lancer le scan des catégories."
                    );
                }

                if (categoryElements.status) {
                    categoryElements.status.textContent =
                        result.message || "Scan des catégories lancé.";
                }

                await checkCategoryStatus();
            } catch (error) {
                if (categoryElements.status) {
                    categoryElements.status.textContent =
                        `Erreur : ${error.message}`;
                }

                categoryElements.button.disabled = false;
                categoryElements.button.textContent = "Récupérer les catégories";
            }
        });

        loadCategoryStats();
        checkCategoryStatus();
    }

    // =========================================================
    // TAILLES
    // =========================================================

    const sizeElements = {
        button: document.getElementById("sync-sizes-btn"),
        total: document.getElementById("sizes-total"),
        status: document.getElementById("sizes-status"),
        lastUpdate: document.getElementById("sizes-last-update"),
        progressContainer: document.getElementById("sizes-progress-container"),
        progressBar: document.getElementById("sizes-progress-bar"),
        progressLabel: document.getElementById("sizes-progress-label"),
        progressPercent: document.getElementById("sizes-progress-percent"),
    };

    if (sizeElements.button) {
        let statusPolling = null;
        let scanIsRunning = false;

        async function loadSizeStats() {
            try {
                const response = await fetch(
                    `/data/sizes/sizes_stats.json?t=${Date.now()}`,
                    { cache: "no-store" }
                );

                if (!response.ok) return;

                const stats = await response.json();

                if (
                    !scanIsRunning &&
                    sizeElements.total &&
                    Number.isFinite(Number(stats.total_sizes))
                ) {
                    sizeElements.total.textContent =
                        Number(stats.total_sizes).toLocaleString("fr-FR");
                }

                setLastUpdate(sizeElements.lastUpdate, stats.completed_at);
            } catch (error) {
                console.error(
                    "Erreur de lecture des statistiques des tailles :",
                    error
                );
            }
        }

        function renderSizeStatus(data) {
            const running = data.status === "running";
            const done = data.status === "done";
            const failed = data.status === "error";

            scanIsRunning = running;

            sizeElements.button.disabled = running;
            sizeElements.button.textContent = running
                ? "Récupération en cours…"
                : "Récupérer les tailles";

            if (sizeElements.status) {
                if (running) {
                    sizeElements.status.textContent =
                        data.message || "Récupération des tailles en cours…";
                } else if (done) {
                    sizeElements.status.textContent =
                        data.message || "Récupération des tailles terminée.";
                } else if (failed) {
                    sizeElements.status.textContent =
                        data.message || "La récupération des tailles a échoué.";
                } else {
                    sizeElements.status.textContent =
                        "Prêt à récupérer les tailles.";
                }
            }

            if (running || done) {
                if (sizeElements.progressContainer) {
                    sizeElements.progressContainer.hidden = false;
                }

                const percent = Number(data.progress_percent);
                const safePercent = done
                    ? 100
                    : Number.isFinite(percent)
                        ? Math.max(0, Math.min(100, percent))
                        : 0;

                if (sizeElements.progressBar) {
                    sizeElements.progressBar.style.width = `${safePercent}%`;
                }

                if (sizeElements.progressPercent) {
                    sizeElements.progressPercent.textContent = `${Math.round(safePercent)} %`;
                }

                if (sizeElements.progressLabel) {
                    sizeElements.progressLabel.textContent = done
                        ? "Terminé"
                        : data.progress_label || "Scan en cours…";
                }
            } else if (failed) {
                if (sizeElements.progressContainer) {
                    sizeElements.progressContainer.hidden = true;
                }
            } else if (sizeElements.progressContainer) {
                sizeElements.progressContainer.hidden = true;
            }

            if (
                sizeElements.total &&
                data.sizes_found !== undefined &&
                Number.isFinite(Number(data.sizes_found))
            ) {
                sizeElements.total.textContent =
                    Number(data.sizes_found).toLocaleString("fr-FR");
            }

            if (done) {
                loadSizeStats();
            }
        }

        async function checkSizeStatus() {
            try {
                const response = await fetch(
                    `/api/sizes/scan/status?t=${Date.now()}`,
                    { cache: "no-store" }
                );

                if (!response.ok) {
                    console.error(
                        "Erreur HTTP lors de la lecture de la progression des tailles :",
                        response.status
                    );
                    return;
                }

                const data = await response.json();
                renderSizeStatus(data);

                if (data.status === "running") {
                    if (statusPolling === null) {
                        statusPolling = setInterval(checkSizeStatus, 1000);
                    }
                } else if (statusPolling !== null) {
                    clearInterval(statusPolling);
                    statusPolling = null;
                }
            } catch (error) {
                console.error(
                    "Erreur de vérification du scan des tailles :",
                    error
                );
            }
        }

        sizeElements.button.addEventListener("click", async () => {
            sizeElements.button.disabled = true;
            sizeElements.button.textContent = "Lancement…";

            if (sizeElements.status) {
                sizeElements.status.textContent =
                    "Lancement du scan des tailles…";
            }

            if (sizeElements.total) {
                sizeElements.total.textContent = "0";
            }

            if (sizeElements.progressBar) {
                sizeElements.progressBar.style.width = "0%";
            }

            if (sizeElements.progressPercent) {
                sizeElements.progressPercent.textContent = "0 %";
            }

            if (sizeElements.progressLabel) {
                sizeElements.progressLabel.textContent = "Préparation du scan…";
            }

            if (sizeElements.progressContainer) {
                sizeElements.progressContainer.hidden = false;
            }

            try {
                const response = await fetch("/api/sizes/scan", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                });

                const result = await response.json();

                if (!response.ok || !result.ok) {
                    throw new Error(
                        result.error || "Impossible de lancer le scan des tailles."
                    );
                }

                if (sizeElements.status) {
                    sizeElements.status.textContent =
                        result.message || "Scan des tailles lancé.";
                }

                await checkSizeStatus();
            } catch (error) {
                if (sizeElements.status) {
                    sizeElements.status.textContent =
                        `Erreur : ${error.message}`;
                }

                sizeElements.button.disabled = false;
                sizeElements.button.textContent = "Récupérer les tailles";
            }
        });

        loadSizeStats();
        checkSizeStatus();
    }
});
