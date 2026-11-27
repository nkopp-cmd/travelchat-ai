import { afterEach, describe, expect, it, vi } from "vitest";
import { getActivityBookingLinks, getGetYourGuideLink } from "@/lib/affiliates";

const activity = { activityName: "Gyeongbokgung Palace", city: "Seoul" };

afterEach(() => vi.unstubAllEnvs());

describe("GetYourGuide affiliate links", () => {
    it("uses the canonical partner ID at request time", () => {
        vi.stubEnv("GETYOURGUIDE_PARTNER_ID", " AB12CDE ");
        vi.stubEnv("GYG_AFFILIATE_ID", "LEGACY");

        const link = getGetYourGuideLink(activity);
        expect(link).not.toBeNull();
        const url = new URL(link!.url);
        expect(url.searchParams.get("partner_id")).toBe("AB12CDE");
        expect(url.searchParams.get("q")).toBe("Gyeongbokgung Palace Seoul");
        expect(getActivityBookingLinks(activity)).toContainEqual(expect.objectContaining({ url: link!.url }));
    });

    it.each([undefined, "", "localley", "LOCALLEY", "bad value"])("omits links with an invalid partner ID (%s)", (id) => {
        vi.stubEnv("GETYOURGUIDE_PARTNER_ID", id);
        vi.stubEnv("GYG_AFFILIATE_ID", "LEGACY");

        expect(getGetYourGuideLink(activity)).toBeNull();
        expect(getActivityBookingLinks(activity).map((link) => link.partner)).toEqual(["viator", "klook"]);
    });
});
