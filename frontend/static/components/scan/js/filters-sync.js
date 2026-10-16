
const syncButton = document.getElementById("sync-filters-btn");
const syncStatus = document.getElementById("filters-sync-status");

syncButton?.addEventListener("click", async () => {
    if (syncButton.disabled) return;

    syncButton.disabled = true;
    syncButton.textContent = "Lancement en cours…";
    syncStatus.textContent =
        "Lancement du script de récupération des catégories…";

    try {
        const response = await fetch("/api/categories/scan", {
            method: "POST",
            headers: {
                "Accept": "application/json",
            },
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            throw new Error(
                result.error || "Impossible de lancer le script."
            );
        }

        syncStatus.textContent =
            result.message || "Le script de récupération des catégories a été lancé.";

    } catch (error) {
        syncStatus.textContent =
            `Erreur : ${error.message}`;
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = "Récupérer les catégories";
    }
});
