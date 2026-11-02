import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { plainText, runGates, splitPost } from "../../scripts/weekly-post-gates.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { factsFor, postFile } from "../../scripts/weekly-post-draft.mjs";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const data = { pay: read("lib/help/pay.json"), phrases: read("lib/help/source.json"), translations: read("lib/help/translations.json") };
const topic = { kind: "pay", country: "thailand", slug: "paying-in-bangkok", title: "How to pay in Bangkok as a visitor", link: "/help/thailand/pay" };
const facts = factsFor(topic, data);
const filler = "Bring a card and some cash, and keep small notes for food stalls and taxis in the city. ".repeat(14);
const body = (extra = "") => [
  "Cards work in most shops in Bangkok. Keep cash for street food and taxis.",
  "## Do cards work?", filler, `See [our pay page](${topic.link}) for the short version.`,
  "## How much cash?", `A daily reserve of THB500 to 1,000 covers street meals. ${extra} ${filler}`,
  "## Which transit card?", `${filler} [Plan your days](/itineraries/new?city=Bangkok).`,
  "## FAQ", "### Is tipping expected?", "No. Rounding taxi fares is common.",
  "## Sources", ...facts.sources.map((u: string) => `- ${u}`),
].join("\n\n");
const description = "How to pay in Bangkok as a visitor: when cards work, how much cash to carry, transit cards and ATM fees.";
const file = "2026-11-09-paying-in-bangkok.md";
const source = (extra = "", title = topic.title) => postFile({ topic: { ...topic, title }, date: "2026-11-09", description, body: body(extra) });
const ok = () => ({ ok: true, ratio: 0, banned: [] });

describe("weekly-post-gates", () => {
  it("passes a clean post and reads the text a visitor sees", () => {
    expect(runGates({ file, source: source(), others: [], data, analyse: ok })).toEqual([]);
    expect(splitPost(source()).meta.published).toBe("2026-11-09");
    expect(plainText("## Hi\n\n- [pay page](/help) **now**")).not.toMatch(/[#*\[\]()]|\/help/);
  });

  it("fails on a number outside the fact rows, a content-check failure and a duplicate", () => {
    expect(runGates({ file, source: source("Taxis cost THB 73 a ride."), others: [], data, analyse: ok }).join()).toContain("number 73 not in facts");
    const bad = () => ({ ok: false, ratio: 0.2, banned: ["image pending"] });
    expect(runGates({ file, source: source(), others: [], data, analyse: bad })[0]).toMatch(/^content-check: meta 20 %/);
    const others = [{ file: "2026-10-05-bangkok-cash.md", source: source("", "How to pay in Bangkok as a visitor!") }];
    expect(runGates({ file, source: source(), others, data, analyse: ok })).toEqual(["duplicate title 2026-10-05-bangkok-cash.md"]);
    expect(runGates({ file: "2026-11-09-bangkok-winter.md", source: source(), others: [], data, analyse: ok })).toEqual(["fact match: no fact rows for bangkok-winter"]);
  });
});
