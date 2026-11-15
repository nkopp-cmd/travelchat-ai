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

    it("keeps the generic copy for other, missing or foreign redirects", () => {
        for (const target of [undefined, null, "", "/dashboard", "//evil.example/itineraries/preview", "https://evil.example/itineraries/preview", "/itineraries/preview-x"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
            expect(authCopy("sign-in", target).title).toBe("Welcome Back");
        }
    });
});
