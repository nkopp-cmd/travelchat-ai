import { GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";
import { parseCheckoutIntent } from "@/lib/pricing-checkout";
import { CONTINUE_PARAM } from "@/lib/auth/resume-action";
import { TIER_CONFIGS } from "@/lib/subscription";

export type AuthMode = "sign-up" | "sign-in";
export type AuthCopy = { title: string; subtitle: string };

// Push BG1: the plain "Join free" form names what a free account gets, built from the real free limits.
const FREE = TIER_CONFIGS.free.limits;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const FREE_ACCOUNT_SUBTITLE =
    `Free, no card: save ${plural(FREE.savedSpotsLimit, "spot")}, plan ${plural(FREE.itinerariesPerMonth, "trip")} a month ` +
    `and ask a local ${plural(FREE.chatMessagesPerDay, "question")} a day.`;

const DEFAULT_COPY: Record<AuthMode, AuthCopy> = {
    "sign-up": { title: "Join Localley", subtitle: FREE_ACCOUNT_SUBTITLE },
    "sign-in": { title: "Welcome Back", subtitle: "Sign in to continue your local adventures" },
};

const TRIP_COPY: Record<"preview" | "planner", Record<AuthMode, AuthCopy>> = {
    preview: {
        "sign-up": { title: "Create an account to save your trip", subtitle: "Your plan stays in this browser while you sign up. Saving and editing come with Pro." },
        "sign-in": { title: "Sign in to save your trip", subtitle: "Your plan is waiting on the next screen." },
    },
    planner: {
        "sign-up": { title: "Keep planning", subtitle: "Create a free account. Your trip settings stay as you left them." },
        "sign-in": { title: "Sign in to keep planning", subtitle: "Your trip settings stay as you left them." },
    },
};

// Bottom-nav tabs that need an account (middleware sends signed-out visitors to the auth form with this redirect).
// Free accounts: 10 chat messages a day, 1 trip a month (lib/subscription.ts); the copy promises nothing beyond that.
const NAV_COPY: Record<"/chat" | "/itineraries" | "/profile" | "/settings", Record<AuthMode, AuthCopy>> = {
    "/chat": {
        "sign-up": { title: "Ask a local", subtitle: "Create a free account to chat about places, food and routes." },
        "sign-in": { title: "Sign in to chat", subtitle: "Your conversations are on the next screen." },
    },
    "/itineraries": {
        "sign-up": { title: "Your trips in one place", subtitle: "Create a free account and plan your first trip." },
        "sign-in": { title: "Sign in to see your trips", subtitle: "Your saved trips are on the next screen." },
    },
    "/profile": {
        "sign-up": { title: "Your Localley profile", subtitle: "Create a free account to keep your saved spots and trips together." },
        "sign-in": { title: "Sign in to your profile", subtitle: "Your profile is on the next screen." },
    },
    "/settings": {
        "sign-up": { title: "Your account settings", subtitle: "Create a free account to manage your plan and emails." },
        "sign-in": { title: "Sign in to your settings", subtitle: "Your settings are on the next screen." },
    },
};

// Other signed-out walls (Push BB2): old or shared links into these sections reach the form with this redirect.
// None of them needs a paid plan, so the copy offers a free account and promises nothing beyond what it opens.
const WALL_COPY: Record<"/dashboard" | "/community" | "/explore" | "/leaderboard" | "/challenges" | "/users", Record<AuthMode, AuthCopy>> = {
    "/dashboard": {
        "sign-up": { title: "Your Localley home", subtitle: "Create a free account to keep your trips, spots and chats in one place." },
        "sign-in": { title: "Sign in to your dashboard", subtitle: "Your trips and spots are on the next screen." },
    },
    "/community": {
        "sign-up": { title: "Ask travellers and locals", subtitle: "Create a free account to read answers and ask your own question." },
        "sign-in": { title: "Sign in to the community", subtitle: "The questions and answers are on the next screen." },
    },
    "/explore": {
        "sign-up": { title: "Explore trips by travellers", subtitle: "Create a free account to browse trips that others planned." },
        "sign-in": { title: "Sign in to explore trips", subtitle: "Trips by other travellers are on the next screen." },
    },
    "/leaderboard": {
        "sign-up": { title: "See the top explorers", subtitle: "Create a free account to see the ranks and earn your own points." },
        "sign-in": { title: "Sign in to see the leaderboard", subtitle: "The ranks are on the next screen." },
    },
    "/challenges": {
        "sign-up": { title: "Take a travel challenge", subtitle: "Create a free account to join challenges and earn points." },
        "sign-in": { title: "Sign in to your challenges", subtitle: "Your challenges are on the next screen." },
    },
    "/users": {
        "sign-up": { title: "See this traveller's profile", subtitle: "Create a free account to see their trips and spots." },
        "sign-in": { title: "Sign in to see this profile", subtitle: "The profile is on the next screen." },
    },
};
function wallOf(path: string): keyof typeof WALL_COPY | null {
    if (path === "/dashboard" || path === "/explore" || path === "/leaderboard" || path === "/challenges") return path;
    if (path === "/community" || path.startsWith("/community/")) return "/community";
    if (/^\/users\/[^/]+$/.test(path)) return "/users";
    return null;
}

// Spot page Save/Like gates (Push AG1) send /sign-up?redirect_url=/spots/<id>. Free accounts keep 10 saved spots
// (lib/subscription.ts savedSpotsLimit); the copy promises nothing beyond that.
const SPOT_COPY: Record<AuthMode, AuthCopy> = {
    "sign-up": { title: "Save this spot", subtitle: `Create a free account and keep up to ${plural(FREE.savedSpotsLimit, "spot")} in your trip list.` },
    "sign-in": { title: "Sign in to save this spot", subtitle: "Your trip list is on the next screen." },
};
const SPOT_PAGE = /^\/spots\/(?!submit$|submissions$)[^/]+$/;
// Push BP1: every spot page links "Traveller tips and photos" to /spots/<id>/tips, which needs an account
// (lib/community/access requireCommunityPage). Reading and adding tips is free.
const TIPS_COPY: Record<AuthMode, AuthCopy> = {
    "sign-up": { title: "Read traveller tips", subtitle: "Create a free account to read tips and see photos from travellers, and add your own." },
    "sign-in": { title: "Sign in to read traveller tips", subtitle: "The tips for this spot are on the next screen." },
};
const TIPS_PAGE = /^\/spots\/(?!(?:submit|submissions)\/)([^/]+)\/tips$/;
// A spot CARD Save on a list page (Push AZ2) returns to that page with ?continue=save-spot:<id> (Push BA1).
function isSpotSaveResume(redirectUrl: string): boolean {
    const q = redirectUrl.indexOf("?");
    if (q < 0) return false;
    return new URLSearchParams(redirectUrl.slice(q + 1).split("#")[0]).get(CONTINUE_PARAM)?.startsWith("save-spot:") ?? false;
}

const TIER_NAME = { pro: "Pro", premium: "Premium" } as const;

// A pricing plan button sends new visitors here with /pricing?checkout=<tier>-<cycle>; Stripe opens after sign-up.
function checkoutCopy(mode: AuthMode, redirectUrl: string): AuthCopy | null {
    const intent = parseCheckoutIntent(redirectUrl.slice(redirectUrl.indexOf("?") + 1));
    if (!intent) return null;
    const tier = TIER_NAME[intent.tier];
    const subtitle = `Your ${tier} ${intent.cycle} checkout opens next.`;
    return mode === "sign-up"
        ? { title: `Create your account to start ${tier}`, subtitle }
        : { title: `Sign in to start ${tier}`, subtitle };
}

function pathOf(redirectUrl: string | null | undefined): string | null {
    if (!redirectUrl || !redirectUrl.startsWith("/") || redirectUrl.startsWith("//")) return null;
    return redirectUrl.split(/[?#]/)[0];
}

// Headline for the auth page: speak to the trip when the visitor came from the free-trip flow.
export function authCopy(mode: AuthMode, redirectUrl: string | null | undefined): AuthCopy {
    const path = pathOf(redirectUrl);
    if (path === GENERATED_PREVIEW_PATH) return TRIP_COPY.preview[mode];
    if (path === "/itineraries/new") return TRIP_COPY.planner[mode];
    if (path === "/chat" || path === "/itineraries" || path === "/profile" || path === "/settings") return NAV_COPY[path][mode];
    const wall = path ? wallOf(path) : null;
    if (wall) return WALL_COPY[wall][mode];
    if (path && TIPS_PAGE.test(path)) return TIPS_COPY[mode];
    if (path && (SPOT_PAGE.test(path) || isSpotSaveResume(redirectUrl!))) return SPOT_COPY[mode];
    if (path === "/pricing" && redirectUrl?.includes("?")) return checkoutCopy(mode, redirectUrl.split("#")[0]) ?? DEFAULT_COPY[mode];
    return DEFAULT_COPY[mode];
}

// Push BH2: the auth form had no way back (the logo has no link). A visitor who came from a trip, the planner or a
// spot page gets one link back to that page. The link drops the query, so it never replays continue=save or checkout.
export type AuthBackLink = { href: string; label: string };
export function authBackLink(redirectUrl: string | null | undefined): AuthBackLink | null {
    const path = pathOf(redirectUrl);
    if (path === GENERATED_PREVIEW_PATH) return { href: GENERATED_PREVIEW_PATH, label: "Back to your trip" };
    if (path === "/itineraries/new") return { href: "/itineraries/new", label: "Back to the planner" };
    if (path && SPOT_PAGE.test(path)) return { href: path, label: "Back to the spot" };
    const tips = path ? TIPS_PAGE.exec(path) : null;
    if (tips) return { href: `/spots/${tips[1]}`, label: "Back to the spot" };
    return null;
}
