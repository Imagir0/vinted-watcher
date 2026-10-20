import { $ } from "./api.js";

export async function loadStatuses() {
    const response = await fetch(
        `/data/statuses/statuses.json?t=${Date.now()}`,
        { cache: "no-store" }
    );

    if (!response.ok) {
        throw new Error("Impossible de charger les états.");
    }

    const statusData = await response.json();

    const picker = $("status_ids");
    const trigger = $("status_ids_trigger");
    const options = $("status_ids_options");

    if (!picker || !trigger || !options) {
        throw new Error(
            "Éléments HTML du sélecteur d'états introuvables."
        );
    }

    // État des objets disponibles, indexés par ID.
    const statuses = statusData
        .map(status => ({
            id: String(status.id ?? ""),
            label: String(status.label ?? status.id ?? ""),
            description: String(status.description ?? "")
        }))
        .filter(status => status.id && status.label);

    // Conserver les sélections dans une Map indexée par ID.
    const selectedStatuses = new Map();

    function getSelectedStatuses() {
        return Array.from(selectedStatuses.values());
    }

    function restoreSelectedStatuses() {
        selectedStatuses.clear();

        let savedStatuses = [];

        try {
            const parsed = JSON.parse(trigger.dataset.selectedStatuses || "[]");
            savedStatuses = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error(
                "Impossible de restaurer les états sélectionnés :",
                error
            );
        }

        // Le champ HTML sert de stockage pour les identifiants sélectionnés.
        const hiddenInput = $("selected_statuses");

        if (hiddenInput) {
            try {
                const parsed = JSON.parse(hiddenInput.value || "[]");
                if (Array.isArray(parsed)) {
                    savedStatuses = parsed;
                }
            } catch {
                // Garder les valeurs déjà restaurées si le JSON est invalide.
            }
        }

        for (const saved of savedStatuses) {
            const id = String(
                typeof saved === "object" && saved !== null
                    ? saved.id ?? ""
                    : saved
            );

            const match = statuses.find(status => status.id === id);

            if (match) {
                selectedStatuses.set(match.id, match);
            }
        }
    }

    function updateSelection() {
        const selected = getSelectedStatuses();

        const triggerLabel = trigger.querySelector("span");

        if (triggerLabel) {
            triggerLabel.textContent = selected.length === 0
                ? "Sélectionner un ou plusieurs états"
                : selected.length === 1
                    ? selected[0].label
                    : `${selected.length} états sélectionnés`;
        }

        // Mettre à jour le champ utilisé par le formulaire.
        const hiddenInput = $("selected_statuses");

        if (hiddenInput) {
            hiddenInput.value = JSON.stringify(
                selected.map(status => ({
                    id: status.id,
                    label: status.label
                }))
            );

            hiddenInput.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }

        renderOptions();
        renderSelectedStatuses();
    }

    function openPicker() {
        options.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
    }

    function closePicker() {
        options.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    function renderOptions() {
        options.replaceChildren();

        if (statuses.length === 0) {
            const empty = document.createElement("div");
            empty.className = "multi-select-empty";
            empty.textContent = "Aucun état disponible.";
            options.appendChild(empty);
            return;
        }

        for (const status of statuses) {
            const row = document.createElement("label");
            row.className = "multi-select-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = status.id;
            checkbox.checked = selectedStatuses.has(status.id);

            const content = document.createElement("span");
            content.className = "multi-select-option-content";

            const label = document.createElement("span");
            label.className = "multi-select-option-label";
            label.textContent = status.label;

            content.appendChild(label);

            if (status.description) {
                const description = document.createElement("span");
                description.className = "multi-select-option-description";
                description.textContent = status.description;
                content.appendChild(description);
            }

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selectedStatuses.set(status.id, status);
                } else {
                    selectedStatuses.delete(status.id);
                }

                updateSelection();
            });

            row.append(checkbox, content);
            options.appendChild(row);
        }
    }

    function renderSelectedStatuses() {
        let selectedList = $("selected-statuses-list");

        if (!selectedList) {
            selectedList = document.createElement("div");
            selectedList.id = "selected-statuses-list";
            selectedList.className = "selected-statuses-list";
            picker.appendChild(selectedList);
        }

        selectedList.replaceChildren();

        const selected = getSelectedStatuses();

        if (selected.length === 0) {
            const empty = document.createElement("span");
            empty.className = "selected-statuses-empty";
            empty.textContent = "Aucun état sélectionné";
            selectedList.appendChild(empty);
            return;
        }

        for (const status of selected) {
            const tag = document.createElement("span");
            tag.className = "selected-status-tag";

            const label = document.createElement("span");
            label.textContent = status.label;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "selected-status-remove";
            remove.textContent = "×";
            remove.setAttribute(
                "aria-label",
                `Retirer l'état ${status.label}`
            );

            remove.addEventListener("click", () => {
                selectedStatuses.delete(status.id);
                updateSelection();
            });

            tag.append(label, remove);
            selectedList.appendChild(tag);
        }
    }

    // Ouvrir ou fermer la liste.
    trigger.addEventListener("click", () => {
        if (options.hidden) {
            openPicker();
        } else {
            closePicker();
        }
    });

    // Fermer avec Échap.
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !options.hidden) {
            closePicker();
            trigger.focus();
        }
    });

    // Fermer en cliquant à l'extérieur.
    document.addEventListener("click", event => {
        if (
            !options.hidden &&
            event.target instanceof Node &&
            !picker.contains(event.target)
        ) {
            closePicker();
        }
    });

    // Permet au module principal de rafraîchir la sélection.
    window.refreshStatusPickerSelection = () => {
        restoreSelectedStatuses();
        updateSelection();
    };

    restoreSelectedStatuses();
    updateSelection();
}
