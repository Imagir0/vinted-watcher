import { $ } from "./api.js";

export async function loadSizes() {
    const response = await fetch(
        `/data/sizes/sizes.json?t=${Date.now()}`,
        { cache: "no-store" }
    );

    if (!response.ok) {
        throw new Error("Impossible de charger les tailles.");
    }

    const sizeData = await response.json();

    const input = $("selected_sizes");
    const trigger = $("size-picker-trigger");
    const selection = $("size-picker-selection");
    const panel = $("size-picker-panel");
    const title = $("size-picker-title");
    const back = $("size-picker-back");
    const close = $("size-picker-close");
    const list = $("size-picker-list");
    const picker = $("size-picker");
    const selectedSizesList = $("selected-sizes-list");
    const selectedSizesInput = $("selected_sizes");

    if (
        !input ||
        !trigger ||
        !selection ||
        !panel ||
        !title ||
        !back ||
        !close ||
        !list ||
        !picker
    ) {
        throw new Error(
            "Éléments HTML du sélecteur de tailles introuvables."
        );
    }

    // Navigation : catégories -> sections -> tailles.
    const parents = [];
    let currentCategory = null;
    let currentSection = null;

    // Map pour conserver les sélections pendant la navigation.
    // La clé composée évite les collisions entre catégories.
    const selectedSizes = new Map();

    const categories = Object.keys(sizeData);

    function getSizeKey(category, section, option) {
        return `${category}::${section}::${option.id}`;
    }

    function getSelectedSizes() {
        return Array.from(selectedSizes.values());
    }

    function restoreSelectedSizes() {
        selectedSizes.clear();

        let savedSizes = [];

        try {
            savedSizes = JSON.parse(input.value || "[]");
        } catch (error) {
            console.error("Impossible de restaurer les tailles :", error);
        }

        if (!Array.isArray(savedSizes)) {
            return;
        }

        // Indexer toutes les tailles disponibles dans le fichier JSON.
        const sizesById = new Map();

        for (const [category, sections] of Object.entries(sizeData)) {
            for (const [section, options] of Object.entries(sections || {})) {
                if (!Array.isArray(options)) {
                    continue;
                }

                for (const option of options) {
                    const id = String(option.id ?? "");

                    if (!id) {
                        continue;
                    }

                    // Un même ID peut éventuellement exister dans plusieurs sections.
                    if (!sizesById.has(id)) {
                        sizesById.set(id, []);
                    }

                    sizesById.get(id).push({
                        category,
                        section,
                        id,
                        label: String(option.label ?? id)
                    });
                }
            }
        }

        for (const saved of savedSizes) {
            const id = String(
                typeof saved === "object" && saved !== null
                    ? saved.id ?? ""
                    : saved
            );

            if (!id) {
                continue;
            }

            const matches = sizesById.get(id) || [];

            // Si les métadonnées ont été sauvegardées, les utiliser pour
            // retrouver la bonne taille lorsque plusieurs sections partagent un ID.
            const match = matches.find(size =>
                size.category === saved.category &&
                size.section === saved.section
            ) || matches[0];

            if (match) {
                const key = getSizeKey(
                    match.category,
                    match.section,
                    match
                );

                selectedSizes.set(key, match);
            }
        }
    }

    function updateSelectionLabel() {
        const selected = getSelectedSizes();

        if (selected.length === 0) {
            selection.textContent = "Toutes les tailles";
        } else if (selected.length === 1) {
            selection.textContent = selected[0].label;
        } else {
            selection.textContent = `${selected.length} tailles sélectionnées`;
        }

        // Conserver les objets sélectionnés pour le formulaire.
        input.value = JSON.stringify(selected);

        // Afficher les tailles sélectionnées sous le sélecteur.
        renderSelectedSizes(selected);
    }

    function openPicker() {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
    }

    function closePicker() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    function getCategorySelectionCount(category) {
        return getSelectedSizes().filter(
            size => size.category === category
        ).length;
    }

    function getSectionSelectionCount(category, section) {
        return getSelectedSizes().filter(
            size =>
                size.category === category &&
                size.section === section
        ).length;
    }

    function createRow(labelText, detailText = "", className = "") {
        const row = document.createElement("button");

        row.type = "button";
        row.className = "size-picker-item";

        if (className) {
            row.classList.add(className);
        }

        const label = document.createElement("span");
        label.className = "size-picker-item-label";
        label.textContent = labelText;

        row.appendChild(label);

        if (detailText) {
            const detail = document.createElement("span");
            detail.className = "size-picker-item-detail";
            detail.textContent = detailText;
            row.appendChild(detail);
        }

        return row;
    }

    function renderEmptyMessage(message) {
        const empty = document.createElement("div");

        empty.className = "size-picker-empty";
        empty.textContent = message;

        list.appendChild(empty);
    }

    function renderCategories() {
        currentCategory = null;
        currentSection = null;

        title.textContent = "Toutes les tailles";
        back.hidden = parents.length === 0;

        list.replaceChildren();

        for (const category of categories) {
            const sections = sizeData[category] || {};

            const availableSections = Object.entries(sections)
                .filter(
                    ([, options]) =>
                        Array.isArray(options) &&
                        options.length > 0
                );

            if (availableSections.length === 0) {
                continue;
            }

            const row = createRow(
                category,
                `${getCategorySelectionCount(category)} sélection(s)`,
                "size-picker-item--navigation"
            );

            const arrow = document.createElement("span");
            arrow.textContent = "›";
            arrow.setAttribute("aria-hidden", "true");
            row.appendChild(arrow);

            row.addEventListener("click", (event) => {
                event.stopPropagation();

                parents.push({
                    category: currentCategory,
                    section: currentSection
                });

                currentCategory = category;
                currentSection = null;

                renderSections();
                list.scrollTop = 0;
            });

            list.appendChild(row);
        }

        if (list.childElementCount === 0) {
            renderEmptyMessage("Aucune taille disponible.");
        }
    }

    function renderSections() {
        currentSection = null;

        title.textContent = currentCategory;
        back.hidden = parents.length === 0;

        list.replaceChildren();

        const sections = sizeData[currentCategory] || {};

        for (const [section, options] of Object.entries(sections)) {
            if (!Array.isArray(options) || options.length === 0) {
                continue;
            }

            const row = createRow(
                section,
                `${getSectionSelectionCount(
                    currentCategory,
                    section
                )} sélection(s)`,
                "size-picker-item--navigation"
            );

            const arrow = document.createElement("span");
            arrow.textContent = "›";
            arrow.setAttribute("aria-hidden", "true");
            row.appendChild(arrow);

            row.addEventListener("click", (event) => {
                event.stopPropagation();

                parents.push({
                    category: currentCategory,
                    section: currentSection
                });

                currentSection = section;

                renderSizes();
                list.scrollTop = 0;
            });

            list.appendChild(row);
        }

        if (list.childElementCount === 0) {
            renderEmptyMessage("Aucune sous-section disponible.");
        }
    }

    function renderSizes() {
        title.textContent = currentSection;
        back.hidden = parents.length === 0;

        list.replaceChildren();

        const options =
            sizeData[currentCategory]?.[currentSection] || [];

        for (const option of options) {
            const id = String(option.id ?? "");
            const labelText = String(option.label ?? id);

            const key = getSizeKey(
                currentCategory,
                currentSection,
                { id }
            );

            const row = document.createElement("label");
            row.className = "size-picker-item";

            row.addEventListener("click", event => {
                event.stopPropagation();
            });

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = selectedSizes.has(key);

            const label = document.createElement("span");
            label.className = "size-picker-item-label";
            label.textContent = labelText;

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selectedSizes.set(key, {
                        category: currentCategory,
                        section: currentSection,
                        id,
                        label: labelText
                    });
                } else {
                    selectedSizes.delete(key);
                }

                updateSelectionLabel();
            });

            row.append(checkbox, label);
            list.appendChild(row);
        }

        if (list.childElementCount === 0) {
            renderEmptyMessage("Aucune taille disponible.");
        }
    }

    function goBack() {
        if (parents.length === 0) {
            return;
        }

        const previous = parents.pop();

        currentCategory = previous.category;
        currentSection = previous.section;

        if (currentCategory === null) {
            renderCategories();
        } else if (currentSection === null) {
            renderSections();
        } else {
            renderSizes();
        }

        list.scrollTop = 0;
    }

    trigger.addEventListener("click", () => {
        if (panel.hidden) {
            parents.length = 0;
            renderCategories();
            openPicker();
        } else {
            closePicker();
        }
    });

    back.addEventListener("click", goBack);
    close.addEventListener("click", closePicker);

    // Fermer avec Échap.
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) {
            closePicker();
            trigger.focus();
        }
    });

    // Fermer uniquement si le clic est hors du sélecteur.
    document.addEventListener("click", event => {
        if (
            !panel.hidden &&
            event.target instanceof Node &&
            !picker.contains(event.target)
        ) {
            closePicker();
        }
    });

    // Permet aux autres modules de rafraîchir le libellé.
    window.refreshSizePickerSelection = () => {
        restoreSelectedSizes();
        updateSelectionLabel();
    };

    // Restaurer les sélections présentes dans le champ caché.
    restoreSelectedSizes();

    // Mettre à jour le libellé, les étiquettes et le menu.
    updateSelectionLabel();
    renderCategories();

    function renderSelectedSizes(selected) {
        if (!selectedSizesList) {
            return;
        }

        selectedSizesList.replaceChildren();

        if (selected.length === 0) {
            const empty = document.createElement("span");
            empty.className = "selected-sizes-empty";
            empty.textContent = "Aucune taille sélectionnée";
            selectedSizesList.append(empty);
            return;
        }

        for (const size of selected) {
            const tag = document.createElement("span");
            tag.className = "selected-size-tag";

            const label = document.createElement("span");
            label.textContent = `${size.category} · ${size.section} : ${size.label}`;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "selected-size-remove";
            remove.textContent = "×";
            remove.setAttribute(
                "aria-label",
                `Retirer la taille ${size.label}`
            );

            remove.addEventListener("click", () => {
                const key = getSizeKey(size.category, size.section, size);
                selectedSizes.delete(key);
                updateSelectionLabel();

                // Actualiser les compteurs du menu si celui-ci est ouvert.
                if (!panel.hidden) {
                    if (currentCategory === null) {
                        renderCategories();
                    } else if (currentSection === null) {
                        renderSections();
                    } else {
                        renderSizes();
                    }
                }
            });

            tag.append(label, remove);
            selectedSizesList.append(tag);
        }
    }
}
