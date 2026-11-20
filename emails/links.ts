/** Canonical host for every link in our emails: the apex answers with a 301 to www, one extra hop on a phone. */
export const EMAIL_SITE = "https://www.localley.io";

/**
 * Account pages (dashboard, settings) open from an email often on another device than the one that signed in.
 * The middleware sends a signed-out visitor without the account hint to the SIGN-UP form ("Join Localley"), which
 * tells a paying customer to create a new account. So these links go through sign-in; the sign-in page forwards a
 * visitor who is already signed in straight to the page.
 */
export function accountEmailLink(path: "/dashboard" | "/settings"): string {
    return `${EMAIL_SITE}/sign-in?redirect_url=${encodeURIComponent(path)}`;
}
