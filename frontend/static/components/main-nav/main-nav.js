document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("site-nav-container");

    if (!container) {
        console.error("Conteneur de navigation introuvable.");
        return;
    }

    try {
        const response = await fetch(
            "/static/components/main-nav/main-nav.html"
        );

        if (!response.ok) {
            throw new Error(
                `Chargement du menu impossible : HTTP ${response.status}`
            );
        }

        container.innerHTML = await response.text();

        const currentPath = window.location.pathname;
        const currentHash = window.location.hash;

        const links = container.querySelectorAll(
            "a[data-nav], .nav-home, .nav-profile"
        );

        links.forEach((link) => {
            const nav = link.dataset.nav;
            let isCurrent = false;

            if (nav === "search") {
                isCurrent =
                    currentPath === "/" &&
                    (!currentHash ||
                    currentHash === "#search" ||
                    currentHash === "#results");
            } else if (nav === "global-search") {
                isCurrent = currentPath === "/global-search";
            } else if (nav === "profile") {
                isCurrent = currentPath === "/profile";
            } else if (link.classList.contains("nav-home")) {
                isCurrent = currentPath === "/" && !currentHash;
            }

            if (isCurrent) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });

        container.querySelectorAll("[data-coming-soon]").forEach(
            (link) => {
                link.addEventListener("click", (event) => {
                    event.preventDefault();
                });
            }
        );
    } catch (error) {
        console.error("Erreur de chargement de la navigation :", error);
        container.textContent = "Impossible de charger la navigation.";
    }
});
