
const PROFILE_CACHE_KEY = "vinted-profile-cache";
const ITEMS_CACHE_KEY = "vinted-items-cache";

/**
 * Crée un gestionnaire de cache pour le profil et ses annonces.
 */
export function createProfileCache() {
    function read(key) {
        try {
            const value = sessionStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error(`Impossible de lire le cache "${key}" :`, error);
            return null;
        }
    }

    function write(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Impossible d'enregistrer le cache "${key}" :`, error);
            return false;
        }
    }

    function remove(key) {
        try {
            sessionStorage.removeItem(key);
        } catch (error) {
            console.error(`Impossible de supprimer le cache "${key}" :`, error);
        }
    }

    function getProfile() {
        return read(PROFILE_CACHE_KEY);
    }

    function setProfile(profile) {
        return write(PROFILE_CACHE_KEY, profile);
    }

    function getItems() {
        const items = read(ITEMS_CACHE_KEY);
        return Array.isArray(items) ? items : [];
    }

    function setItems(items) {
        return write(ITEMS_CACHE_KEY, items);
    }

    function clear() {
        remove(PROFILE_CACHE_KEY);
        remove(ITEMS_CACHE_KEY);
    }

    return {
        getProfile,
        setProfile,
        getItems,
        setItems,
        clear
    };
}
