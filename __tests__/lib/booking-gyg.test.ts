import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gygDayLink, gygPartnerId, gygSpotSearchUrl, isGygSpotCategory } from "@/lib/booking/gyg";

describe("gygPartnerId (booking plan B7)", () => {
  it("returns the real id and never the placeholder", () => {
    expect(gygPartnerId({ GETYOURGUIDE_PARTNER_ID: " AB12CDE " })).toBe("AB12CDE");
    for (const v of [undefined, "", "localley", "LOCALLEY", "a b", "x"]) {
      expect(gygPartnerId({ GETYOURGUIDE_PARTNER_ID: v })).toBeNull();
    }
  });
});

describe("gygSpotSearchUrl (Push DR1)", () => {
  const palace = { name: "Gyeongbokgung Palace", category: "Palace", city: "Seoul" };

  it("builds a GetYourGuide search link with our partner id", () => {
    const url = new URL(gygSpotSearchUrl(palace, "AB12CDE")!);
    expect(url.origin).toBe("https://www.getyourguide.com");
    expect(url.searchParams.get("q")).toBe("Gyeongbokgung Palace Seoul");
    expect(url.searchParams.get("partner_id")).toBe("AB12CDE");
    expect(url.searchParams.get("cmp")).toBe("localley-spot");
  });

  it("gives no link without a partner id, for free places or for non-landmark categories", () => {
    expect(gygSpotSearchUrl(palace, null)).toBeNull();
    expect(gygSpotSearchUrl({ name: "Seoul Forest", category: "Park", city: "Seoul" }, "AB12CDE")).toBeNull();
    expect(gygSpotSearchUrl({ name: "Cafe Onion", category: "Cafe", city: "Seoul" }, "AB12CDE")).toBeNull();
    expect(gygSpotSearchUrl({ name: "Bar X", category: "Bar", city: "Tokyo" }, "AB12CDE")).toBeNull();
    expect(gygSpotSearchUrl({ ...palace, city: "" }, "AB12CDE")).toBeNull();
    expect(isGygSpotCategory("Theme Park")).toBe(true);
  });

  it("property: every link carries the partner id and never the placeholder", () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 60 }), fc.string({ minLength: 1, maxLength: 30 }), (name, city) => {
      const url = gygSpotSearchUrl({ name, category: "Museum", city }, gygPartnerId({ GETYOURGUIDE_PARTNER_ID: "AB12CDE" }));
      if (url === null) return true;
      const u = new URL(url);
      return u.hostname === "www.getyourguide.com" && u.searchParams.get("partner_id") === "AB12CDE";
    }));
  });

    it("day link: picks the top-scored bookable stop and skips free or non-landmark stops", () => {
        const day = [
            { name: "Cafe Onion", category: "Cafe", localleyScore: 9 },
            { name: "Gyeongbokgung Palace", category: "Palace", localleyScore: 4 },
            { name: "National Museum of Korea", type: "Museum", localleyScore: 5 },
            { name: "Seoul Forest", category: "Park", localleyScore: 8 },
        ];
        const link = gygDayLink(day, "Seoul", "AB12CDE")!;
        expect(link.spotName).toBe("National Museum of Korea");
        const url = new URL(link.url);
        expect(url.searchParams.get("q")).toBe("National Museum of Korea Seoul");
        expect(url.searchParams.get("cmp")).toBe("localley-day");
        expect(gygDayLink(day.slice(0, 1), "Seoul", "AB12CDE")).toBeNull();
        expect(gygDayLink(day, "Seoul", null)).toBeNull();
        expect(gygDayLink([{ name: "A Temple", category: "Temple" }, { name: "B Tower", category: "Tower" }], "Tokyo", "AB12CDE")!.spotName).toBe("A Temple");
    });
});
