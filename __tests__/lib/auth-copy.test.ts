import { describe, expect, it } from "vitest";
import { authCopy } from "@/lib/auth/auth-copy";

describe("authCopy", () => {
    it("speaks to the saved trip when sign-up comes from the free-trip preview", () => {
        expect(authCopy("sign-up", "/itineraries/preview").title).toBe("Create an account to save your trip");
        expect(authCopy("sign-up", "/itineraries/preview?payment=canceled").title).toBe("Create an account to save your trip");
        expect(authCopy("sign-in", "/itineraries/preview").title).toBe("Sign in to save your trip");
        // Saving needs Pro (POST /api/itineraries/save answers 402 for free accounts): never call the save free.
        expect(authCopy("sign-up", "/itineraries/preview").subtitle).toContain("Pro");
        expect(authCopy("sign-up", "/itineraries/preview").title).not.toMatch(/free/i);
    });

    it("speaks to the planner when the redirect resumes the planner", () => {
        expect(authCopy("sign-up", "/itineraries/new?resume=1").title).toBe("Keep planning");
    });

    it("names the chosen plan when sign-up comes from a pricing plan button", () => {
        expect(authCopy("sign-up", "/pricing?checkout=pro-monthly")).toEqual({ title: "Create your account to start Pro", subtitle: "Your Pro monthly checkout opens next." });
        expect(authCopy("sign-up", "/pricing?checkout=premium-yearly").title).toBe("Create your account to start Premium");
        expect(authCopy("sign-in", "/pricing?checkout=pro-yearly")).toEqual({ title: "Sign in to start Pro", subtitle: "Your Pro yearly checkout opens next." });
        // The Pro trial is not live (checkout passes no trial days): never promise one.
        expect(JSON.stringify(authCopy("sign-up", "/pricing?checkout=pro-monthly"))).not.toMatch(/trial|free/i);
        for (const target of ["/pricing", "/pricing?checkout=gold-monthly", "/pricing?checkout=pro", "//evil.example/pricing?checkout=pro-monthly", "/pricingx?checkout=pro-monthly"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
        }
    });

    it("speaks to the bottom-nav tab that sent a signed-out visitor (Push AF2)", () => {
        expect(authCopy("sign-up", "/chat").title).toBe("Ask a local");
        expect(authCopy("sign-in", "/chat").title).toBe("Sign in to chat");
        expect(authCopy("sign-up", "/itineraries").title).toBe("Your trips in one place");
        expect(authCopy("sign-up", "/itineraries?tab=saved").title).toBe("Your trips in one place");
        expect(authCopy("sign-in", "/itineraries").title).toBe("Sign in to see your trips");
        // Free accounts get 1 trip a month and 10 chat messages a day: never promise unlimited or free saving.
        for (const path of ["/chat", "/itineraries"]) for (const mode of ["sign-up", "sign-in"] as const) {
            expect(JSON.stringify(authCopy(mode, path))).not.toMatch(/unlimited|trial|save.*free|free.*sav/i);
        }
        for (const target of ["/chatx", "/chat/old", "/itineraries/trip-1", "//evil.example/chat"]) {
            expect(authCopy("sign-up", target).title).not.toMatch(/Ask a local|Your trips/);
        }
    });

    it("keeps the generic copy for other, missing or foreign redirects", () => {
        for (const target of [undefined, null, "", "/dashboard", "//evil.example/itineraries/preview", "https://evil.example/itineraries/preview", "/itineraries/preview-x"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
            expect(authCopy("sign-in", target).title).toBe("Welcome Back");
        }
    });

    it("speaks to the spot when a signed-out Save tap sent the visitor (Push AG2)", () => {
        expect(authCopy("sign-up", "/spots/abc-123")).toEqual({ title: "Save this spot", subtitle: "Create a free account and keep up to 10 spots in your trip list." });
        expect(authCopy("sign-up", "/spots/abc-123?from=map").title).toBe("Save this spot");
        expect(authCopy("sign-in", "/spots/abc-123").title).toBe("Sign in to save this spot");
        expect(JSON.stringify(authCopy("sign-up", "/spots/abc-123"))).not.toMatch(/unlimited|trial/i);
        for (const target of ["/spots", "/spots/", "/spots/a/b", "/spots/submit", "/spots/submissions", "/spotsx/abc", "//evil.example/spots/abc"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
        }
    });

    it("speaks to the spot when a spot CARD Save on a list page sent the visitor (Push BA1)", () => {
        for (const target of ["/spots?continue=save-spot%3Aabc-123", "/spots?continue=save-spot:abc-123", "/cities/seoul?tab=spots&continue=save-spot%3Aabc", "/guides/seoul-food?continue=save-spot%3Aabc#top", "/spots/abc-123?continue=save-spot%3Aabc-123"]) {
            expect(authCopy("sign-up", target).title).toBe("Save this spot");
            expect(authCopy("sign-in", target).title).toBe("Sign in to save this spot");
        }
        for (const target of ["/spots?continue=save", "/spots?continue=other%3Aabc", "/spots?next=save-spot%3Aabc", "/spots#continue=save-spot:abc", "//evil.example/spots?continue=save-spot%3Aabc"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
        }
    });

    it("speaks to the account tabs that sent a signed-out visitor (Push BA1)", () => {
        expect(authCopy("sign-up", "/profile").title).toBe("Your Localley profile");
        expect(authCopy("sign-in", "/profile").title).toBe("Sign in to your profile");
        expect(authCopy("sign-up", "/settings?subscription=success").title).toBe("Your account settings");
        expect(authCopy("sign-in", "/settings").title).toBe("Sign in to your settings");
        for (const path of ["/profile", "/settings"]) for (const mode of ["sign-up", "sign-in"] as const) {
            expect(JSON.stringify(authCopy(mode, path))).not.toMatch(/unlimited|trial|pro\b|premium/i);
        }
        for (const target of ["/profilex", "/profile/edit", "/settings/billing", "//evil.example/profile"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
        }
    });
});
