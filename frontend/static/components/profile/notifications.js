
export function createNotifications(toastContainer) {
    function showToast(message, type = "success", duration = 4000) {
        if (!toastContainer) {
            return;
        }

        const toast = document.createElement("div");
        toast.className = `toast-notification ${type}`;
        toast.setAttribute(
            "role",
            type === "error" ? "alert" : "status"
        );
        toast.textContent = message;

        toastContainer.appendChild(toast);

        if (duration > 0) {
            window.setTimeout(() => {
                toast.remove();
            }, duration);
        }
    }

    return {
        showToast
    };
}
