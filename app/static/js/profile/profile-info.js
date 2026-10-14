
export function createProfileInfo({
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
}) {
    function displayProfile(data) {
        if (!data) {
            return;
        }

        if (memberName) {
            memberName.textContent = data.username || "Utilisateur Vinted";
        }

        if (memberIdLabel) {
            memberIdLabel.textContent = data.member_id ?? "";
        }

        if (memberProfileIdLink) {
            memberProfileIdLink.href = data.member_id
                ? `https://www.vinted.fr/member/${encodeURIComponent(data.member_id)}`
                : "#";
        }

        if (memberBio) {
            memberBio.textContent = data.bio || "";
            memberBio.hidden = !data.bio;
        }

        if (memberAvatar) {
            if (data.avatar) {
                memberAvatar.src = data.avatar;
                memberAvatar.alt = data.username
                    ? `Photo de profil de ${data.username}`
                    : "Photo de profil";
                memberAvatar.hidden = false;
            } else {
                memberAvatar.removeAttribute("src");
                memberAvatar.alt = "";
                memberAvatar.hidden = true;
            }
        }

        if (followersCount) {
            followersCount.textContent = formatCount(data.followers_count);
        }

        if (followingCount) {
            followingCount.textContent = formatCount(data.following_count);
        }

        if (ratingsCount) {
            ratingsCount.textContent = formatCount(data.ratings_count);
        }

        if (ratingAverage) {
            const average = Number(data.rating_average);

            ratingAverage.textContent =
                Number.isFinite(average) && average > 0
                    ? average.toFixed(1)
                    : "—";
        }

        renderRatingStars(data.rating_average);

        if (originalProfile) {
            originalProfile.href = data.member_id
                ? `https://www.vinted.fr/member/${encodeURIComponent(data.member_id)}`
                : "#";
        }

        if (profileWarning) {
            profileWarning.textContent = data.warning || "";
            profileWarning.hidden = !data.warning;
        }

        if (searchCard) {
            searchCard.hidden = true;
        }

        if (profileCard) {
            profileCard.hidden = false;
        }

        if (itemsSection) {
            itemsSection.hidden = false;
        }

        if (profileStatus) {
            profileStatus.textContent = "Profil chargé.";
        }

        if (changeMemberButton) {
            changeMemberButton.hidden = false;
        }
    }

    function renderRatingStars(value) {
        if (!ratingStars) {
            return;
        }

        const rating = Number(value);
        const validRating = Number.isFinite(rating)
            ? Math.max(0, Math.min(5, rating))
            : 0;

        const roundedRating = Math.round(validRating);

        ratingStars.replaceChildren();

        for (let index = 1; index <= 5; index += 1) {
            const star = document.createElement("span");

            star.className = index <= roundedRating
                ? "rating-star filled"
                : "rating-star";

            star.textContent = "★";
            star.setAttribute("aria-hidden", "true");

            ratingStars.appendChild(star);
        }

        ratingStars.setAttribute(
            "aria-label",
            `Note : ${validRating.toFixed(1)} sur 5`
        );
    }

    function formatCount(value) {
        if (value === null || value === undefined || value === "") {
            return "0";
        }

        const count = Number(value);

        if (!Number.isFinite(count)) {
            return String(value);
        }

        return new Intl.NumberFormat("fr-FR").format(count);
    }

    return {
        displayProfile,
        renderRatingStars
    };
}
