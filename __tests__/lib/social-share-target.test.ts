import { describe, expect, it } from "vitest";
import { extractSocialUrl } from "@/lib/social-share-target";

describe("social share target URL extraction", () => {
  it("extracts a supported post URL from shared prose and trims punctuation", () => {
    expect(extractSocialUrl(
      "Worth saving: https://www.instagram.com/p/ABC123/?utm_source=share).",
    )).toBe("https://www.instagram.com/p/ABC123/?utm_source=share");
  });

  it("supports TikTok short links", () => {
    expect(extractSocialUrl("https://vt.tiktok.com/ZSExample/"))
      .toBe("https://vt.tiktok.com/ZSExample/");
  });

  it("rejects deceptive suffixes, credentials, and unrelated URLs", () => {
    expect(extractSocialUrl("https://notinstagram.com/p/ABC123")).toBe("");
    expect(extractSocialUrl("https://user:pass@www.instagram.com/p/ABC123")).toBe("");
    expect(extractSocialUrl("https://example.com/travel")) .toBe("");
  });
});
