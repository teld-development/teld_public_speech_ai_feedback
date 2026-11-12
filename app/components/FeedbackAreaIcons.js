export function FeedbackCategoryIcon({ categoryId }) {
    if (categoryId === "content") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H6.5A2.5 2.5 0 0 0 4 20.5z" />
                <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v18a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 1 2.5 2.5z" />
            </svg>
        );
    }
    if (categoryId === "organization") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="6" cy="5" r="2" />
                <circle cx="18" cy="12" r="2" />
                <circle cx="6" cy="19" r="2" />
                <path d="M8 5h3a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3" />
                <path d="M8 19h3a3 3 0 0 0 3-3v-1a3 3 0 0 1 3-3" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
            <path d="M12 18v3M9 21h6" />
        </svg>
    );
}

export function FeedbackItemIcon({ itemId }) {
    let icon;

    switch (itemId) {
        case "presentation_content":
            icon = <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h4" /></>;
            break;
        case "explanation_method":
            icon = <><circle cx="5" cy="12" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 12h3a4 4 0 0 0 4-4 2 2 0 0 1 2-2h1M7 12h3a4 4 0 0 1 4 4 2 2 0 0 0 2 2h1" /></>;
            break;
        case "eye_contact":
            icon = <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>;
            break;
        default:
            icon = <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>;
    }

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon}
        </svg>
    );
}
