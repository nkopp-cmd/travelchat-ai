import { GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";
import { parseCheckoutIntent } from "@/lib/pricing-checkout";

export type AuthMode = "sign-up" | "sign-in";
export type AuthCopy = { title: string; subtitle: string };

const DEFAULT_COPY: Record<AuthMode, AuthCopy> = {
    "sign-up": { title: "Join Localley", subtitle: "Start discovering hidden gems like a local" },
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
    if (path === "/pricing" && redirectUrl?.includes("?")) return checkoutCopy(mode, redirectUrl.split("#")[0]) ?? DEFAULT_COPY[mode];
    return DEFAULT_COPY[mode];
}
