import { describe, expect, it } from "vitest";
import { HELP_COUNTRIES, helpCountry, helpPhrases } from "@/lib/help/phrases";
import source from "@/lib/help/source.json";

const ids = source.categories.flatMap((c) => c.phrases.map((p) => p.id));

describe("help phrase cards", () => {
  it.each(HELP_COUNTRIES.map((c) => [c.slug]))("%s has every phrase in its language", (slug) => {
    const country = helpCountry(slug)!;
    const phrases = helpPhrases(country).flatMap((g) => g.phrases);
    expect(phrases.map((p) => p.id)).toEqual(ids);
    for (const phrase of phrases) {
      expect(phrase.text.trim()).not.toBe("");
      // A number placeholder in English must survive translation, or the card shows a wrong request.
      expect(phrase.text.includes("{n}")).toBe(phrase.en.includes("{n}"));
      if (country.language !== "en") expect(phrase.roman?.trim()).toBeTruthy();
    }
  });

  it("keeps phrase ids unique and categories titled", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of helpPhrases(HELP_COUNTRIES[0])) expect(group.title).not.toBe(group.id);
  });

  it("returns undefined for an unknown country", () => {
    expect(helpCountry("mars")).toBeUndefined();
  });
});
