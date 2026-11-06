import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { guideEntries, pageEntries } from "@/lib/seo/sitemap";
import { clip, pageMeta, shareImage } from "@/lib/seo/meta";
import { readFileSync } from "node:fs";

// The Worker has no NEXT_PUBLIC_BASE_URL at runtime; every sitemap URL must be the live www host.
describe("site URL fallback", () => {
  it("uses https://www.localley.io in the sitemap and robots.txt", () => {
    const urls = [...pageEntries(), ...guideEntries()].map((entry) => entry.loc);
    expect(urls[0]).toBe("https://www.localley.io");
    expect(urls).toContain("https://www.localley.io/blog");
    expect(urls.every((url) => url.startsWith("https://www.localley.io"))).toBe(true);
    expect(robots().sitemap).toBe("https://www.localley.io/sitemap.xml");
  });

  it("allows answer bots and blocks training bots in robots rules", () => {
    const rules = [robots().rules].flat();
    const blocked = (ua: string) => rules.some((r) => [r.userAgent].flat().includes(ua) && r.disallow === "/");
    expect(blocked("ChatGPT-User")).toBe(false);
    expect(blocked("GPTBot")).toBe(true);
    expect(blocked("CCBot")).toBe(true);
  });

  it("gives every page a self canonical, og:image and a bounded description", () => {
    const meta = pageMeta({ title: "Local spots in Seoul", description: "x".repeat(80), path: "/spots?city=seoul" });
    expect(meta.alternates?.canonical).toBe("https://www.localley.io/spots?city=seoul");
    expect(pageMeta({ title: "Home", absoluteTitle: true, description: "d", path: "/" }).alternates?.canonical).toBe("https://www.localley.io/");
    expect(JSON.stringify(meta.openGraph)).toContain("https://");
    expect(meta.title).toEqual({ absolute: "Local spots in Seoul | Localley" });
    expect(shareImage(["/api/places/photo?x=1", "https://cdn.example/a.jpg"])).toBe("https://cdn.example/a.jpg");
    expect(clip("word ".repeat(60), 165).length).toBeLessThanOrEqual(165);
    expect(readFileSync("public/llms.txt", "utf8")).toMatch(/^# Localley\n\n> /);
  });
});
