import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

// The Worker has no NEXT_PUBLIC_BASE_URL at runtime; the fallback must be the live host.
describe("site URL fallback", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses https://www.localley.io in the sitemap and robots.txt", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls[0]).toBe("https://www.localley.io");
    expect(urls).toContain("https://www.localley.io/blog");
    expect(urls.every((url) => url.startsWith("https://www.localley.io"))).toBe(true);
    expect(robots().sitemap).toBe("https://www.localley.io/sitemap.xml");
  });
});
