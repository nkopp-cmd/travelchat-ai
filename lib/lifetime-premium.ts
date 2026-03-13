const LIFETIME_PREMIUM_EMAILS = [
    "nkopp@my-goodlife.com",
    "hello@localley.io",
] as const;

export const LIFETIME_PREMIUM_EMAIL_ALLOWLIST = new Set(
    LIFETIME_PREMIUM_EMAILS.map((email) => email.toLowerCase())
);

export function isLifetimePremiumEmail(email?: string | null): boolean {
    if (!email) {
        return false;
    }

    return LIFETIME_PREMIUM_EMAIL_ALLOWLIST.has(email.toLowerCase());
}

