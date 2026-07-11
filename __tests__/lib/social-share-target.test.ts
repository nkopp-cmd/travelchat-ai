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

  it("supports direct TikTok photo posts and rejects profile shares", () => {
    expect(extractSocialUrl("https://www.tiktok.com/@creator/photo/7412345678901234567"))
      .toBe("https://www.tiktok.com/@creator/photo/7412345678901234567");
    expect(extractSocialUrl("https://www.instagram.com/localley/")) .toBe("");
    expect(extractSocialUrl("https://www.tiktok.com/@localley")) .toBe("");
  });

  it("accepts Instagram share redirects", () => {
    expect(extractSocialUrl("https://www.instagram.com/share/SHARE123?igsh=abc")).toBe(
      "https://www.instagram.com/share/SHARE123?igsh=abc",
    );
    expect(extractSocialUrl("https://www.instagram.com/share/reel/SHARE123")).toBe(
      "https://www.instagram.com/share/reel/SHARE123",
    );
  });

  it("rejects deceptive suffixes, credentials, and unrelated URLs", () => {
    expect(extractSocialUrl("https://notinstagram.com/p/ABC123")).toBe("");
    expect(extractSocialUrl("https://user:pass@www.instagram.com/p/ABC123")).toBe("");
    expect(extractSocialUrl("https://example.com/travel")) .toBe("");
  });
});
