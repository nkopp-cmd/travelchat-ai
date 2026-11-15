import { describe, expect, it } from "vitest";
import { authCopy } from "@/lib/auth/auth-copy";

describe("authCopy", () => {
    it("speaks to the saved trip when sign-up comes from the free-trip preview", () => {
        expect(authCopy("sign-up", "/itineraries/preview").title).toBe("Save your free trip");
        expect(authCopy("sign-up", "/itineraries/preview?payment=canceled").title).toBe("Save your free trip");
        expect(authCopy("sign-in", "/itineraries/preview").title).toBe("Sign in to save your trip");
    });

    it("speaks to the planner when the redirect resumes the planner", () => {
        expect(authCopy("sign-up", "/itineraries/new?resume=1").title).toBe("Keep planning free");
    });

    it("keeps the generic copy for other, missing or foreign redirects", () => {
        for (const target of [undefined, null, "", "/dashboard", "//evil.example/itineraries/preview", "https://evil.example/itineraries/preview", "/itineraries/preview-x"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
            expect(authCopy("sign-in", target).title).toBe("Welcome Back");
        }
    });
});
