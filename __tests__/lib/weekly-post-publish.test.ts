import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { HOST, INDEXNOW_KEY, escapeHtml, holdsPost, indexNowBody, liveCheck, ping, prCreateArgs, reviewMessage } from "../../scripts/weekly-post-publish.mjs";

const title = "Paying in Seoul: cards & T-money";
const pages: Record<string, string> = {
  "/blog/paying-in-seoul": `<h1>${escapeHtml(title)}</h1>`,
  "/blog": '<a href="/blog/paying-in-seoul">',
  "/blog/rss.xml": "<link>https://www.localley.io/blog/paying-in-seoul</link>",
  "/sitemaps/guides.xml": "<loc>https://www.localley.io/blog/paying-in-seoul</loc>",
  [`/${INDEXNOW_KEY}.txt`]: INDEXNOW_KEY,
};
const site = (override: Record<string, [number, string]> = {}) => async (url: string) => {
  const p = url.replace(`https://${HOST}`, "");
  const [status, body] = override[p] ?? (p in pages ? [200, pages[p]] : [404, ""]);
  return { status, text: async () => body };
};

describe("weekly-post-publish", () => {
  it("serves the public key file and pings IndexNow with it", async () => {
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8").trim()).toBe(INDEXNOW_KEY);
    const body = indexNowBody([`https://${HOST}/blog/x`]);
    expect(body).toEqual({ host: HOST, key: INDEXNOW_KEY, keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`, urlList: [`https://${HOST}/blog/x`] });
    const sent: { url: string; init: { body: string } }[] = [];
    const status = await ping(body.urlList, async (url: string, init: { body: string }) => (sent.push({ url, init }), { status: 202 }));
    expect(status).toBe(202);
    expect(sent[0].url).toBe("https://api.indexnow.org/indexnow");
    expect(JSON.parse(sent[0].init.body)).toEqual(body);
  });

  it("checks every page the post touches before the ping", async () => {
    expect(await liveCheck("paying-in-seoul", title, site())).toEqual([]);
    expect(escapeHtml(title)).toBe("Paying in Seoul: cards &amp; T-money");
    const fail = await liveCheck("paying-in-seoul", title, site({ "/sitemaps/guides.xml": [200, "<urlset/>"], "/blog": [503, ""] }));
    expect(fail).toEqual(["/blog: 503", '/sitemaps/guides.xml: 200 without "/blog/paying-in-seoul"']);
  });

  it("finds the post in the live commit only by its own slug", () => {
    const listing = "content/blog/2026-11-02-paying-in-seoul.md\ncontent/blog/2026-11-09-paying-in-bangkok.md";
    expect(holdsPost(listing, "paying-in-bangkok")).toBe(true);
    expect(holdsPost(listing, "bangkok")).toBe(false);
    expect(holdsPost(listing, "paying-in-tokyo")).toBe(false);
  });
});

describe("rule 4: Telegram review before the post goes out", () => {
  it("opens the PR with the hold label so the autopilot cannot merge it first", () => {
    const args = prCreateArgs("paying-in-tokyo", "2026-11-23", "content/blog/2026-11-23-paying-in-tokyo.md");
    expect(args.slice(0, 4)).toEqual(["pr", "create", "--label", "hold"]);
  });
  it("sends the approval phrase, the PR and the text, cut under the Telegram limit", () => {
    const msg = reviewMessage("paying-in-tokyo", "https://github.com/x/pull/1", "a".repeat(9000));
    expect(msg).toContain('"ok blog paying-in-tokyo"');
    expect(msg).toContain("https://github.com/x/pull/1");
    expect(msg.length).toBeLessThan(4096);
  });
});
