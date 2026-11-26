import { describe, expect, it } from "vitest";
import { guideEntries, pageEntries } from "@/lib/seo/sitemap";
import { clip, pageMeta, shareImage } from "@/lib/seo/meta";
import { readFileSync } from "node:fs";

// The Worker has no NEXT_PUBLIC_BASE_URL at runtime; every sitemap URL must be the live www host.
describe("site URL fallback", () => {
  it("uses https://www.localley.io in the sitemap", () => {
    const urls = [...pageEntries(), ...guideEntries()].map((entry) => entry.loc);
    expect(urls[0]).toBe("https://www.localley.io");
    expect(urls).toContain("https://www.localley.io/blog");
    expect(urls.every((url) => url.startsWith("https://www.localley.io"))).toBe(true);
    expect(readFileSync("public/robots.txt", "utf8")).toContain("Sitemap: https://www.localley.io/sitemap.xml");
  });

  it("keeps crawlers off the sign-in wall but not off public pages (Push CK3)", () => {
    // Google/Bing robots semantics: '*' matches any run, the longest matching rule wins, Allow wins a tie.
    const rules = readFileSync("public/robots.txt", "utf8").split("\n")
      .map((line) => /^(Allow|Disallow):\s*(\S+)/.exec(line)).filter((m): m is RegExpExecArray => !!m)
      .map(([, kind, path]) => ({ allow: kind === "Allow", path, re: new RegExp(`^${path.replace(/[.?+()[\]^$|{}\\]/g, "\\$&").replace(/\*/g, ".*")}`) }));
    const allowed = (url: string) => {
      const hits = rules.filter((rule) => rule.re.test(url)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
      return hits[0]?.allow ?? true;
    };
    for (const url of ["/spots/377bb2cb-1/tips", "/sign-up?redirect_url=%2Fspots%2Fx%2Ftips", "/sign-in?redirect_url=%2Fdashboard"]) expect(allowed(url), url).toBe(false);
    for (const url of ["/", "/spots/377bb2cb-1", "/spots?city=seoul", "/blog/tips-for-seoul", "/sign-up", "/itineraries/new?city=Seoul"]) expect(allowed(url), url).toBe(true);
  });

  it("slows SEO-tool crawlers and keeps them off share cards, but leaves search engines on the '*' rules (Push DM1)", () => {
    const groups = readFileSync("public/robots.txt", "utf8").split(/\n\s*\n/).map((block) => {
      const lines = block.split("\n").filter((line) => !line.startsWith("#"));
      return {
        agents: lines.filter((l) => l.startsWith("User-agent:")).map((l) => l.split(":")[1].trim()),
        rules: lines.filter((l) => /^(Allow|Disallow|Crawl-delay):/.test(l)).map((l) => l.replace(/\s+/g, " ")),
      };
    }).filter((g) => g.agents.length);
    const star = groups.find((g) => g.agents.includes("*"))!;
    const tools = groups.find((g) => g.agents.includes("AhrefsBot"))!;
    expect(tools.agents).toEqual(expect.arrayContaining(["AhrefsBot", "SemrushBot"]));
    for (const engine of ["Googlebot", "bingbot", "Twitterbot", "facebookexternalhit"]) expect(groups.some((g) => g.agents.includes(engine))).toBe(false);
    expect(tools.rules).toContain("Crawl-delay: 10");
    expect(tools.rules).toContain("Disallow: /spots/*/og");
    expect(star.rules).not.toContain("Disallow: /spots/*/og");
    // A named group replaces '*' for that bot: it must repeat every '*' Disallow.
    for (const rule of star.rules.filter((r) => r.startsWith("Disallow:"))) expect(tools.rules).toContain(rule);
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
