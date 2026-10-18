import { $ } from "./api.js";

export function currentQuery() {
    const query = {
        search_text: $("search_text").value.trim(),
        order: $("order").value
    };

    const brand = $("brand_id").value.trim();
    const catalog = $("catalog_id").value.trim();
    const priceFrom = $("price_from").value;
    const priceTo = $("price_to").value;
    const sizes = $("size_ids").value.trim();
    const statuses = $("status_ids").value.trim();

    if (brand) {
        query["attribute_ids[brand]"] = brand;
    }

    if (catalog) {
        query["attribute_ids[catalog]"] = catalog;
    }

    if (priceFrom !== "") {
        query.price_from = priceFrom;
    }

    if (priceTo !== "") {
        query.price_to = priceTo;
    }

    if (sizes) {
        query.size_ids = sizes;
    }

    if (statuses) {
        query.status_ids = statuses;
    }

    return query;
}

export function loadConfigIntoForm(cfg) {
    const query = (cfg.queries && cfg.queries[0]) || {};

    $("search_text").value = query.search_text || "";
    $("order").value = query.order || "newest_first";
    $("brand_id").value = query["attribute_ids[brand]"] || "";
    $("catalog_id").value = query["attribute_ids[catalog]"] || "";
    $("price_from").value = query.price_from || "";
    $("price_to").value = query.price_to || "";
    $("size_ids").value = query.size_ids || "";
    $("status_ids").value = query.status_ids || "";
    $("pages").value = cfg.pages ?? 2;
    $("interval_seconds").value = cfg.interval_seconds ?? 300;
    
    window.refreshCategoryPickerSelection?.();

    $("excluded_keywords").value =
        (cfg.excluded_keywords || []).join("\n");

    $("stat-pages").textContent =
        `${cfg.pages ?? 2} page(s) par recherche · ` +
        `intervalle ${cfg.interval_seconds ?? 300} s`;
}


export async function loadCategories() {
    const response = await fetch(
        `/data/categories/categories.json?t=${Date.now()}`,
        { cache: "no-store" }
    );

    if (!response.ok) {
        throw new Error("Impossible de charger les catégories.");
    }

    const categories = await response.json();

    const root = {
        id: null,
        label: "Toutes les catégories",
        children: categories
    };

    const input = $("catalog_id");
    const trigger = $("category-picker-trigger");
    const selection = $("category-picker-selection");
    const panel = $("category-picker-panel");
    const title = $("category-picker-title");
    const back = $("category-picker-back");
    const close = $("category-picker-close");
    const list = $("category-picker-list");
    const picker = $("category-picker");

    const parents = [];
    let current = root;

    function findCategory(id, items = categories) {
        for (const item of items) {
            if (String(item.id) === String(id)) {
                return item;
            }

            const found = findCategory(id, item.children || []);

            if (found) return found;
        }

        return null;
    }

    function findCategoryParent(id, items, parent = null) {
        for (const item of items) {
            if (String(item.id) === String(id)) {
                return parent;
            }

            const found = findCategoryParent(
                id,
                item.children || [],
                item
            );

            if (found) return found;
        }

        return null;
    }

    function getPath(category) {
        const path = [];
        let target = category;

        while (target && target.id !== null) {
            path.unshift(target.label);
            target = findCategoryParent(target.id, categories);
        }

        return path;
    }

    function updateSelectionLabel() {
        const id = input.value;

        if (!id) {
            selection.textContent = "Toutes les catégories";
            return;
        }

        const category = findCategory(id);

        selection.textContent = category
            ? getPath(category).join(" > ")
            : `Catégorie ${id}`;
    }

    function openPicker() {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
    }

    function closePicker() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    function selectCategory(category) {
        input.value = category?.id == null
            ? ""
            : String(category.id);

        updateSelectionLabel();
        closePicker();

        input.dispatchEvent(
            new Event("change", { bubbles: true })
        );

        trigger.focus();
    }

    function renderLevel() {
        title.textContent = current.label;
        back.hidden = parents.length === 0;
        list.replaceChildren();

        // Choisir toutes les catégories du niveau courant.
        const allButton = document.createElement("button");
        allButton.type = "button";
        allButton.className =
            "category-picker-row category-picker-row-all";

        const allLabel = document.createElement("span");
        allLabel.className = "category-picker-row-label";
        allLabel.textContent = current.id == null
            ? "Toutes les catégories"
            : `Toutes — ${current.label}`;

        const allIcon = document.createElement("span");
        allIcon.className = "category-picker-row-icon";
        allIcon.textContent = "✓";

        const selected =
            String(input.value) === String(current.id ?? "");

        if (selected) {
            allButton.classList.add("is-selected");
        }

        allButton.append(allLabel, allIcon);

        allButton.addEventListener("click", () => {
            selectCategory(current);
        });

        list.appendChild(allButton);

        for (const category of current.children || []) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "category-picker-row";

            const label = document.createElement("span");
            label.className = "category-picker-row-label";
            label.textContent = category.label;

            const icon = document.createElement("span");
            icon.className = "category-picker-row-icon";

            const hasChildren =
                Array.isArray(category.children) &&
                category.children.length > 0;

            icon.textContent = hasChildren ? "›" : "";

            if (String(input.value) === String(category.id)) {
                row.classList.add("is-selected");
            }

            row.append(label, icon);

            row.addEventListener("click", (event) => {
                // Empêche le gestionnaire global de traiter ce clic.
                event.stopPropagation();

                if (hasChildren) {
                    parents.push(current);
                    current = category;
                    renderLevel();
                    list.scrollTop = 0;

                    // S'assurer que le panneau reste ouvert.
                    panel.hidden = false;
                    trigger.setAttribute("aria-expanded", "true");
                } else {
                    selectCategory(category);
                }
            });

            list.appendChild(row);
        }
    }

    trigger.addEventListener("click", () => {
        if (panel.hidden) {
            renderLevel();
            openPicker();
        } else {
            closePicker();
        }
    });

    back.addEventListener("click", () => {
        if (parents.length === 0) return;

        current = parents.pop();
        renderLevel();
        list.scrollTop = 0;
    });

    close.addEventListener("click", closePicker);

    // Fermer avec Échap.
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) {
            closePicker();
            trigger.focus();
        }
    });

    // Fermer uniquement si le clic est réellement hors du sélecteur.
    document.addEventListener("click", event => {
        if (
            !panel.hidden &&
            event.target instanceof Node &&
            !picker.contains(event.target)
        ) {
            closePicker();
        }
    });

    // Synchronisation avec les configurations enregistrées.
    window.refreshCategoryPickerSelection = updateSelectionLabel;

    updateSelectionLabel();
    renderLevel();
}

const categoriesTotal = document.getElementById("categories-total");

async function updateCategoriesTotal() {
    if (!categoriesTotal) return;

    try {
        const response = await fetch(
            `/data/categories_stats.json?t=${Date.now()}`
        );

        if (!response.ok) {
            categoriesTotal.textContent =
                "Nombre de catégories : pas encore disponible";
            return;
        }

        const stats = await response.json();

        categoriesTotal.textContent =
            `Nombre total de catégories : ${
                Number(stats.total_categories).toLocaleString("fr-FR")
            }`;
    } catch (error) {
        categoriesTotal.textContent =
            "Impossible de récupérer le nombre de catégories";
    }
}

updateCategoriesTotal();
setInterval(updateCategoriesTotal, 5000);