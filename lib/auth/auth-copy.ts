import { GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";

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

function pathOf(redirectUrl: string | null | undefined): string | null {
    if (!redirectUrl || !redirectUrl.startsWith("/") || redirectUrl.startsWith("//")) return null;
    return redirectUrl.split(/[?#]/)[0];
}

// Headline for the auth page: speak to the trip when the visitor came from the free-trip flow.
export function authCopy(mode: AuthMode, redirectUrl: string | null | undefined): AuthCopy {
    const path = pathOf(redirectUrl);
    if (path === GENERATED_PREVIEW_PATH) return TRIP_COPY.preview[mode];
    if (path === "/itineraries/new") return TRIP_COPY.planner[mode];
    return DEFAULT_COPY[mode];
}
