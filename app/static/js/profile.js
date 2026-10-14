
document.addEventListener("DOMContentLoaded", () => {
    const searchCard = document.getElementById("search-card");
    const profileCard = document.getElementById("profile-card");
    const itemsSection = document.getElementById("items-section");

    const profileForm = document.getElementById("profile-form");
    const memberIdInput = document.getElementById("member-id");
    const searchButton = document.getElementById("search-button");
    const changeMemberButton = document.getElementById("change-member-button");

    const searchStatus = document.getElementById("search-status");
    const profileStatus = document.getElementById("profile-status");
    const profileWarning = document.getElementById("profile-warning");
    const memberProfileIdLink = document.getElementById("member-profile-id-link");

    const memberName = document.getElementById("member-name");
    const memberIdLabel = document.getElementById("member-id-label");
    const memberBio = document.getElementById("member-bio");
    const memberAvatar = document.getElementById("member-avatar");

    const followersCount = document.getElementById("followers-count");
    const followingCount = document.getElementById("following-count");
    const ratingsCount = document.getElementById("ratings-count");
    const ratingAverage = document.getElementById("rating-average");
    const ratingStars = document.getElementById("rating-stars");

    const originalProfile = document.getElementById("original-profile");

    const itemsSearch = document.getElementById("items-search");
    const priceMinInput = document.getElementById("price-min");
    const priceMaxInput = document.getElementById("price-max");
    const priceMinValue = document.getElementById("price-min-value");
    const priceMaxValue = document.getElementById("price-max-value");
    
    const refreshItemsButton = document.getElementById("refresh-items-button");
    const itemsGrid = document.getElementById("items-grid");
    const itemsCount = document.getElementById("items-count");

    const lastMemberId = localStorage.getItem("vinted_last_member_id");

    const toastContainer = document.getElementById("toast-container");

    const PROFILE_CACHE_KEY = "vinted-profile-cache";
    const ITEMS_CACHE_KEY = "vinted-items-cache";

    let cachedItems = [];
    let currentRequest = null;
    let profileLoaded = false;
    let collectedItemCount = 0;

    function showToast(message, type = "success", duration = 4000) {
        if (!toastContainer) return;

        const toast = document.createElement("div");
        toast.className = `toast-notification ${type}`;
        toast.setAttribute("role", type === "error" ? "alert" : "status");
        toast.textContent = message;

        toastContainer.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => toast.remove(), duration);
        }
    }

    const RECENT_PROFILES_KEY = "vinted-recent-profiles";
    const MAX_RECENT_PROFILES = 10;

    const recentProfilesList = document.getElementById("recent-profiles-list");

    function getRecentProfiles() {
        try {
            const profiles = JSON.parse(
                localStorage.getItem(RECENT_PROFILES_KEY) || "[]"
            );

            return Array.isArray(profiles) ? profiles : [];
        } catch {
            return [];
        }
    }

    function saveRecentProfile(profile) {
        if (!profile?.id || !profile?.username) {
            return;
        }

        const profiles = getRecentProfiles().filter(
            item => String(item.id) !== String(profile.id)
        );

        profiles.unshift({
            id: String(profile.id),
            username: profile.username,
            photo: profile.photo || ""
        });

        try {
            localStorage.setItem(
                RECENT_PROFILES_KEY,
                JSON.stringify(profiles.slice(0, MAX_RECENT_PROFILES))
            );
        } catch (error) {
            console.error("Impossible d'enregistrer l'historique :", error);
        }

        renderRecentProfiles();
    }

    function renderRecentProfiles() {
        if (!recentProfilesList) {
            return;
        }

        const profiles = getRecentProfiles();
        recentProfilesList.replaceChildren();

        profiles.forEach(profile => {
            const card = document.createElement("div");
            card.className = "recent-profile-card";

            const selectButton = document.createElement("button");
            selectButton.type = "button";
            selectButton.className = "recent-profile-select";
            selectButton.setAttribute(
                "aria-label",
                `Rechercher ${profile.username}`
            );

            if (profile.photo) {
                const avatar = document.createElement("img");
                avatar.className = "recent-profile-avatar";
                avatar.src = profile.photo;
                avatar.alt = "";
                avatar.loading = "lazy";
                avatar.referrerPolicy = "no-referrer";
                selectButton.appendChild(avatar);
            }

            const name = document.createElement("span");
            name.className = "recent-profile-name";
            name.textContent = profile.username;
            selectButton.appendChild(name);

            selectButton.addEventListener("click", () => {
                memberIdInput.value = profile.id;
                profileForm.requestSubmit();
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "recent-profile-delete";
            deleteButton.textContent = "×";
            deleteButton.setAttribute(
                "aria-label",
                `Supprimer ${profile.username} de l'historique`
            );

            deleteButton.addEventListener("click", () => {
                const updatedProfiles = getRecentProfiles().filter(
                    item => String(item.id) !== String(profile.id)
                );

                localStorage.setItem(
                    RECENT_PROFILES_KEY,
                    JSON.stringify(updatedProfiles)
                );

                renderRecentProfiles();
            });

            card.append(selectButton, deleteButton);
            recentProfilesList.appendChild(card);
        });
    }
    renderRecentProfiles();


    // --------------------------------------------------
    // AFFICHAGE DES CARDS
    // --------------------------------------------------

    function showSearchCard() {
        searchCard.hidden = false;

        if (changeMemberButton) {
            changeMemberButton.setAttribute("aria-expanded", "true");
        }
    }

    function hideSearchCard() {
        searchCard.hidden = true;

        if (changeMemberButton) {
            changeMemberButton.setAttribute("aria-expanded", "false");
        }
    }

    function resetItems() {
        itemsGrid.replaceChildren();
        itemsCount.textContent = "Chargement des annonces…";
        collectedItemCount = 0;
    }

    function clearCache() {
        sessionStorage.removeItem(PROFILE_CACHE_KEY);
        sessionStorage.removeItem(ITEMS_CACHE_KEY);
        cachedItems = [];
    }

    function prepareNewSearch() {
        currentRequest?.abort();
        currentRequest = null;

        profileLoaded = false;

        profileCard.hidden = true;
        itemsSection.hidden = true;

        clearCache();
        resetItems();

        if (profileWarning) {
            profileWarning.hidden = true;
            profileWarning.textContent = "";
        }

        if (searchButton) {
            searchButton.disabled = false;
            searchButton.textContent = "Rechercher";
        }

        showSearchCard();

        searchStatus.textContent =
            "Renseigne un identifiant pour afficher un profil.";

        memberIdInput.focus();
    }

    if (changeMemberButton) {
        changeMemberButton.addEventListener("click", () => {
            changeMemberButton.hidden = true;
            prepareNewSearch();
        });
    }

    // --------------------------------------------------
    // ÉTOILES DE NOTATION
    // --------------------------------------------------

    function renderRatingStars(rating) {
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

            ratingStars.setAttribute(
                "aria-label",
                "Aucune note disponible"
            );

            ratingAverage.textContent = "Note indisponible";
            return;
        }

        const normalizedRating = Math.max(
            0,
            Math.min(5, parsedRating)
        );

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

        ratingStars.setAttribute(
            "aria-label",
            `Note moyenne : ${normalizedRating.toFixed(1)} sur 5`
        );

        ratingAverage.textContent =
            `${normalizedRating.toFixed(1)} / 5`;
    }

    // --------------------------------------------------
    // AFFICHAGE DU PROFIL
    // --------------------------------------------------

    function displayProfile(data) {
        memberName.textContent = data.username || "Profil Vinted";
        memberIdLabel.textContent = data.member_id ?? "—";

        memberBio.textContent =
            data.bio || "Aucune biographie renseignée.";

        followersCount.textContent = data.followers_count ?? "—";
        followingCount.textContent = data.following_count ?? "—";
        ratingsCount.textContent = data.ratings_count ?? "—";

        if (data.avatar) {
            memberAvatar.src = data.avatar;
            memberAvatar.hidden = false;
        } else {
            memberAvatar.removeAttribute("src");
            memberAvatar.hidden = true;
        }

        const profileUrl = data.profile_url || "";

        if (profileUrl) {
            try {
                const parsedUrl = new URL(
                    profileUrl,
                    "https://www.vinted.fr"
                );

                if (
                    parsedUrl.protocol === "https:" &&
                    (
                        parsedUrl.hostname === "vinted.fr" ||
                        parsedUrl.hostname.endsWith(".vinted.fr")
                    )
                ) {
                    originalProfile.href = parsedUrl.href;
                } else {
                    originalProfile.href = "https://www.vinted.fr/";
                }
            } catch {
                originalProfile.href = "https://www.vinted.fr/";
            }
        } else {
            originalProfile.href = "https://www.vinted.fr/";
        }

        if (memberProfileIdLink) {
            memberProfileIdLink.href = originalProfile.href;
        }

        renderRatingStars(data.rating_average);

        profileCard.hidden = false;
        itemsSection.hidden = false;
        hideSearchCard();

        profileLoaded = true;

        if (profileStatus) {
            profileStatus.textContent = "Utilisateur trouvé !";
        }

        saveRecentProfile({
            id: data.member_id,
            username: data.username,
            photo: data.avatar
        });

        if (changeMemberButton) {
            changeMemberButton.hidden = false;
        }
    }

    function displayError(message) {
        if (profileLoaded) {
            profileStatus.textContent = message;
        } else {
            searchStatus.textContent = message;
        }
    }

    // --------------------------------------------------
    // AFFICHAGE DES ANNONCES
    // --------------------------------------------------

    function parsePrice(value) {
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
        }

        if (typeof value !== "string" || !value.trim()) {
            return null;
        }

        // Extrait un prix comme "12,50 €" ou "12 €".
        const match = value.match(
            /\d[\d\s\u00a0\u202f]*(?:[,.]\d{1,2})?/
        );

        if (!match) {
            return null;
        }

        const normalized = match[0]
            .replace(/[\s\u00a0\u202f]/g, "")
            .replace(",", ".");

        const price = Number(normalized);

        return Number.isFinite(price) ? price : null;
    }

    function formatPrice(value) {
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: 2
        }).format(value);
    }

    
    function updatePriceControls(reset = false) {
        if (!priceMinInput || !priceMaxInput) return;

        const cards = [...itemsGrid.querySelectorAll(".item-card")];

        const prices = cards
            .map((card) => parsePrice(card.dataset.price))
            .filter((price) => price !== null);

        const highestPrice = prices.length
            ? Math.max(...prices)
            : 100;

        const newMax = Math.max(
            100,
            Math.ceil(highestPrice / 10) * 10
        );

        const oldMax = Number(priceMaxInput.max) || newMax;
        const oldMaxValue = Number(priceMaxInput.value);
        const wasUnrestricted = oldMaxValue >= oldMax;

        priceMinInput.min = "0";
        priceMaxInput.min = "0";
        priceMinInput.max = String(newMax);
        priceMaxInput.max = String(newMax);

        if (reset) {
            priceMinInput.value = "0";
            priceMaxInput.value = String(newMax);
        } else {
            priceMinInput.value = String(
                Math.min(Number(priceMinInput.value) || 0, newMax)
            );

            priceMaxInput.value = String(
                wasUnrestricted
                    ? newMax
                    : Math.min(oldMaxValue, newMax)
            );
        }

        if (Number(priceMinInput.value) > Number(priceMaxInput.value)) {
            priceMinInput.value = priceMaxInput.value;
        }

        priceMinValue.textContent = formatPrice(
            Number(priceMinInput.value)
        );

        priceMaxValue.textContent = formatPrice(
            Number(priceMaxInput.value)
        );

        updatePriceSliderVisual();
    }

    function updatePriceSliderVisual() {
        if (!priceMinInput || !priceMaxInput) return;

        const min = Number(priceMinInput.min);
        const max = Number(priceMinInput.max);
        const minValue = Number(priceMinInput.value);
        const maxValue = Number(priceMaxInput.value);
        const range = max - min || 1;

        const left = ((minValue - min) / range) * 100;
        const right = ((maxValue - min) / range) * 100;

        const selected = document.getElementById("price-range-selected");

        if (selected) {
            selected.style.left = `${left}%`;
            selected.style.width = `${right - left}%`;
        }

        priceMinValue.textContent = formatPrice(minValue);
        priceMaxValue.textContent = formatPrice(maxValue);
    }


    function renderItems(items, append = false) {
        if (!append) {
            itemsGrid.replaceChildren();
            collectedItemCount = 0;
        }

        if (!Array.isArray(items) || items.length === 0) {
            updatePriceControls(!append);
            filterItems();
            updateItemsCount();
            return;
        }

        const existingIds = new Set(
            [...itemsGrid.querySelectorAll(".item-card")]
                .map((card) => card.dataset.itemId)
                .filter(Boolean)
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

            // Prix numérique utilisé par les filtres.
            const rawPrice = item.price ?? item.price_text;
            const numericPrice = parsePrice(rawPrice);

            card.dataset.price = numericPrice === null
                ? ""
                : String(numericPrice);

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

            content.append(title, price, stats);
            link.appendChild(content);
            card.appendChild(link);
            fragment.appendChild(card);
        }

        itemsGrid.appendChild(fragment);

        collectedItemCount =
            itemsGrid.querySelectorAll(".item-card").length;

        updatePriceControls(!append);
        filterItems();
    }

    function filterItems() {
        if (!itemsSearch || !priceMinInput || !priceMaxInput) {
            return;
        }

        const query = itemsSearch.value
            .trim()
            .toLocaleLowerCase("fr");

        const minPrice = Number(priceMinInput.value);
        const maxPrice = Number(priceMaxInput.value);

        const priceFilterActive =
            minPrice > 0 ||
            maxPrice < Number(priceMaxInput.max);

        const cards = itemsGrid.querySelectorAll(".item-card");

        let visibleCount = 0;

        cards.forEach((card) => {
            const title = card
                .querySelector(".item-card-title")
                ?.textContent
                .toLocaleLowerCase("fr") || "";

            const price = parsePrice(card.dataset.price);

            const matchesTitle = title.includes(query);

            // Sans filtre de prix, les annonces sans prix restent visibles.
            const matchesPrice = price === null
                ? !priceFilterActive
                : price >= minPrice && price <= maxPrice;

            const matches = matchesTitle && matchesPrice;

            card.hidden = !matches;

            if (matches) {
                visibleCount++;
            }
        });

        if (query || priceFilterActive) {
            itemsCount.textContent =
                `${visibleCount} article(s) trouvé(s) sur ${cards.length}.`;
        } else {
            updateItemsCount();
        }
    }

    if (itemsSearch) {
        itemsSearch.addEventListener("input", filterItems);
    }

    function updateItemsCount() {
        collectedItemCount =
            itemsGrid.querySelectorAll(".item-card").length;

        if (collectedItemCount === 0) {
            itemsCount.textContent = "Chargement des annonces…";
        } else {
            itemsCount.textContent =
                `${collectedItemCount} annonce(s) récupérée(s).`;
        }
    }

    function finishItems(total) {
        const actualCount =
            itemsGrid.querySelectorAll(".item-card").length;

        if (total === 0 || actualCount === 0) {
            itemsGrid.replaceChildren();
            collectedItemCount = 0;
            itemsCount.textContent =
                "Aucune annonce disponible pour cet utilisateur.";
            return;
        }

        itemsCount.textContent =
            `${actualCount} annonce(s) récupérée(s).`;
    }

    // --------------------------------------------------
    // LECTURE DU FLUX SSE FASTAPI
    // --------------------------------------------------

    async function fetchProfile(memberId, signal, options = {}) {
        const refreshOnly = options.refreshOnly === true;
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
            let message =
                `Erreur du serveur (${response.status}).`;

            try {
                const data = await response.json();
                message = data.detail || data.error || message;
            } catch {
                // La réponse n'est pas nécessairement du JSON.
            }

            throw new Error(message);
        }

        if (!response.body) {
            throw new Error(
                "Le navigateur ne permet pas de lire le flux."
            );
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

            if (dataLines.length === 0) {
                return;
            }

            let data;

            try {
                data = JSON.parse(dataLines.join("\n"));
            } catch {
                throw new Error(
                    "Le serveur a transmis un événement invalide."
                );
            }

            if (eventName === "profile") {
                if (refreshOnly) {
                    showToast("Rafraichissement des articles en cours…", "loading");
                    receivedProfile = true;
                    return;
                }

                sessionStorage.setItem(
                    PROFILE_CACHE_KEY,
                    JSON.stringify(data)
                );

                cachedItems = [];
                sessionStorage.removeItem(ITEMS_CACHE_KEY);

                displayProfile(data);
                resetItems();

                receivedProfile = true;

                profileStatus.textContent =
                    "Profil chargé. Chargement des annonces…";

                showToast("Profil chargé avec succès !", "success");
                showToast("Recherche des annonces en cours…", "loading");
            } else if (eventName === "items") {
                if (!receivedProfile) {
                    throw new Error(
                        "Les annonces ont été reçues avant le profil."
                    );
                }

                const newItems = Array.isArray(data.items)
                    ? data.items
                    : [];

                if (refreshOnly && cachedItems.length === 0) {
                    itemsGrid.replaceChildren();
                }

                cachedItems.push(...newItems);

                renderItems(newItems, true);

                sessionStorage.setItem(
                    ITEMS_CACHE_KEY,
                    JSON.stringify(cachedItems)
                );

                const total = Number(
                    data.items_count ?? collectedItemCount
                );

                itemsCount.textContent =
                    `${collectedItemCount} annonce(s) récupérée(s)…`;
            } else if (eventName === "done") {
                receivedDone = true;

                const total = Number(data.items_count || 0);

                finishItems(total);

                let message =
                    `Profil chargé. Collecte terminée : ${total} annonce(s).`;

                if (data.items_limit_reached) {
                    message += " La limite configurée a été atteinte.";
                }

                if (data.warning) {
                    message += ` Attention : ${data.warning}`;
                }

                profileStatus.textContent = message;

                if (data.warning && profileWarning) {
                    profileWarning.textContent = data.warning;
                    profileWarning.hidden = false;
                }

                if (!refreshOnly) {
                    showToast(
                        "Annonces chargées avec succès !",
                        "success"
                    );
                }

            } else if (eventName === "error") {
                throw new Error(
                    data.error ||
                    "Une erreur est survenue pendant la collecte."
                );
            }
        }

        try {
            while (true) {
                const { value, done } = await reader.read();

                if (done) {
                    break;
                }

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

    if (refreshItemsButton) {
        refreshItemsButton.addEventListener("click", async () => {
            const memberId = memberIdInput.value.trim();

            if (!/^\d{1,20}$/.test(memberId)) {
                showToast(
                    "Identifiant utilisateur invalide.",
                    "error"
                );
                return;
            }

            currentRequest?.abort();

            const controller = new AbortController();
            currentRequest = controller;

            refreshItemsButton.disabled = true;
            refreshItemsButton.textContent = "Rafraîchissement…";

            // Conserve le profil affiché, mais remplace les annonces.
            cachedItems = [];
            sessionStorage.removeItem(ITEMS_CACHE_KEY);
            resetItems();

            itemsCount.textContent =
                "Actualisation des annonces en cours…";

            try {
                await fetchProfile(memberId, controller.signal, {
                    refreshOnly: true,
                });

                showToast(
                    "Annonces rafraîchies avec succès !",
                    "success"
                );
            } catch (error) {
                if (error?.name === "AbortError") {
                    return;
                }

                console.error("Erreur de rafraîchissement :", error);

                showToast(
                    error instanceof Error
                        ? error.message
                        : "Impossible de rafraîchir les annonces.",
                    "error"
                );
            } finally {
                if (currentRequest === controller) {
                    currentRequest = null;
                    refreshItemsButton.disabled = false;
                    refreshItemsButton.innerHTML =
                        '<span aria-hidden="true">↻</span>' +
                        '<span class="button-label">Rafraîchir</span>';
                }
            }
        });
    }

    // --------------------------------------------------
    // RECHERCHE
    // --------------------------------------------------

    profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const memberId = memberIdInput.value.trim();

        if (!/^\d{1,20}$/.test(memberId)) {
            const message =
                "Saisis un identifiant Vinted numérique valide.";

            searchStatus.textContent = message;
            showToast(message, "error");

            memberIdInput.focus();
            return;
        }

        // Interrompt une éventuelle recherche précédente.
        currentRequest?.abort();

        const controller = new AbortController();
        currentRequest = controller;

        profileLoaded = false;

        profileCard.hidden = true;
        itemsSection.hidden = true;

        if (profileWarning) {
            profileWarning.hidden = true;
            profileWarning.textContent = "";
        }

        // Évite de restaurer les données de l'ancien utilisateur.
        clearCache();
        resetItems();
        showSearchCard();

        const loadingMessage = "Recherche du profil en cours…";

        searchStatus.textContent = loadingMessage;
        showToast(loadingMessage, "loading");

        if (searchButton) {
            searchButton.disabled = true;
            searchButton.textContent = "Recherche…";
        }

        try {
            await fetchProfile(memberId, controller.signal);

            localStorage.setItem(
                "vinted_last_member_id",
                memberId
            );

        } catch (error) {
            if (error?.name === "AbortError") {
                return;
            }

            console.error(
                "Erreur lors du chargement du profil :",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Impossible de charger ce profil.";

            displayError(message);
            showToast(message, "error");

        } finally {
            // Une ancienne requête ne doit pas modifier
            // les contrôles d'une recherche plus récente.
            if (currentRequest === controller) {
                currentRequest = null;

                if (searchButton) {
                    searchButton.disabled = false;
                    searchButton.textContent = "Rechercher";
                }
            }
        }
    });

    // --------------------------------------------------
    // INITIALISATION ET RESTAURATION DU CACHE
    // --------------------------------------------------

    renderRatingStars(null);

    searchCard.hidden = false;
    profileCard.hidden = true;
    itemsSection.hidden = true;

    // Préremplit le dernier identifiant sans déclencher de recherche.
    if (lastMemberId && /^\d{1,20}$/.test(lastMemberId)) {
        memberIdInput.value = lastMemberId;
    }

    const savedProfile = sessionStorage.getItem(PROFILE_CACHE_KEY);
    const savedItems = sessionStorage.getItem(ITEMS_CACHE_KEY);

    if (savedProfile) {
        try {
            const profileData = JSON.parse(savedProfile);
            const itemsData = savedItems
                ? JSON.parse(savedItems)
                : [];

            if (
                !profileData ||
                typeof profileData !== "object" ||
                !Array.isArray(itemsData)
            ) {
                throw new Error("Cache invalide.");
            }

            const cachedMemberId =
                profileData.member_id ??
                lastMemberId ??
                "";

            if (/^\d{1,20}$/.test(String(cachedMemberId))) {
                memberIdInput.value = String(cachedMemberId);
            }

            // Restaure le profil sans appeler fetchProfile().
            displayProfile(profileData);

            // Restaure les annonces enregistrées.
            cachedItems = itemsData;
            resetItems();
            renderItems(cachedItems, true);

            if (cachedItems.length === 0) {
                itemsCount.textContent =
                    "Aucune annonce enregistrée dans le cache.";
            } else {
                finishItems(cachedItems.length);
            }

            searchCard.hidden = true;
            profileCard.hidden = false;
            itemsSection.hidden = false;

            if (changeMemberButton) {
                changeMemberButton.hidden = false;
            }

            profileStatus.textContent =
                "Données restaurées depuis le cache local.";

        } catch (error) {
            console.error(
                "Erreur lors de la restauration du cache :",
                error
            );

            clearCache();

            searchCard.hidden = false;
            profileCard.hidden = true;
            itemsSection.hidden = true;
        }
    }

    if (itemsSearch) {
        itemsSearch.addEventListener("input", filterItems);
    }

    function handlePriceChange(changedInput) {
        const minValue = Number(priceMinInput.value);
        const maxValue = Number(priceMaxInput.value);

        if (minValue > maxValue) {
            if (changedInput === priceMinInput) {
                priceMaxInput.value = priceMinInput.value;
            } else {
                priceMinInput.value = priceMaxInput.value;
            }
        }

        updatePriceSliderVisual();
        filterItems();
    }

    if (priceMinInput && priceMaxInput) {
        priceMinInput.addEventListener("input", () => {
            handlePriceChange(priceMinInput);
        });

        priceMaxInput.addEventListener("input", () => {
            handlePriceChange(priceMaxInput);
        });
    }
});
