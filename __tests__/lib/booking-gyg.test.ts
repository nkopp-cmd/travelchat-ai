import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gygPartnerId, gygSpotSearchUrl, isGygSpotCategory } from "@/lib/booking/gyg";

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
});
