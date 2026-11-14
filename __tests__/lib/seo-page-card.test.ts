import { describe, expect, it } from "vitest";
import { HELP_COUNTRIES } from "@/lib/help/phrases";
import { PAGE_CARD_KEYS, pageCard, pageCardImage } from "@/lib/seo/page-card";
import { TIER_CONFIGS } from "@/lib/subscription";

describe("page share cards", () => {
  it("covers home, pricing, templates, help and every help country page", () => {
    for (const key of ["home", "pricing", "templates", "help"]) expect(pageCard(key)).not.toBeNull();
    for (const country of HELP_COUNTRIES) {
      for (const suffix of ["", "-pay", "-menu", "-open"]) expect(pageCard(`help-${country.slug}${suffix}`)).not.toBeNull();
    }
    expect(PAGE_CARD_KEYS).toHaveLength(4 + HELP_COUNTRIES.length * 4);
  });

  it("keeps every card short enough for two headline lines and URL-safe keys", () => {
    for (const key of PAGE_CARD_KEYS) {
      expect(key).toMatch(/^[a-z0-9-]+$/);
      const card = pageCard(key)!;
      expect(card.headline.length).toBeLessThanOrEqual(52);
      expect(card.subline.length).toBeLessThanOrEqual(60);
    }
  });

  it("states the real Pro price on the pricing card", () => {
    expect(pageCard("pricing")!.subline).toContain(`$${TIER_CONFIGS.pro.price} a month`);
  });

  it("returns absolute URLs and rejects unknown keys", () => {
    expect(pageCardImage("home")).toMatch(/^https:\/\/(www\.)?localley\.io\/og\/pages\/home$/);
    expect(pageCard("constructor")).toBeNull();
    expect(() => pageCardImage("nope")).toThrow();
  });
});
