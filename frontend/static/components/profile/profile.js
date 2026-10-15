
import { fetchProfileStream } from "./profile-api.js";
import { createNotifications } from "./notifications.js";
import { createRecentProfiles } from "./recent-profiles.js";
import { createProfileInfo } from "./profile-info.js";
import { createProfileItems } from "./profile-items.js";
import { createItemsFilters } from "./items-filters.js";
import { createProfileCache } from "./profile-cache.js";

document.addEventListener("DOMContentLoaded", () => {
    // --------------------------------------------------
    // ÉLÉMENTS HTML
    // --------------------------------------------------

    const searchCard = document.getElementById("search-card");
    const profileCard = document.getElementById("profile-card");
    const itemsSection = document.getElementById("items-section");

    const profileForm = document.getElementById("profile-form");
    const memberIdInput = document.getElementById("member-id");
    const searchButton = document.getElementById("search-button");
    const changeMemberButton = document.getElementById("change-member-button");
    const refreshItemsButton = document.getElementById("refresh-items-button");

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

    const recentProfilesList = document.getElementById("recent-profiles-list");
    const toastContainer = document.getElementById("toast-container");

    const itemsSearch = document.getElementById("items-search");
    const priceMinInput = document.getElementById("price-min");
    const priceMaxInput = document.getElementById("price-max");
    const priceMinValue = document.getElementById("price-min-value");
    const priceMaxValue = document.getElementById("price-max-value");

    const itemsGrid = document.getElementById("items-grid");
    const itemsCount = document.getElementById("items-count");

    // --------------------------------------------------
    // ÉTAT DU CONTRÔLEUR
    // --------------------------------------------------

    let cachedItems = [];
    let currentRequest = null;
    let profileLoaded = false;

    // --------------------------------------------------
    // INITIALISATION DES MODULES
    // --------------------------------------------------

    const { showToast } = createNotifications(toastContainer);

    const recentProfiles = createRecentProfiles({
        recentProfilesList,
        memberIdInput,
        profileForm
    });

    const { saveRecentProfile, renderRecentProfiles } = recentProfiles;

    const profileInfo = createProfileInfo({
        profileCard,
        searchCard,
        itemsSection,
        profileStatus,
        profileWarning,
        memberProfileIdLink,
        memberName,
        memberIdLabel,
        memberBio,
        memberAvatar,
        followersCount,
        followingCount,
        ratingsCount,
        ratingAverage,
        ratingStars,
        originalProfile,
        changeMemberButton
    });

    const { displayProfile } = profileInfo;

    const profileItems = createProfileItems({
        itemsGrid,
        itemsCount
    });

    const {
        renderItems,
        resetItems,
        finishItems
    } = profileItems;

    const profileCache = createProfileCache();

    createItemsFilters({
        itemsSearch,
        priceMinInput,
        priceMaxInput,
        priceMinValue,
        priceMaxValue,
        itemsCount,
        getItems: () => cachedItems,
        renderItems: (items, isNewBatch = false) => {
            renderItems(items, isNewBatch);
        }
    });

    // --------------------------------------------------
    // UTILITAIRES DU CONTRÔLEUR
    // --------------------------------------------------

    function clearCache() {
        profileCache.clear();
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

        searchCard.hidden = false;

        if (changeMemberButton) {
            changeMemberButton.setAttribute("aria-expanded", "true");
            memberIdInput.value = "";
        }

        searchStatus.textContent =
            "Renseigne un identifiant pour afficher un profil.";

        memberIdInput.focus();
    }

    function handleProfileError(message) {
        if (profileLoaded) {
            profileStatus.textContent = message;
        } else {
            searchStatus.textContent = message;
        }
    }

    // --------------------------------------------------
    // CHARGEMENT DU PROFIL ET DES ANNONCES
    // --------------------------------------------------

    async function fetchProfile(memberId, signal, options = {}) {
        const refreshOnly = options.refreshOnly === true;

        let receivedProfile = false;
        let receivedDone = false;

        await fetchProfileStream(memberId, {
            signal,

            onProfile(data) {
                // Lors d'un rafraîchissement, on conserve le profil affiché.
                if (refreshOnly) {
                    receivedProfile = true;

                    showToast(
                        "Rafraîchissement des annonces en cours…",
                        "loading"
                    );

                    return;
                }

                profileCache.setProfile(data);
                profileCache.setItems([]);

                cachedItems = [];

                displayProfile(data);

                saveRecentProfile({
                    id: data.member_id,
                    username: data.username,
                    photo: data.avatar
                });

                resetItems();

                receivedProfile = true;
                profileLoaded = true;

                profileStatus.textContent =
                    "Profil chargé. Chargement des annonces…";

                showToast("Profil chargé avec succès !", "success");
                showToast("Recherche des annonces en cours…", "loading");
            },

            onItems(data) {
                if (!receivedProfile) {
                    throw new Error(
                        "Les annonces ont été reçues avant le profil."
                    );
                }

                const newItems = Array.isArray(data.items)
                    ? data.items
                    : [];

                cachedItems.push(...newItems);

                renderItems(newItems, true);
                profileCache.setItems(cachedItems);
            },

            onDone(data) {
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
            },

            onError(error) {
                throw error;
            }
        });

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
    }

    // --------------------------------------------------
    // CHANGEMENT DE PROFIL
    // --------------------------------------------------

    if (changeMemberButton) {
        changeMemberButton.addEventListener("click", () => {
            changeMemberButton.hidden = true;
            prepareNewSearch();
        });
    }

    // --------------------------------------------------
    // RECHERCHE D'UN PROFIL
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

        clearCache();
        resetItems();

        searchCard.hidden = false;

        searchStatus.textContent = "Recherche du profil en cours…";

        showToast("Recherche du profil en cours…", "loading");

        if (searchButton) {
            searchButton.disabled = true;
            searchButton.textContent = "Recherche…";
        }

        try {
            await fetchProfile(memberId, controller.signal);

            localStorage.setItem("vinted_last_member_id", memberId);
        } catch (error) {
            if (error?.name === "AbortError") {
                return;
            }

            console.error("Erreur lors du chargement du profil :", error);

            const message = error instanceof Error
                ? error.message
                : "Impossible de charger ce profil.";

            handleProfileError(message);
            showToast(message, "error");
        } finally {
            // Une ancienne requête ne doit pas modifier la nouvelle recherche.
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
    // RAFRAÎCHISSEMENT DES ANNONCES
    // --------------------------------------------------

    if (refreshItemsButton) {
        refreshItemsButton.addEventListener("click", async () => {
            const memberId = memberIdInput.value.trim();

            if (!/^\d{1,20}$/.test(memberId)) {
                showToast("Identifiant utilisateur invalide.", "error");
                return;
            }

            currentRequest?.abort();

            const controller = new AbortController();
            currentRequest = controller;

            refreshItemsButton.disabled = true;
            refreshItemsButton.textContent = "Rafraîchissement…";

            cachedItems = [];
            profileCache.setItems([]);
            resetItems();

            itemsCount.textContent =
                "Actualisation des annonces en cours…";

            try {
                await fetchProfile(memberId, controller.signal, {
                    refreshOnly: true
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
    // INITIALISATION DE L'INTERFACE
    // --------------------------------------------------

    renderRecentProfiles();

    searchCard.hidden = false;
    profileCard.hidden = true;
    itemsSection.hidden = true;

    if (changeMemberButton) {
        changeMemberButton.hidden = true;
    }

    // --------------------------------------------------
    // RESTAURATION DU CACHE
    // --------------------------------------------------

    const savedProfile = profileCache.getProfile();

    if (savedProfile) {
        try {
            const savedItems = profileCache.getItems();

            if (
                typeof savedProfile !== "object" ||
                Array.isArray(savedProfile)
            ) {
                throw new Error("Cache du profil invalide.");
            }

            displayProfile(savedProfile);

            saveRecentProfile({
                id: savedProfile.member_id,
                username: savedProfile.username,
                photo: savedProfile.avatar
            });

            cachedItems = savedItems;

            resetItems();
            renderItems(cachedItems, true);

            if (cachedItems.length === 0) {
                itemsCount.textContent =
                    "Aucune annonce enregistrée dans le cache.";
            } else {
                finishItems(cachedItems.length);
            }

            profileLoaded = true;

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
});
