import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { guideEntries, pageEntries } from "@/lib/seo/sitemap";

// The Worker has no NEXT_PUBLIC_BASE_URL at runtime; every sitemap URL must be the live www host.
describe("site URL fallback", () => {
  it("uses https://www.localley.io in the sitemap and robots.txt", () => {
    const urls = [...pageEntries(), ...guideEntries()].map((entry) => entry.loc);
    expect(urls[0]).toBe("https://www.localley.io");
    expect(urls).toContain("https://www.localley.io/blog");
    expect(urls.every((url) => url.startsWith("https://www.localley.io"))).toBe(true);
    expect(robots().sitemap).toBe("https://www.localley.io/sitemap.xml");
  });
});
