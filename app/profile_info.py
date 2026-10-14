
def _extract_profile_data(page, member_id):
    return page.evaluate(
        r"""
        (memberId) => {
            const text = (el) =>
                el?.textContent?.replace(/\s+/g, ' ').trim() || null;

            const meta = (selector) =>
                document.querySelector(selector)?.content || null;

            const parseCount = (value) => {
                if (!value) return null;

                const normalized = value
                    .replace(/\u00a0/g, ' ')
                    .replace(/\s+/g, '')
                    .replace(/[^\d]/g, '');

                if (!normalized) return null;

                const result = Number.parseInt(normalized, 10);
                return Number.isFinite(result) ? result : null;
            };

            const followersLink = document.querySelector(
                `a[href="/member/general/followers/${memberId}"]`
            );

            const followingLink = document.querySelector(
                `a[href="/member/general/following/${memberId}"]`
            );

            const followersCount =
                parseCount(followersLink?.getAttribute('aria-label')) ??
                parseCount(text(followersLink));

            const followingCount =
                parseCount(followingLink?.getAttribute('aria-label')) ??
                parseCount(text(followingLink));

            const ratingLabel = document.querySelector(
                '.web_ui__Rating__label'
            );

            const ratingMatch = text(ratingLabel)?.match(
                /([\d\s\u00a0.,]+)\s*évaluations?/i
            );

            const ratingsCount = ratingMatch
                ? parseCount(ratingMatch[1])
                : null;

            const stars = [
                ...document.querySelectorAll('.web_ui__Rating__star')
            ];

            let ratingAverage = null;

            if (stars.length >= 5) {
                ratingAverage = stars.slice(0, 5).reduce((sum, star) => {
                    if (star.classList.contains('web_ui__Rating__full')) {
                        return sum + 1;
                    }

                    if (
                        star.classList.contains(
                            'web_ui__Rating__half-full'
                        )
                    ) {
                        return sum + 0.5;
                    }

                    return sum;
                }, 0);
            }

            const images = [...document.querySelectorAll('img')];

            const avatarElement = images.find((img) =>
                /avatar|profile|member/i.test(
                    (img.alt || '') + ' ' +
                    (
                        typeof img.className === 'string'
                            ? img.className
                            : ''
                    )
                )
            );

            const username =
                text(document.querySelector('h1')) ||
                meta('meta[property="og:title"]');

            const description =
                text(
                    document.querySelector(
                        '[data-testid="profile-user-description"]'
                    )
                ) ||
                meta('meta[property="og:description"]') ||
                meta('meta[name="description"]');

            const avatar =
                avatarElement?.currentSrc ||
                avatarElement?.src ||
                meta('meta[property="og:image"]');

            return {
                username,
                description,
                avatar,
                pageTitle: document.title,
                bodyText: text(document.body),
                followers_count: followersCount,
                following_count: followingCount,
                ratings_count: ratingsCount,
                rating_average: ratingAverage
            };
        }
        """,
        member_id,
    )
