import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  checkDraft,
  draftPost,
  factsFor,
  MAX_ATTEMPTS,
  // @ts-expect-error -- plain ESM script without type declarations
} from "../../scripts/weekly-post-draft.mjs";
import { parsePost } from "@/lib/blog/posts";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const data = { pay: read("lib/help/pay.json"), phrases: read("lib/help/source.json"), translations: read("lib/help/translations.json") };
const payTopic = { kind: "pay", country: "thailand", slug: "paying-in-bangkok", title: "How to pay in Bangkok", link: "/help/thailand/pay" };
const facts = factsFor(payTopic, data);

// A body that passes every check: enough words, 3 sub-question headings, FAQ, Sources, numbers from the facts only.
function goodBody(extra = "") {
  const filler = "Bring a card and some cash, and keep small notes for food stalls and taxis in the city. ".repeat(14);
  return [
    "Cards work in most shops in Bangkok. Keep cash for street food and taxis.",
    "## Do cards work?", filler, `See [our pay page](${payTopic.link}) for the short version.`,
    "## How much cash?", `A daily reserve of THB500 to 1,000 covers street meals. ${filler}`,
    "## Which transit card?", `${filler} [Plan your days](/itineraries/new?city=Bangkok).`,
    "## FAQ", "### Is tipping expected?", "No. Rounding taxi fares is common.", extra,
    "## Sources", ...facts.sources.map((u: string) => `- ${u}`),
  ].join("\n\n");
}
const description = "How to pay in Bangkok as a visitor: when cards work, how much cash to carry, transit cards and ATM fees.";

describe("weekly-post-draft", () => {
  it("takes facts only from our data and skips topics without them", () => {
    expect(facts.checkedAt).toBe(data.pay.checkedAt);
    expect(facts.lines.some((l: string) => l.startsWith("atm: "))).toBe(true);
    expect(facts.sources.length).toBeGreaterThan(0);
    const phrase = factsFor({ kind: "phrases", country: "korea", category: "food", link: "/help/korea/menu" }, data);
    expect(phrase.lines.length).toBe(data.phrases.categories.find((c: { id: string }) => c.id === "food").phrases.length);
    expect(factsFor({ kind: "season", slug: "seoul-winter-day-plan", link: "/x" }, data)).toBeNull();
    expect(buildPrompt(payTopic, facts, "2026-11-02")).toContain("Use ONLY the facts below");
  });

  it("passes a clean draft and rejects tells, foreign links and invented numbers", () => {
    expect(checkDraft({ description, body: goodBody() }, facts)).toEqual([]);
    expect(checkDraft({ description, body: goodBody("A vibrant city to delve into.") }, facts)).toEqual(
      expect.arrayContaining([expect.stringMatching(/tell .*vibrant/), expect.stringMatching(/tell .*delve/)]),
    );
    expect(checkDraft({ description, body: goodBody("Read [this](https://example.com/blog).") }, facts)).toContain("link https://example.com/blog");
    expect(checkDraft({ description, body: goodBody("A taxi costs THB 4,321.") }, facts)).toContain("number 4321 not in facts");
    expect(checkDraft({ description, body: "Too short.\n\n## FAQ" }, facts)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^words /), "no Sources", `no link to ${payTopic.link}`]),
    );
  });

  it("stops after the attempt limit and writes a parseable post on success", () => {
    const prompts: string[] = [];
    const failed = draftPost({ date: "2026-11-02", data, files: [], slug: "paying-in-bangkok", generate: (p: string) => { prompts.push(p); return { description, body: "short" }; } });
    expect(failed.ok).toBe(false);
    expect(prompts).toHaveLength(MAX_ATTEMPTS);
    expect(prompts[1]).toContain("Your previous draft failed these checks: words 1");

    const spaced = goodBody().replace(`](${payTopic.link})`, `]( ${payTopic.link} )`);
    expect(draftPost({ date: "2026-11-02", data, files: [], slug: "paying-in-bangkok", generate: () => ({ description, body: spaced }) }).ok).toBe(true);

    const ok = draftPost({ date: "2026-11-02", data, files: [], slug: "paying-in-bangkok", generate: () => ({ description, body: goodBody() }) });
    expect(ok.ok).toBe(true);
    expect(ok.file).toBe("2026-11-02-paying-in-bangkok.md");
    const post = parsePost(ok.file, ok.source);
    expect(post.title).toContain("Bangkok");
    expect(post.published).toBe("2026-11-02");

    const none = draftPost({ date: "2026-11-02", data, files: [], slug: "seoul-winter-day-plan", generate: () => { throw new Error("must not call"); } });
    expect(none.ok).toBe(false);
  });
});
