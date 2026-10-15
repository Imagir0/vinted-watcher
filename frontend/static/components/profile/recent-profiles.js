const RECENT_PROFILES_KEY = "vinted-recent-profiles";
const MAX_RECENT_PROFILES = 10;

export function createRecentProfiles({
    recentProfilesList,
    memberIdInput,
    profileForm
}) {
    function getRecentProfiles() {
        try {
            const profiles = JSON.parse(
                localStorage.getItem(RECENT_PROFILES_KEY) || "[]"
            );

            return Array.isArray(profiles) ? profiles : [];
        } catch (error) {
            console.error(
                "Impossible de lire l'historique des profils :",
                error
            );

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
                JSON.stringify(
                    profiles.slice(0, MAX_RECENT_PROFILES)
                )
            );
        } catch (error) {
            console.error(
                "Impossible d'enregistrer l'historique des profils :",
                error
            );
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

            // Bouton de sélection du profil
            const selectButton = document.createElement("button");
            selectButton.type = "button";
            selectButton.className = "recent-profile-select";
            selectButton.setAttribute(
                "aria-label",
                `Rechercher ${profile.username}`
            );

            // Photo de profil
            if (profile.photo) {
                const avatar = document.createElement("img");

                avatar.className = "recent-profile-avatar";
                avatar.src = profile.photo;
                avatar.alt = "";
                avatar.loading = "lazy";
                avatar.referrerPolicy = "no-referrer";

                selectButton.appendChild(avatar);
            }

            // Nom du profil
            const name = document.createElement("span");

            name.className = "recent-profile-name";
            name.textContent = profile.username;

            selectButton.appendChild(name);

            // Charger le profil sélectionné
            selectButton.addEventListener("click", () => {
                if (!memberIdInput || !profileForm) {
                    return;
                }

                memberIdInput.value = profile.id;
                profileForm.requestSubmit();
            });

            // Bouton de suppression
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

                try {
                    localStorage.setItem(
                        RECENT_PROFILES_KEY,
                        JSON.stringify(updatedProfiles)
                    );
                } catch (error) {
                    console.error(
                        "Impossible de supprimer le profil de l'historique :",
                        error
                    );

                    return;
                }

                renderRecentProfiles();
            });

            card.append(selectButton, deleteButton);
            recentProfilesList.appendChild(card);
        });
    }

    return {
        getRecentProfiles,
        saveRecentProfile,
        renderRecentProfiles
    };
}
