import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Motion lives in --ll-motion-* tokens (styles/borderless-tokens.css), so one place sets the
// feel and reduced motion turns every token-based duration off.
describe("motion tokens", () => {
  it("keeps easing curves out of globals.css", async () => {
    const css = await readFile(resolve("app/globals.css"), "utf8");
    expect(css.match(/cubic-bezier\([^)]*\)/g) ?? []).toEqual([]);
  });

  it("zeroes every motion duration token under reduced motion", async () => {
    const tokens = await readFile(resolve("styles/borderless-tokens.css"), "utf8");
    const [base, reduced] = tokens.split("@media (prefers-reduced-motion: reduce)");
    const durations = [...base.matchAll(/(--ll-motion-[a-z]+):\s*\d+ms/g)].map((match) => match[1]);
    expect(durations).toEqual(["--ll-motion-short", "--ll-motion-medium", "--ll-motion-long"]);
    for (const name of durations) expect(reduced).toMatch(new RegExp(`${name}:\\s*0ms`));
  });
});
