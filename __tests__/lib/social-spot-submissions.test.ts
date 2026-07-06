import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPublicCreditName,
  buildAnonymousContributorEmail,
  extractSocialMetadataFromHtml,
  fetchSocialLinkMetadata,
  maskEmailForCredit,
  normalizeContributorEmail,
  normalizeSocialSpotUrl,
  socialSpotEvidenceSchema,
  socialSpotSubmissionSchema,
} from "@/lib/social-spot-submissions";

describe("social spot submission helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("canonicalizes supported Instagram and TikTok links", () => {
    expect(
      normalizeSocialSpotUrl("http://www.instagram.com/reel/ABC123/?utm_source=ig_web_copy_link#frag"),
    ).toEqual({
      canonicalUrl: "https://www.instagram.com/reel/ABC123",
      platform: "instagram",
      host: "www.instagram.com",
    });

    expect(
      normalizeSocialSpotUrl("https://www.instagram.com/p/IMG123/?igsh=abc"),
    ).toEqual({
      canonicalUrl: "https://www.instagram.com/p/IMG123",
      platform: "instagram",
      host: "www.instagram.com",
    });

    expect(normalizeSocialSpotUrl("https://vm.tiktok.com/ZMh123/?share_item_id=1")).toEqual({
      canonicalUrl: "https://vm.tiktok.com/ZMh123",
      platform: "tiktok",
      host: "vm.tiktok.com",
    });
  });

  it("rejects unsupported or deceptive URLs", () => {
    expect(() => normalizeSocialSpotUrl("ftp://www.instagram.com/reel/ABC123")).toThrow(
      /http or https/i,
    );
    expect(() => normalizeSocialSpotUrl("https://instagram.com.evil.test/reel/ABC123")).toThrow(
      /TikTok and Instagram/i,
    );
    expect(() => normalizeSocialSpotUrl("https://www.instagram.com")).toThrow(
      /direct TikTok or Instagram/i,
    );
  });

  it("normalizes and masks contributor attribution", () => {
    expect(normalizeContributorEmail("  Nils@Example.COM ")).toBe("nils@example.com");
    expect(maskEmailForCredit("nils@example.com")).toBe("ni...@example.com");
    expect(buildPublicCreditName({ email: "nils@example.com", contributorName: "Nils" })).toBe(
      "Nils",
    );
    expect(buildPublicCreditName({ email: "nils@example.com" })).toBe("ni...@example.com");
    expect(buildPublicCreditName({ email: buildAnonymousContributorEmail("https://vm.tiktok.com/ZMh123") })).toBe(
      "Localley contributor",
    );
  });

  it("validates the submission payload shape", () => {
    const result = socialSpotSubmissionSchema.safeParse({
      url: "https://www.instagram.com/reel/ABC123",
      email: "spotter@example.com",
      contributorName: "Spotter",
      cityHint: "Seoul",
      notes: "Tiny cafe from the reel.",
    });

    expect(result.success).toBe(true);
    expect(
      socialSpotSubmissionSchema.safeParse({
        url: "https://www.instagram.com/reel/ABC123",
      }).success,
    ).toBe(true);

    expect(
      socialSpotSubmissionSchema.safeParse({
        url: "https://www.instagram.com/reel/ABC123",
        email: "",
      }).success,
    ).toBe(true);
    expect(
      socialSpotSubmissionSchema.safeParse({
        url: "https://www.instagram.com/reel/ABC123",
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("validates added evidence payloads", () => {
    expect(
      socialSpotEvidenceSchema.safeParse({
        submissionId: "11111111-1111-4111-8111-111111111111",
        canonicalUrl: "https://www.instagram.com/p/IMG123",
        placeHint: "Cafe Saeraul",
      }).success,
    ).toBe(true);

    expect(
      socialSpotEvidenceSchema.safeParse({
        submissionId: "11111111-1111-4111-8111-111111111111",
        canonicalUrl: "https://www.instagram.com/p/IMG123",
      }).success,
    ).toBe(false);

    expect(
      socialSpotEvidenceSchema.safeParse({
        submissionId: "not-a-uuid",
        canonicalUrl: "https://www.instagram.com/p/IMG123",
        placeHint: "Cafe Saeraul",
      }).success,
    ).toBe(false);
  });

  it("extracts social Open Graph metadata", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Hidden Cafe &amp; Alley | TikTok">
          <meta property="og:description" content="Small Seoul cafe">
          <meta property="og:image" content="https://cdn.example.com/photo.jpg">
        </head>
      </html>
    `;

    expect(extractSocialMetadataFromHtml(html, "https://vm.tiktok.com/ZMh123")).toEqual({
      title: "Hidden Cafe & Alley | TikTok",
      description: "Small Seoul cafe",
      imageUrl: "https://cdn.example.com/photo.jpg",
      thumbnailUrl: "https://cdn.example.com/photo.jpg",
      sourceType: "tiktok_post",
      sourceLabel: "TikTok post",
      finalUrl: "https://vm.tiktok.com/ZMh123",
    });
  });

  it("labels Instagram image posts from Open Graph metadata", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Tiny Noodle Bar on Instagram">
          <meta property="og:description" content="Photo by local creator">
          <meta property="og:image:secure_url" content="https://cdn.example.com/insta-photo.jpg">
        </head>
      </html>
    `;

    expect(extractSocialMetadataFromHtml(html, "https://www.instagram.com/p/IMG123")).toMatchObject({
      title: "Tiny Noodle Bar on Instagram",
      description: "Photo by local creator",
      imageUrl: "https://cdn.example.com/insta-photo.jpg",
      thumbnailUrl: "https://cdn.example.com/insta-photo.jpg",
      sourceType: "instagram_post",
      sourceLabel: "Instagram post",
    });
  });

  it("recovers TikTok oEmbed metadata after a short URL redirects to the video URL", async () => {
    const finalUrl = "https://www.tiktok.com/@worththehypesg/video/7220330037893958914";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/oembed") && url.includes("vt.tiktok.com")) {
        return new Response(JSON.stringify({ message: "Something went wrong" }), { status: 400 });
      }

      if (url === "https://vt.tiktok.com/ZSLSUAnYf") {
        return new Response(null, {
          status: 302,
          headers: { location: `${finalUrl}?share_item_id=7220330037893958914` },
        });
      }

      if (url.includes("/oembed") && url.includes("7220330037893958914")) {
        return new Response(
          JSON.stringify({
            title: "Brb in raw crab heaven #hapjeongstation #seoul",
            author_name: "Worth The Hype",
            provider_name: "TikTok",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url === finalUrl) {
        return new Response("<html><head><title>TikTok - Make Your Day</title></head></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata("https://vt.tiktok.com/ZSLSUAnYf");

    expect(metadata).toMatchObject({
      title: "Brb in raw crab heaven #hapjeongstation #seoul",
      description: "Brb in raw crab heaven #hapjeongstation #seoul",
      authorName: "Worth The Hype",
      providerName: "TikTok",
      finalUrl,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
