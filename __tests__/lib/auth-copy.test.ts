import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authBackLink, authCopy, FREE_ACCOUNT_SUBTITLE } from "@/lib/auth/auth-copy";
import { TIER_CONFIGS } from "@/lib/subscription";

describe("authCopy", () => {
    it("names the real free limits on the plain Join free form (Push BG1)", () => {
        const free = TIER_CONFIGS.free.limits;
        const copy = authCopy("sign-up", null);
        expect(copy.title).toBe("Join Localley");
        expect(copy.subtitle).toBe(FREE_ACCOUNT_SUBTITLE);
        // Numbers come from the tier config, so copy and limits cannot drift.
        expect(copy.subtitle).toContain(`save ${free.savedSpotsLimit} spot`);
        expect(copy.subtitle).toContain(`plan ${free.itinerariesPerMonth} trip`);
        expect(copy.subtitle).toContain(`${free.chatMessagesPerDay} question`);
        expect(copy.subtitle).toBe("Free, no card: save 10 spots, plan 1 trip a month and ask a local 10 questions a day.");
        // Free accounts get no paid features: never promise Pro, a trial or images.
        expect(copy.subtitle).not.toMatch(/pro|trial|image/i);
    });

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
        for (const target of [undefined, null, "", "/", "/trending", "//evil.example/itineraries/preview", "https://evil.example/itineraries/preview"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
            expect(authCopy("sign-in", target).title).toBe("Welcome Back");
        }
        // An id path is a saved trip (Push BP3), never the browser preview copy.
        expect(authCopy("sign-up", "/itineraries/preview-x").title).toBe("Open your saved trip");
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

    it("speaks to the other signed-out walls (Push BB2)", () => {
        const want: Record<string, [string, string]> = {
            "/dashboard": ["Your Localley home", "Sign in to your dashboard"],
            "/community": ["Ask travellers and locals", "Sign in to the community"],
            "/community/ask": ["Ask travellers and locals", "Sign in to the community"],
            "/community/now?city=seoul": ["Ask travellers and locals", "Sign in to the community"],
            "/community/q-123": ["Ask travellers and locals", "Sign in to the community"],
            "/explore?city=tokyo": ["Explore trips by travellers", "Sign in to explore trips"],
            "/leaderboard": ["See the top explorers", "Sign in to see the leaderboard"],
            "/challenges": ["Take a travel challenge", "Sign in to your challenges"],
            "/users/mina": ["See this traveller's profile", "Sign in to see this profile"],
        };
        for (const [target, [up, inTitle]] of Object.entries(want)) {
            expect(authCopy("sign-up", target).title).toBe(up);
            expect(authCopy("sign-in", target).title).toBe(inTitle);
            // These sections are free: never promise a paid feature or a trial.
            for (const mode of ["sign-up", "sign-in"] as const) {
                expect(JSON.stringify(authCopy(mode, target))).not.toMatch(/unlimited|trial|pro\b|premium/i);
            }
            expect(authCopy("sign-up", target).subtitle).toMatch(/free account/);
        }
        for (const target of ["/dashboardx", "/communityx", "/explore/abc", "/users", "/users/a/b", "/challenges/1", "//evil.example/dashboard"]) {
            expect(authCopy("sign-up", target).title).toBe("Join Localley");
        }
    });

    it("prints limits and prices only from TIER_CONFIGS, never as hard-coded numbers (Push BG3)", () => {
        const { free, pro } = TIER_CONFIGS;
        expect(authCopy("sign-up", "/spots/abc-123").subtitle).toContain(`up to ${free.limits.savedSpotsLimit} spots`);
        // Copy strings in these files must not carry a limit or price as a literal number.
        const literal = /["'`>][^"'`<]*?(\b\d+ (saved )?spots?\b|\b\d+ (chat )?(messages|questions)\b|\b\d+ trips? (a|per) month|\$\d+\/month)/;
        for (const file of ["lib/auth/auth-copy.ts", "app/pricing/page.tsx", "app/itineraries/preview/preview-client.tsx", "lib/seo/pricing-line.ts"]) {
            const code = readFileSync(file, "utf8").split("\n").filter((line) => !/^\s*(\/\/|\*|\{\/\*)/.test(line)).join("\n");
            expect(code.match(literal)?.[0], file).toBeUndefined();
        }
        expect(pro.limits.chatMessagesPerDay).toBeGreaterThan(free.limits.chatMessagesPerDay);
    });
});

describe("tips wall copy (Push BP1)", () => {
    it("names the traveller tips for the spot page tips link, in both modes", () => {
        expect(authCopy("sign-up", "/spots/abc-123/tips")).toEqual({ title: "Read traveller tips", subtitle: "Create a free account to read tips and see photos from travellers, and add your own." });
        expect(authCopy("sign-in", "/spots/abc-123/tips").title).toBe("Sign in to read traveller tips");
        expect(authCopy("sign-up", "/spots/abc-123/tips?reported=1").title).toBe("Read traveller tips");
    });
    it("links back to the spot itself", () => {
        expect(authBackLink("/spots/abc-123/tips")).toEqual({ href: "/spots/abc-123", label: "Back to the spot" });
    });
    it("leaves other spot paths alone", () => {
        for (const target of ["/spots/submit/tips", "/spots/abc/tips/extra", "/spots//tips", "//evil.example/spots/a/tips"]) {
            expect(authCopy("sign-up", target).title, target).not.toBe("Read traveller tips");
            expect(authBackLink(target), target).toBeNull();
        }
    });
});

describe("authBackLink (Push BH2)", () => {
    it("links back to the trip, the planner or the spot, without the resume query", () => {
        expect(authBackLink("/itineraries/preview?continue=save")).toEqual({ href: "/itineraries/preview", label: "Back to your trip" });
        expect(authBackLink("/itineraries/new?city=seoul")).toEqual({ href: "/itineraries/new", label: "Back to the planner" });
        expect(authBackLink("/spots/08b64783?continue=save-spot:08b64783")).toEqual({ href: "/spots/08b64783", label: "Back to the spot" });
    });
    it("shows no link for the plain form, other paths or unsafe redirects", () => {
        for (const value of [undefined, null, "", "/", "/dashboard", "/sign-in", "/sign-up", "/blog/a/b", "/blog/x\\evil.example", "/spots/submit", "//evil.example/itineraries/preview", "https://evil.example/itineraries/preview"]) {
            expect(authBackLink(value), String(value)).toBeNull();
        }
    });
    it("is wired into both auth pages", () => {
        for (const file of ["app/sign-up/[[...sign-up]]/page.tsx", "app/sign-in/[[...sign-in]]/page.tsx"]) {
            expect(readFileSync(file, "utf8"), file).toContain("back={authBackLink(target)}");
        }
    });
});

// Push BP2: the tips page needs an account, so crawlers that follow the spot page link only reach a 307 to the
// noindex auth form. The link carries rel="nofollow"; visitors still use it.
describe("spot page tips link (Push BP2)", () => {
    it("is nofollow", () => {
        const source = readFileSync("app/spots/[id]/page.tsx", "utf8");
        const link = source.slice(source.indexOf("href={`/spots/${spot.id}/tips`}"), source.indexOf("Traveller tips and photos"));
        expect(link).toContain('rel="nofollow"');
    });
});

describe("authBackLink (Push BS2 + BS4)", () => {
    it.each([
        ["/pricing", "/pricing", "Back to pricing"],
        ["/pricing?checkout=pro-monthly", "/pricing", "Back to pricing"],
        ["/spots?city=tokyo&category=cafe", "/spots", "Back to Explore"],
        ["/explore", "/explore", "Back to Explore"],
        ["/blog", "/blog", "Back to the blog"],
        ["/blog/paying-in-seoul#tips", "/blog/paying-in-seoul", "Back to the article"],
    ])("links %s back to %s without the query", (target, href, label) => {
        expect(authBackLink(target)).toEqual({ href, label });
    });
    it.each(["/pricing", "/spots?city=tokyo", "/blog/paying-in-seoul", "/itineraries/preview?continue=save", "/spots/abc?continue=save-spot:abc", "/spots/abc/tips"])(
        "keeps %s same-origin and query-free", (target) => {
            const back = authBackLink(target);
            expect(back).not.toBeNull();
            expect(back!.href).toMatch(/^\/(?![/\\])[^?#]*$/);
        });
});
