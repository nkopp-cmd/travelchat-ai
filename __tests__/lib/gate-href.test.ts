import { describe, expect, it } from "vitest";
import { returnPath, signInGateHref, signUpGateHref } from "@/lib/auth/gate-href";
import { claimContinue, saveSpotAction, withContinue } from "@/lib/auth/resume-action";

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

describe("resume after sign-up (Push AZ2)", () => {
    it("adds one continue action to the return path and keeps its query", () => {
        expect(signUpGateHref(withContinue("/spots/abc-123", saveSpotAction("abc-123")))).toBe("/sign-up?redirect_url=%2Fspots%2Fabc-123%3Fcontinue%3Dsave-spot%253Aabc-123");
        expect(withContinue("/explore?city=seoul&continue=old", saveSpotAction("x"))).toBe("/explore?city=seoul&continue=save-spot%3Ax");
    });

    it("claims a matching action exactly once and drops only that param", () => {
        window.history.replaceState(null, "", "/explore?city=seoul&continue=save-spot%3Ax#top");
        try {
            expect(claimContinue(saveSpotAction("y"))).toBe(false);
            expect(window.location.search).toBe("?city=seoul&continue=save-spot%3Ax");
            expect(claimContinue(saveSpotAction("x"))).toBe(true);
            expect(window.location.pathname + window.location.search + window.location.hash).toBe("/explore?city=seoul#top");
            expect(claimContinue(saveSpotAction("x"))).toBe(false);
        } finally { window.history.replaceState(null, "", "/"); }
    });
});
