
/**
 * Récupération du profil et des annonces via le flux SSE du backend.
 *
 * Le backend envoie des événements :
 * - profile : données du profil
 * - items   : annonces récupérées
 * - done    : récupération terminée
 * - error   : erreur pendant la récupération
 */

export async function fetchProfileStream(memberId, {
    signal,
    onProfile,
    onItems,
    onDone,
    onError,
    headers = {}
} = {}) {
    const url = `/api/profile/${encodeURIComponent(memberId)}`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Accept: "text/event-stream",
            ...headers
        },
        signal
    });

    if (!response.ok) {
        throw new Error(
            `Erreur HTTP ${response.status} : ${response.statusText || "requête échouée"}`
        );
    }

    if (!response.body) {
        throw new Error("Le navigateur ne permet pas de lire le flux de données.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let eventName = "message";
    let dataLines = [];
    let streamFinished = false;

    function dispatchEvent() {
        if (dataLines.length === 0) {
            eventName = "message";
            return;
        }

        const rawData = dataLines.join("\n");

        dataLines = [];

        const currentEvent = eventName;
        eventName = "message";

        let data;

        try {
            data = JSON.parse(rawData);
        } catch {
            console.error(
                `Impossible de lire les données SSE de l'événement "${currentEvent}" :`,
                rawData
            );
            return;
        }

        switch (currentEvent) {
            case "profile":
                onProfile?.(data);
                break;

            case "items":
                onItems?.(data);
                break;

            case "done":
                streamFinished = true;
                onDone?.(data);
                break;

            case "error": {
                const message =
                    data?.message ||
                    data?.detail ||
                    data?.error ||
                    "Une erreur est survenue pendant la récupération.";

                const error = new Error(message);
                onError?.(error, data);
                break;
            }

            default:
                // Ignore les événements SSE inconnus.
                break;
        }
    }

    function processLine(line) {
        if (line === "") {
            dispatchEvent();
            return;
        }

        // Les commentaires SSE commencent par ":".
        if (line.startsWith(":")) {
            return;
        }

        const separatorIndex = line.indexOf(":");

        let field;
        let value;

        if (separatorIndex === -1) {
            field = line;
            value = "";
        } else {
            field = line.slice(0, separatorIndex);
            value = line.slice(separatorIndex + 1);

            // Le protocole SSE retire au plus une espace après ":".
            if (value.startsWith(" ")) {
                value = value.slice(1);
            }
        }

        if (field === "event") {
            eventName = value;
        } else if (field === "data") {
            dataLines.push(value);
        }
    }

    function processBuffer(final = false) {
        const lines = buffer.split(/\r\n|\r|\n/);

        // La dernière ligne peut être incomplète tant que le flux continue.
        buffer = final ? "" : lines.pop();

        for (const line of lines) {
            processLine(line);
        }

        if (final && lines.length > 0) {
            // Les lignes complètes ont déjà été traitées.
        }

        if (final && buffer === "") {
            dispatchEvent();
        }
    }

    try {
        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                buffer += decoder.decode();
                processBuffer(true);
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            processBuffer();
        }
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }

        throw error;
    } finally {
        reader.releaseLock();
    }

    if (!streamFinished) {
        // Le flux peut se fermer normalement sans événement "done".
        // Le contrôleur peut décider comment traiter cette situation.
        return { completed: false };
    }

    return { completed: true };
}
