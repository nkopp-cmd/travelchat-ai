import { describe, expect, it } from "vitest";
import { returnPath, signInGateHref, signUpGateHref } from "@/lib/auth/gate-href";

describe("gate hrefs (Push AG1)", () => {
    it("sends a signed-out tap to sign-up and back to the same page", () => {
        expect(signUpGateHref("/spots/abc-123")).toBe("/sign-up?redirect_url=%2Fspots%2Fabc-123");
        expect(signUpGateHref("/explore?city=seoul&tab=new")).toBe("/sign-up?redirect_url=%2Fexplore%3Fcity%3Dseoul%26tab%3Dnew");
        expect(signInGateHref("/settings")).toBe("/sign-in?redirect_url=%2Fsettings");
    });

    it("never returns to another origin or to an auth page", () => {
        for (const bad of [null, undefined, "", "https://evil.example/x", "//evil.example/x", "/\\evil.example", "/sign-in", "/sign-up?redirect_url=%2F", "/sign-in/sso-callback"]) {
            expect(returnPath(bad)).toBe("/");
            expect(signUpGateHref(bad)).toBe("/sign-up?redirect_url=%2F");
        }
        expect(returnPath("/sign-ups-guide")).toBe("/sign-ups-guide");
    });
});
