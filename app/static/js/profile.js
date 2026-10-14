
document.addEventListener("DOMContentLoaded", () => {
    const profileForm = document.getElementById("profile-form");
    const memberIdInput = document.getElementById("member-id");
    const searchButton = document.getElementById("search-button");
    const profileStatus = document.getElementById("profile-status");

    const memberName = document.getElementById("member-name");
    const memberBio = document.getElementById("member-bio");
    const memberAvatar = document.getElementById("member-avatar");

    const followersCount = document.getElementById("followers-count");
    const followingCount = document.getElementById("following-count");
    const ratingsCount = document.getElementById("ratings-count");
    const ratingAverage = document.getElementById("rating-average");
    const ratingStars = document.getElementById("rating-stars");

    const originalProfile = document.getElementById("original-profile");
    const profileResult = document.getElementById("profile-result");

    let currentRequest = null;

    function renderRatingStars(rating) {
        if (!ratingStars) return;

        ratingStars.replaceChildren();

        const parsedRating = Number(rating);
        const validRating =
            rating !== null &&
            rating !== undefined &&
            rating !== "" &&
            Number.isFinite(parsedRating);

        if (!validRating) {
            for (let i = 0; i < 5; i++) {
                const star = document.createElement("span");
                star.className = "rating-star empty";
                star.textContent = "★";
                ratingStars.appendChild(star);
            }

            if (ratingAverage) {
                ratingAverage.textContent = "Note indisponible";
            }

            return;
        }

        const normalizedRating = Math.max(0, Math.min(5, parsedRating));

        for (let i = 0; i < 5; i++) {
            const star = document.createElement("span");
            const fill = Math.max(
                0,
                Math.min(100, (normalizedRating - i) * 100)
            );

            star.className = "rating-star";
            star.textContent = "★";
            star.style.setProperty("--star-fill", `${fill}%`);

            if (fill === 0) {
                star.classList.add("empty");
            }

            ratingStars.appendChild(star);
        }

        if (ratingAverage) {
            ratingAverage.textContent =
                `${normalizedRating.toFixed(1)} / 5`;
        }
    }

    function displayProfile(data) {
        if (memberName) {
            memberName.textContent = data.username || "Profil Vinted";
        }

        if (memberBio) {
            memberBio.textContent =
                data.bio || "Aucune biographie renseignée.";
        }

        if (followersCount) {
            followersCount.textContent = data.followers_count ?? "—";
        }

        if (followingCount) {
            followingCount.textContent = data.following_count ?? "—";
        }

        if (ratingsCount) {
            ratingsCount.textContent = data.ratings_count ?? "—";
        }

        if (memberAvatar) {
            if (data.avatar) {
                memberAvatar.src = data.avatar;
                memberAvatar.hidden = false;
            } else {
                memberAvatar.removeAttribute("src");
            }
        }

        if (originalProfile && data.profile_url) {
            originalProfile.href = data.profile_url;
            originalProfile.target = "_blank";
            originalProfile.rel = "noopener noreferrer";
        }

        if (memberIdInput) {
            memberIdInput.value = data.member_id ?? "";
        }

        renderRatingStars(data.rating_average);

        if (profileResult) {
            profileResult.hidden = false;
        }
    }

    function displayError(message) {
        if (profileStatus) {
            profileStatus.textContent = message;
        }
    }

    /**
     * Lit le flux SSE de la route FastAPI.
     * Le profil est affiché avant le début de la collecte des annonces.
     */
    async function fetchProfile(memberId, signal) {
        const response = await fetch(
            `/api/profile/${encodeURIComponent(memberId)}`,
            {
                method: "GET",
                headers: {
                    Accept: "text/event-stream",
                },
                signal,
            }
        );

        if (!response.ok) {
            let message = `Erreur du serveur (${response.status}).`;

            try {
                const data = await response.json();
                message = data.detail || data.error || message;
            } catch {
                // Conserve le message par défaut.
            }

            throw new Error(message);
        }

        if (!response.body) {
            throw new Error("Le navigateur ne permet pas de lire le flux.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let receivedProfile = false;
        let receivedDone = false;

        async function handleEvent(block) {
            let eventName = "message";
            const dataLines = [];

            for (const line of block.split(/\r?\n/)) {
                if (line.startsWith("event:")) {
                    eventName = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }

            if (dataLines.length === 0) return;

            let data;

            try {
                data = JSON.parse(dataLines.join("\n"));
            } catch {
                throw new Error("Le serveur a transmis un événement invalide.");
            }

            if (eventName === "profile") {
                displayProfile(data);
                renderItems([], false);

                receivedProfile = true;

                if (profileStatus) {
                    profileStatus.textContent =
                        "Profil chargé. Chargement des annonces…";
                }
            } else if (eventName === "items") {
                if (!receivedProfile) {
                    throw new Error(
                        "Les annonces ont été reçues avant le profil."
                    );
                }

                renderItems(
                    Array.isArray(data.items) ? data.items : [],
                    true
                );

                if (profileStatus) {
                    profileStatus.textContent =
                        `Profil chargé. ${data.items_count} annonce(s) récupérée(s)…`;
                }
            } else if (eventName === "done") {
                receivedDone = true;

                const total = Number(data.items_count || 0);

                if (total === 0) {
                    renderItems([], false);

                    const grid = document.getElementById("items-grid");
                    const count = document.getElementById("items-count");

                    if (grid) grid.replaceChildren();
                    if (count) count.textContent = "Aucune annonce récupérée.";
                }

                if (profileStatus) {
                    let message = `Profil chargé. Collecte terminée : ${total} annonce(s).`;

                    if (data.items_limit_reached) {
                        message += " La limite configurée a été atteinte.";
                    }

                    if (data.warning) {
                        message += ` Attention : ${data.warning}`;
                    }

                    profileStatus.textContent = message;
                }
            } else if (eventName === "error") {
                throw new Error(
                    data.error || "Une erreur est survenue pendant la collecte."
                );
            }
        }

        try {
            while (true) {
                const { value, done } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const blocks = buffer.split(/\r?\n\r?\n/);
                buffer = blocks.pop() || "";

                for (const block of blocks) {
                    await handleEvent(block);
                }
            }

            buffer += decoder.decode();

            if (buffer.trim()) {
                await handleEvent(buffer);
            }

            if (!receivedProfile) {
                throw new Error(
                    "Aucune information de profil reçue du serveur."
                );
            }

            if (!receivedDone) {
                throw new Error(
                    "Le flux s'est terminé avant la fin de la collecte."
                );
            }
        } finally {
            reader.releaseLock();
        }
    }

    function renderItems(items, append = false) {
        const grid = document.getElementById("items-grid");
        const count = document.getElementById("items-count");

        if (!grid || !count) {
            console.error(
                "Zone d'annonces introuvable : vérifie #items-grid et #items-count dans profile.html."
            );
            return;
        }

        if (!append) {
            grid.replaceChildren();
        }

        if (!Array.isArray(items) || items.length === 0) {
            if (!append) {
                count.textContent = "Chargement des annonces…";
            }
            return;
        }

        const existingIds = new Set(
            [...grid.querySelectorAll(".item-card")].map(
                (card) => card.dataset.itemId
            )
        );

        const fragment = document.createDocumentFragment();

        for (const item of items) {
            const itemId = String(item.id ?? "");

            if (itemId && existingIds.has(itemId)) {
                continue;
            }

            const card = document.createElement("article");
            card.className = "item-card";

            if (itemId) {
                card.dataset.itemId = itemId;
                existingIds.add(itemId);
            }

            const link = document.createElement("a");
            link.className = "item-card-link";

            const itemUrl = item.url || item.item_url || "";

            if (itemUrl) {
                try {
                    const parsedUrl = new URL(
                        itemUrl,
                        "https://www.vinted.fr"
                    );

                    if (
                        parsedUrl.protocol === "https:" &&
                        (
                            parsedUrl.hostname === "vinted.fr" ||
                            parsedUrl.hostname.endsWith(".vinted.fr")
                        )
                    ) {
                        link.href = parsedUrl.href;
                        link.target = "_blank";
                        link.rel = "noopener noreferrer";
                    }
                } catch {
                    console.warn("URL d'annonce invalide :", itemUrl);
                }
            }

            const photo =
                item.photo ||
                item.image ||
                item.image_url ||
                "";

            const titleText =
                item.title ||
                item.name ||
                "Annonce Vinted";

            if (photo) {
                const image = document.createElement("img");
                image.className = "item-card-image";
                image.src = photo;
                image.alt = titleText;
                image.loading = "lazy";

                image.addEventListener(
                    "error",
                    () => {
                        image.hidden = true;
                    },
                    { once: true }
                );

                link.appendChild(image);
            }

            const content = document.createElement("div");
            content.className = "item-card-content";

            const title = document.createElement("h3");
            title.className = "item-card-title";
            title.textContent = titleText;

            const price = document.createElement("p");
            price.className = "item-card-price";
            price.textContent =
                item.price ||
                item.price_text ||
                "Prix indisponible";

            const stats = document.createElement("p");
            stats.className = "item-card-stats";

            stats.textContent =
                `${item.views ?? "—"} vues · ${item.favorites ?? "—"} favoris`;

            content.append(title, price, stats);
            link.appendChild(content);
            card.appendChild(link);
            fragment.appendChild(card);
        }

        grid.appendChild(fragment);

        count.textContent =
            `${grid.querySelectorAll(".item-card").length} annonce(s) récupérée(s).`;
    }

    renderRatingStars(null);

    if (profileStatus && !profileStatus.textContent.trim()) {
        profileStatus.textContent =
            "Renseigne un identifiant pour afficher un profil.";
    }

    if (profileForm) {
        profileForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const memberId = memberIdInput?.value.trim() ?? "";

            if (!/^\d{1,20}$/.test(memberId)) {
                displayError(
                    "Saisis un identifiant Vinted numérique valide."
                );
                memberIdInput?.focus();
                return;
            }

            // Interrompt la recherche précédente si elle existe.
            currentRequest?.abort();

            currentRequest = new AbortController();

            if (searchButton) {
                searchButton.disabled = true;
                searchButton.textContent = "Recherche…";
            }

            if (profileStatus) {
                profileStatus.textContent = "Ouverture du profil Vinted…";
            }

            const grid = document.getElementById("items-grid");
            const count = document.getElementById("items-count");

            if (grid) grid.replaceChildren();
            if (count) count.textContent = "En attente des annonces…";

            try {
                await fetchProfile(memberId, currentRequest.signal);
            } catch (error) {
                if (error?.name === "AbortError") {
                    return;
                }

                console.error(
                    "Erreur lors du chargement du profil :",
                    error
                );

                displayError(
                    error instanceof Error
                        ? error.message
                        : "Impossible de charger ce profil."
                );
            } finally {
                if (searchButton) {
                    searchButton.disabled = false;
                    searchButton.textContent = "Rechercher";
                }

                currentRequest = null;
            }
        });
    }
});
