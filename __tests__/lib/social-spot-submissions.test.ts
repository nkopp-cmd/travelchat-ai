import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPublicCreditName,
  analyzeSocialVideo,
  buildAnonymousContributorEmail,
  enrichSocialLinkMetadataWithProvider,
  extractSocialMetadataFromHtml,
  fetchSocialLinkMetadata,
  getResearchCandidates,
  isTrustedInstagramMediaUrl,
  maskEmailForCredit,
  normalizeContributorEmail,
  normalizeSocialSpotUrl,
  researchSocialSpotLink,
  SOCIAL_RESEARCH_MAX_CANDIDATES,
  socialSpotEvidenceSchema,
  socialSpotSubmissionSchema,
} from "@/lib/social-spot-submissions";

const falMocks = vi.hoisted(() => ({
  config: vi.fn(),
  subscribe: vi.fn(),
  upload: vi.fn(),
}));

const originalApifyToken = process.env.APIFY_API_TOKEN;

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: falMocks.config,
    subscribe: falMocks.subscribe,
    storage: { upload: falMocks.upload },
  },
}));

function buildTikTokHydrationHtml(itemStruct: Record<string, unknown>): string {
  return `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: {
      "webapp.video-detail": {
        itemInfo: { itemStruct },
      },
    },
  })}</script>`;
}

describe("social spot submission helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalApifyToken === undefined) delete process.env.APIFY_API_TOKEN;
    else process.env.APIFY_API_TOKEN = originalApifyToken;
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
    expect(() => normalizeSocialSpotUrl(
      "https://user:secret@www.instagram.com/p/ABC123",
    )).toThrow(/credentials or custom ports/i);
    expect(() => normalizeSocialSpotUrl(
      "https://www.instagram.com:444/p/ABC123",
    )).toThrow(/credentials or custom ports/i);
    expect(() => normalizeSocialSpotUrl(
      "https://vm.tiktok.com:444/ZMh123",
    )).toThrow(/credentials or custom ports/i);
  });

  it("only trusts HTTPS Instagram and Facebook CDN media URLs", () => {
    expect(isTrustedInstagramMediaUrl(
      "https://scontent.cdninstagram.com/v/video/reel.mp4?token=abc",
    )).toBe(true);
    expect(isTrustedInstagramMediaUrl(
      "https://instagram.ficn3-2.fna.fbcdn.net/v/image/slide.jpg?token=abc",
    )).toBe(true);
    expect(isTrustedInstagramMediaUrl("http://scontent.cdninstagram.com/reel.mp4")).toBe(false);
    expect(isTrustedInstagramMediaUrl("https://scontent.cdninstagram.com:444/reel.mp4")).toBe(false);
    expect(isTrustedInstagramMediaUrl("https://cdninstagram.com.evil.test/reel.mp4")).toBe(false);
    expect(isTrustedInstagramMediaUrl("https://127.0.0.1/reel.mp4")).toBe(false);
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
      mediaUrls: ["https://cdn.example.com/photo.jpg"],
      sourceType: "tiktok_post",
      sourceLabel: "TikTok post",
      videoUrl: null,
      videoDurationSeconds: null,
      mediaAccessStatus: "cover_only",
      finalUrl: "https://vm.tiktok.com/ZMh123",
    });
  });

  it("extracts a trusted TikTok video from hydration data", () => {
    const videoUrl = "https://www.tiktok.com/aweme/v1/play/?video_id=123456789";
    const metadata = extractSocialMetadataFromHtml(
      buildTikTokHydrationHtml({
        video: {
          duration: 27,
          bitrateInfo: [{ PlayAddr: { UrlList: [videoUrl] } }],
        },
      }),
      "https://www.tiktok.com/@localley/video/123456789",
    );

    expect(metadata).toMatchObject({
      videoUrl,
      videoDurationSeconds: 27,
      mediaAccessStatus: "video_ready",
    });
  });

  it("rejects an untrusted private TikTok video URL from hydration data", () => {
    const metadata = extractSocialMetadataFromHtml(
      buildTikTokHydrationHtml({
        video: {
          duration: 12,
          bitrateInfo: [{
            PlayAddr: { UrlList: ["https://127.0.0.1/private-video.mp4"] },
          }],
        },
      }),
      "https://www.tiktok.com/@localley/video/123456789",
    );

    expect(metadata.videoUrl).toBeFalsy();
  });

  it("extracts TikTok image-post slides from hydration data", () => {
    const slideUrls = [
      "https://p16-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/slide-one.jpeg",
      "https://p16-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/slide-two.jpeg",
    ];
    const metadata = extractSocialMetadataFromHtml(
      buildTikTokHydrationHtml({
        imagePost: {
          images: slideUrls.map((url) => ({ imageURL: { urlList: [url] } })),
        },
      }),
      "https://www.tiktok.com/@localley/photo/987654321",
    );

    expect(metadata.mediaUrls).toEqual(slideUrls);
    expect(metadata.mediaAccessStatus).toBe("carousel_images");
    expect(metadata.mediaCompleteness).toBe("complete");
    expect(metadata.mediaItemCount).toBe(2);
    expect(metadata.mediaExtractedCount).toBe(2);
  });

  it("accepts an explicitly identified one-image TikTok photo post", () => {
    const imageUrl = "https://p16-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/photo.jpeg";
    const metadata = extractSocialMetadataFromHtml(
      buildTikTokHydrationHtml({
        imagePost: {
          images: [{ imageURL: { urlList: [imageUrl] } }],
        },
      }),
      "https://www.tiktok.com/@localley/photo/987654321",
    );

    expect(metadata).toMatchObject({
      mediaUrls: [imageUrl],
      mediaAccessStatus: "carousel_images",
      mediaCompleteness: "complete",
      mediaItemCount: 1,
      mediaExtractedCount: 1,
    });
  });

  it("does not mistake multiple TikTok thumbnails for a photo carousel", () => {
    const cover = "https://p16-sign.tiktokcdn-us.com/video/cover.jpeg";
    const alternate = "https://p16-sign.tiktokcdn-us.com/video/alternate.jpeg";
    const html = `
      <meta property="og:image" content="${cover}">
      <script>{"display_url":"${alternate}"}</script>
    `;

    const metadata = extractSocialMetadataFromHtml(
      html,
      "https://www.tiktok.com/@localley/video/123456789",
    );

    expect(metadata.mediaUrls).toEqual([alternate, cover]);
    expect(metadata.mediaAccessStatus).toBe("cover_only");
    expect(metadata.mediaCompleteness).toBeUndefined();
  });

  it("preserves hydration-less TikTok photo carousels recovered from embedded slides", () => {
    const slideOne = "https://p16-sign.tiktokcdn-us.com/photo/one.jpeg";
    const slideTwo = "https://p16-sign.tiktokcdn-us.com/photo/two.jpeg";
    const html = `
      <script>{"display_url":"${slideOne}"}</script>
      <script>{"display_url":"${slideTwo}"}</script>
    `;

    const metadata = extractSocialMetadataFromHtml(
      html,
      "https://www.tiktok.com/@localley/photo/987654321",
    );

    expect(metadata.mediaUrls).toEqual([slideOne, slideTwo]);
    expect(metadata.mediaAccessStatus).toBe("carousel_images");
  });

  it("keeps an identified TikTok video cover-only when its play URL is unavailable", () => {
    const cover = "https://p16-sign.tiktokcdn-us.com/video/cover.jpeg";
    const html = `
      <meta property="og:image" content="${cover}">
      ${buildTikTokHydrationHtml({
        video: {
          duration: 20,
          bitrateInfo: [{ PlayAddr: { UrlList: ["https://127.0.0.1/private.mp4"] } }],
        },
      })}
    `;

    const metadata = extractSocialMetadataFromHtml(
      html,
      "https://www.tiktok.com/@localley/video/123456789",
    );

    expect(metadata).toMatchObject({
      videoUrl: null,
      mediaAccessStatus: "cover_only",
    });
  });

  it("keeps one trusted image from every TikTok carousel slide", () => {
    const slideUrls = Array.from(
      { length: 13 },
      (_, index) => `https://p16-sign.tiktokcdn-us.com/carousel/slide-${index + 1}.jpeg`,
    );
    const metadata = extractSocialMetadataFromHtml(
      buildTikTokHydrationHtml({
        imagePost: {
          images: slideUrls.map((url, index) => ({
            imageURL: {
              urlList: [url, `https://p16-sign.tiktokcdn-us.com/carousel/slide-${index + 1}-small.jpeg`],
            },
          })),
        },
      }),
      "https://www.tiktok.com/@localley/photo/987654321",
    );

    expect(metadata.mediaUrls).toEqual(slideUrls);
  });

  it("does not let a cover-image variant displace the final carousel slide", () => {
    const slideUrls = Array.from(
      { length: SOCIAL_RESEARCH_MAX_CANDIDATES },
      (_, index) => `https://p16-sign.tiktokcdn-us.com/carousel/slide-${index + 1}.jpeg?size=large`,
    );
    const html = `
      <meta property="og:image" content="https://p16-sign.tiktokcdn-us.com/carousel/slide-1.jpeg?size=cover">
      ${buildTikTokHydrationHtml({
        imagePost: {
          images: slideUrls.map((url) => ({ imageURL: { urlList: [url] } })),
        },
      })}
    `;

    const metadata = extractSocialMetadataFromHtml(
      html,
      "https://www.tiktok.com/@localley/photo/987654321",
    );

    expect(metadata.mediaUrls).toHaveLength(SOCIAL_RESEARCH_MAX_CANDIDATES);
    expect(metadata.mediaUrls?.at(-1)).toBe(slideUrls.at(-1));
  });

  it("keeps every distinct candidate beyond the old five-place limit", () => {
    const candidate = (index: number) => ({
      status: "candidate" as const,
      spotName: `Place ${index}`,
      description: `Verified place ${index}.`,
      address: `${index} Seoul-ro, Seoul`,
      city: "Seoul",
      category: "Attraction",
      subcategories: [],
      localleyScore: 4,
      localPercentage: 70,
      bestTime: "Daytime",
      tips: [],
      confidence: 0.9,
      researchSummary: `Verified candidate ${index}.`,
      evidenceUrls: [`https://example.com/place-${index}`],
      imageUrl: null as string | null,
      visualEvidence: `Slide ${index}`,
    });
    const candidates = Array.from({ length: 12 }, (_, index) => candidate(index + 2));

    expect(getResearchCandidates({ ...candidate(1), candidates })).toHaveLength(13);
    expect(SOCIAL_RESEARCH_MAX_CANDIDATES).toBeGreaterThanOrEqual(13);
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

  it("recovers distinct public carousel slide images from embedded post data", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://cdn.example.com/cover.jpg">
          <script type="application/json">
            {"display_url":"https:\\/\\/cdn.example.com\\/slide-one.jpg?width=1440",
             "display_url":"https:\\/\\/cdn.example.com\\/slide-two.jpg?width=1440",
             "display_url":"https:\\/\\/cdn.example.com\\/slide-one.jpg?width=720"}
          </script>
        </head>
      </html>
    `;

    const metadata = extractSocialMetadataFromHtml(
      html,
      "https://www.instagram.com/p/CAROUSEL123",
    );

    expect(metadata.mediaUrls).toEqual([
      "https://cdn.example.com/slide-one.jpg?width=1440",
      "https://cdn.example.com/slide-two.jpg?width=1440",
      "https://cdn.example.com/cover.jpg",
    ]);
  });

  it("recovers every embedded image from a large public carousel", () => {
    const slideUrls = Array.from(
      { length: 13 },
      (_, index) => `https://cdn.example.com/slide-${index + 1}.jpg`,
    );
    const html = `<script>${slideUrls
      .map((url) => `{"display_url":"${url.replaceAll("/", "\\/")}"}`)
      .join("")}</script>`;

    const metadata = extractSocialMetadataFromHtml(
      html,
      "https://www.instagram.com/p/LARGE-CAROUSEL",
    );

    expect(metadata.mediaUrls).toEqual(slideUrls);
  });

  it("prioritizes all embedded Instagram slides over a separate cover rendition", () => {
    const slideUrls = Array.from(
      { length: SOCIAL_RESEARCH_MAX_CANDIDATES },
      (_, index) => `https://cdn.example.com/carousel/slide-${index + 1}.jpg`,
    );
    const html = `
      <meta property="og:image" content="https://cdn.example.com/rendered-cover.jpg">
      <script>${slideUrls
        .map((url) => `{"display_url":"${url.replaceAll("/", "\\/")}"}`)
        .join("")}</script>
    `;

    const metadata = extractSocialMetadataFromHtml(
      html,
      "https://www.instagram.com/p/MAX-CAROUSEL",
    );

    expect(metadata.mediaUrls).toEqual(slideUrls);
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

  it("extracts every trusted image from an Instagram provider carousel", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/CAROUSEL123";
    const slideOne = "https://scontent.cdninstagram.com/v/carousel/slide-one.jpg?size=large";
    const slideTwo = "https://instagram.ficn3-2.fna.fbcdn.net/v/carousel/slide-two.jpg?size=large";
    let actorRequest: RequestInit | undefined;
    let actorUrl = "";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.apify.com/v2/acts/apify~instagram-scraper/")) {
        actorUrl = url;
        actorRequest = init;
        return new Response(JSON.stringify([{
          shortCode: "CAROUSEL123",
          caption: "Two neighborhood places in Seoul\nSave this walk.",
          displayUrl: `${slideOne}&cover=true`,
          images: [slideOne, slideTwo, "https://example.com/untrusted.jpg"],
          childPosts: [
            { displayUrl: slideOne },
            { displayUrl: slideTwo },
          ],
          ownerFullName: "Seoul Walks",
          ownerUsername: "seoulwalks",
        }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === canonicalUrl) {
        return new Response("<html><head><title>Instagram</title></head></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata).toMatchObject({
      description: "Two neighborhood places in Seoul\nSave this walk.",
      imageUrl: slideOne,
      mediaUrls: [slideOne, slideTwo],
      mediaAccessStatus: "carousel_images",
      providerName: "Apify Instagram Scraper",
      extractionProvider: "apify_instagram",
      authorName: "Seoul Walks",
    });
    expect(actorRequest?.headers).toMatchObject({
      authorization: "Bearer apify_test_token",
    });
    const actorSearch = new URL(actorUrl).searchParams;
    expect(actorUrl).not.toContain("apify_test_token");
    expect(Object.fromEntries(actorSearch)).toMatchObject({
      build: "0.0.674",
      maxItems: "1",
      limit: "1",
      maxTotalChargeUsd: "0.01",
      restartOnError: "false",
    });
    expect(JSON.parse(String(actorRequest?.body))).toEqual({
      resultsType: "posts",
      directUrls: [canonicalUrl],
      resultsLimit: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("extracts an Instagram reel for full-video analysis", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/reel/REEL123";
    const reelUrl = "https://scontent.cdninstagram.com/v/video/reel.mp4?token=abc";
    const coverUrl = "https://scontent.cdninstagram.com/v/image/reel-cover.jpg?token=abc";
    let actorBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.apify.com/v2/acts/apify~instagram-scraper/")) {
        actorBody = String(init?.body || "");
        return new Response(JSON.stringify([{
          shortCode: "REEL123",
          caption: "Four temples around Seoul",
          displayUrl: coverUrl,
          videoUrl: reelUrl,
          videoDuration: 24,
          ownerUsername: "localley_creator",
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === canonicalUrl) {
        return new Response("<html><head><title>Instagram</title></head></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata).toMatchObject({
      videoUrl: reelUrl,
      videoDurationSeconds: 24,
      imageUrl: coverUrl,
      mediaAccessStatus: "video_ready",
      sourceType: "instagram_reel",
      extractionProvider: "apify_instagram",
    });
    expect(JSON.parse(actorBody).resultsType).toBe("reels");
  });

  it("resolves an Instagram share URL before invoking the provider once", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const shareUrl = "https://www.instagram.com/share/SHARE123";
    const canonicalUrl = "https://www.instagram.com/p/RESOLVED123";
    const imageUrl = "https://scontent.cdninstagram.com/v/image/resolved.jpg";
    let actorCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === shareUrl) {
        return new Response(null, { status: 302, headers: { location: canonicalUrl } });
      }
      if (url === canonicalUrl) {
        return new Response("<html><head><title>Instagram</title></head></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        actorCalls += 1;
        return new Response(JSON.stringify([{
          shortCode: "RESOLVED123",
          caption: "Resolved post",
          displayUrl: imageUrl,
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(shareUrl);

    expect(actorCalls).toBe(1);
    expect(metadata.finalUrl).toBe(canonicalUrl);
    expect(metadata.imageUrl).toBe(imageUrl);
  });

  it("can defer paid Instagram extraction until after the route checkpoint", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/DEFERRED123";
    const imageUrl = "https://scontent.cdninstagram.com/v/image/deferred.jpg";
    let actorCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<title>Instagram</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        actorCalls += 1;
        return new Response(JSON.stringify([{
          shortCode: "DEFERRED123",
          caption: "Deferred provider result",
          displayUrl: imageUrl,
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const baseMetadata = await fetchSocialLinkMetadata(canonicalUrl, {
      includeInstagramProvider: false,
    });
    expect(actorCalls).toBe(0);
    expect(baseMetadata.extractionProvider).toBeUndefined();

    const enrichedMetadata = await enrichSocialLinkMetadataWithProvider(baseMetadata);
    expect(actorCalls).toBe(1);
    expect(enrichedMetadata).toMatchObject({
      imageUrl,
      extractionProvider: "apify_instagram",
    });
  });

  it("parses the carouselImages provider variant without losing slides", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/IMAGES123";
    const slides = Array.from(
      { length: 20 },
      (_, index) => `https://scontent.cdninstagram.com/v/carousel/slide-${index + 1}.jpg`,
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<title>Instagram</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        return new Response(JSON.stringify([{
          shortCode: "IMAGES123",
          caption: "Twenty places",
          carouselImageCount: 20,
          carouselImages: slides,
          displayUrl: "https://scontent.cdninstagram.com/v/rendered-cover.jpg",
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata.mediaUrls).toEqual(slides);
    expect(metadata.mediaCompleteness).toBe("complete");
    expect(metadata.mediaItemCount).toBe(20);
    expect(metadata.mediaExtractedCount).toBe(20);
  });

  it("uses the largest declared or observed carousel count for completeness", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/PARTIAL123";
    const slide = "https://scontent.cdninstagram.com/v/carousel/only-slide.jpg";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<title>Instagram</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        return new Response(JSON.stringify([{
          shortCode: "PARTIAL123",
          caption: "Three slides, one available",
          carouselImageCount: 1,
          childPosts: [
            { displayUrl: slide },
            {},
            {},
          ],
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata.mediaCompleteness).toBe("partial");
    expect(metadata.mediaItemCount).toBe(3);
    expect(metadata.mediaExtractedCount).toBe(1);
  });

  it("rejects Instagram provider output for a different post", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/EXPECTED123";
    const providerImage = "https://scontent.cdninstagram.com/v/image/wrong.jpg";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.apify.com/")) {
        return new Response(JSON.stringify([{
          shortCode: "DIFFERENT123",
          caption: "Wrong post",
          displayUrl: providerImage,
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === canonicalUrl) {
        return new Response("<meta property=\"og:title\" content=\"Instagram\">", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata.extractionProvider).toBeUndefined();
    expect(metadata.mediaUrls).not.toContain(providerImage);
  });

  it("rejects provider identity URLs that contradict a matching shortcode", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/EXPECTED123";
    const providerImage = "https://scontent.cdninstagram.com/v/image/wrong-url.jpg";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<title>Instagram</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        return new Response(JSON.stringify([{
          shortCode: "EXPECTED123",
          url: "https://www.instagram.com/p/DIFFERENT123",
          caption: "Mismatched identity URL",
          displayUrl: providerImage,
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata.extractionProvider).toBeUndefined();
    expect(metadata.mediaUrls).not.toContain(providerImage);
  });

  it("rejects Instagram provider output without a shortcode", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/EXPECTED123";
    const providerImage = "https://scontent.cdninstagram.com/v/image/missing-id.jpg";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<title>Instagram</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        return new Response(JSON.stringify([{
          caption: "Unbound result",
          displayUrl: providerImage,
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata.extractionProvider).toBeUndefined();
    expect(metadata.mediaUrls).not.toContain(providerImage);
  });

  it("keeps caption-only provider results partial when no media item was verified", async () => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    const canonicalUrl = "https://www.instagram.com/p/CAPTIONONLY123";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<title>Instagram</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        return new Response(JSON.stringify([{
          shortCode: "CAPTIONONLY123",
          caption: "A place is named, but media was unavailable.",
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const metadata = await fetchSocialLinkMetadata(canonicalUrl);

    expect(metadata.extractionProvider).toBe("apify_instagram");
    expect(metadata.mediaCompleteness).toBe("partial");
    expect(metadata.mediaItemCount).toBe(0);
  });

  it("does not invoke the Instagram provider without a server token", async () => {
    delete process.env.APIFY_API_TOKEN;
    const canonicalUrl = "https://www.instagram.com/p/PUBLIC123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<title>Instagram</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const baseMetadata = await fetchSocialLinkMetadata(canonicalUrl, {
      includeInstagramProvider: false,
    });
    const metadata = await enrichSocialLinkMetadataWithProvider(baseMetadata);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(canonicalUrl);
    expect(metadata.mediaCompleteness).toBe("partial");
  });

  it("preserves partial media state when the research model is unavailable", async () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const result = await researchSocialSpotLink({
        canonicalUrl: "https://www.instagram.com/p/PENDINGMEDIA123",
        platform: "instagram",
        metadata: {
          title: "Caption Cafe",
          description: "Provider media was unavailable.",
          imageUrl: "https://scontent.cdninstagram.com/v/image/cover.jpg",
          mediaAccessStatus: "cover_only",
          mediaCompleteness: "partial",
          finalUrl: "https://www.instagram.com/p/PENDINGMEDIA123",
        },
      });

      expect(result.status).toBe("research_pending");
      expect(result.mediaAnalysis).toMatchObject({
        status: "media_partially_extracted",
        analyzedVideoCount: 0,
        totalVideoCount: 0,
      });
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it.each([401, 429, 500])(
    "falls back safely when the Instagram provider returns %s",
    async (status) => {
      process.env.APIFY_API_TOKEN = "apify_test_token";
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const canonicalUrl = "https://www.instagram.com/p/PROVIDERFAIL123";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url === canonicalUrl) {
          return new Response("<meta property=\"og:title\" content=\"Fallback title\">", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        if (url.startsWith("https://api.apify.com/")) {
          return new Response("provider unavailable", { status });
        }
        throw new Error(`Unexpected fetch ${url}`);
      });

      const baseMetadata = await fetchSocialLinkMetadata(canonicalUrl, {
        includeInstagramProvider: false,
      });
      const metadata = await enrichSocialLinkMetadataWithProvider(baseMetadata);

      expect(metadata.title).toBe("Fallback title");
      expect(metadata.extractionProvider).toBeUndefined();
      expect(metadata.mediaCompleteness).toBe("partial");
    },
  );

  it.each([
    ["invalid JSON", "not-json"],
    ["oversized JSON", `[${" ".repeat(2 * 1024 * 1024 + 32)}`],
  ])("falls back safely for %s from the Instagram provider", async (_label, payload) => {
    process.env.APIFY_API_TOKEN = "apify_test_token";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const canonicalUrl = "https://www.instagram.com/p/BADJSON123";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<meta property=\"og:title\" content=\"Fallback title\">", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        return new Response(payload, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const baseMetadata = await fetchSocialLinkMetadata(canonicalUrl, {
      includeInstagramProvider: false,
    });
    const metadata = await enrichSocialLinkMetadataWithProvider(baseMetadata);

    expect(metadata.title).toBe("Fallback title");
    expect(metadata.extractionProvider).toBeUndefined();
    expect(metadata.mediaCompleteness).toBe("partial");
  });

  it("falls back safely when the Instagram provider times out", async () => {
    vi.useFakeTimers();
    process.env.APIFY_API_TOKEN = "apify_test_token";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const canonicalUrl = "https://www.instagram.com/p/TIMEOUT123";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === canonicalUrl) {
        return new Response("<meta property=\"og:title\" content=\"Fallback title\">", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://api.apify.com/")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const pendingMetadata = (async () => {
      const baseMetadata = await fetchSocialLinkMetadata(canonicalUrl, {
        includeInstagramProvider: false,
      });
      return enrichSocialLinkMetadataWithProvider(baseMetadata);
    })();
    await vi.advanceTimersByTimeAsync(12_000);
    const metadata = await pendingMetadata;

    expect(metadata.title).toBe("Fallback title");
    expect(metadata.extractionProvider).toBeUndefined();
    expect(metadata.mediaCompleteness).toBe("partial");
  });

  it("sends the recovered cover image to the research model as visual evidence", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({
        status: "candidate",
        spotName: "Tiny Noodle Bar",
        description: "A neighborhood noodle bar.",
        address: "1 Seoul-ro, Seoul",
        city: "Seoul",
        category: "Restaurant",
        subcategories: ["Noodles"],
        localleyScore: 4,
        localPercentage: 75,
        bestTime: "Lunch",
        tips: ["Arrive before noon"],
        confidence: 0.86,
        researchSummary: "Verified from the cover image and public place evidence.",
        evidenceUrls: ["https://www.instagram.com/p/IMG123"],
        imageUrl: "https://cdn.example.com/cover.jpg",
        visualEvidence: "The storefront name is visible in the cover image.",
        candidates: [],
      }),
    }));

    const result = await researchSocialSpotLink({
      canonicalUrl: "https://www.instagram.com/p/IMG123",
      platform: "instagram",
      metadata: {
        title: "Tiny Noodle Bar",
        description: "Neighborhood noodles",
        imageUrl: "https://cdn.example.com/cover.jpg",
        finalUrl: "https://www.instagram.com/p/IMG123",
      },
      openai: { responses: { create } } as never,
    });

    expect(result.spotName).toBe("Tiny Noodle Bar");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({ type: "input_text" }),
              {
                type: "input_image",
                image_url: "https://cdn.example.com/cover.jpg",
                detail: "high",
              },
            ]),
          }),
        ]),
      }),
      expect.objectContaining({ timeout: 45_000, maxRetries: 0 }),
    );
  });

  it("includes injected video analysis and preserves multiple research candidates", async () => {
    const videoAnalysis = "Frames identify Cafe Alpha in Seongsu and Bookshop Beta nearby.";
    const videoAnalyzer = vi.fn(async () => videoAnalysis);
    const candidate = (spotName: string, address: string) => ({
      status: "candidate",
      spotName,
      description: `${spotName} appears in the TikTok video.`,
      address,
      city: "Seoul",
      category: "Cafe",
      subcategories: [],
      localleyScore: 4,
      localPercentage: 80,
      bestTime: "Afternoon",
      tips: [],
      confidence: 0.88,
      researchSummary: `Verified ${spotName}.`,
      evidenceUrls: ["https://www.tiktok.com/@localley/video/123456789"],
      imageUrl: null,
      visualEvidence: null,
    });
    const alpha = candidate("Cafe Alpha", "1 Seongsu-ro, Seoul");
    const beta = candidate("Bookshop Beta", "2 Seongsu-ro, Seoul");
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({
        ...alpha,
        candidates: [alpha, beta],
      }),
    }));

    const result = await researchSocialSpotLink({
      canonicalUrl: "https://www.tiktok.com/@localley/video/123456789",
      platform: "tiktok",
      metadata: {
        title: "Two quiet places in Seongsu",
        description: "A cafe and bookshop walk",
        imageUrl: null,
        videoUrl: "https://www.tiktok.com/aweme/v1/play/?video_id=123456789",
        videoDurationSeconds: 27,
        mediaAccessStatus: "video_ready",
        finalUrl: "https://www.tiktok.com/@localley/video/123456789",
      },
      videoAnalyzer,
      openai: { responses: { create } } as never,
    });

    expect(videoAnalyzer).toHaveBeenCalledWith({
      videoUrl: "https://www.tiktok.com/aweme/v1/play/?video_id=123456789",
      durationSeconds: 27,
    });
    const request = create.mock.calls[0]?.[0] as {
      input: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    };
    const promptText = request.input
      .find((message) => message.role === "user")
      ?.content.find((content) => content.type === "input_text")?.text;
    expect(promptText).toContain(videoAnalysis);
    expect(result.candidates.map((item) => item.spotName)).toEqual([
      "Cafe Alpha",
      "Bookshop Beta",
    ]);
  });

  it("marks a multi-video carousel partial after analyzing only one retained video", async () => {
    const firstVideo = "https://scontent.cdninstagram.com/v/video/one.mp4";
    const secondVideo = "https://scontent.cdninstagram.com/v/video/two.mp4";
    const videoAnalyzer = vi.fn(async () => '{"places":["Cafe Alpha"]}');
    const candidate = {
      status: "candidate" as const,
      spotName: "Cafe Alpha",
      description: "A verified neighborhood cafe.",
      address: "1 Seongsu-ro, Seoul",
      city: "Seoul",
      category: "Cafe",
      subcategories: [],
      localleyScore: 4,
      localPercentage: 80,
      bestTime: "Afternoon",
      tips: [],
      confidence: 0.88,
      researchSummary: "Verified Cafe Alpha.",
      evidenceUrls: ["https://www.instagram.com/p/MIXED123"],
      imageUrl: null,
      visualEvidence: null,
    };
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({ ...candidate, candidates: [candidate] }),
    }));

    const result = await researchSocialSpotLink({
      canonicalUrl: "https://www.instagram.com/p/MIXED123",
      platform: "instagram",
      metadata: {
        title: "Mixed carousel",
        description: "Several clips",
        imageUrl: null,
        videoUrl: firstVideo,
        videoUrls: [firstVideo, secondVideo],
        mediaAccessStatus: "video_ready",
        mediaCompleteness: "complete",
        finalUrl: "https://www.instagram.com/p/MIXED123",
      },
      videoAnalyzer,
      openai: { responses: { create } } as never,
    });

    expect(videoAnalyzer).toHaveBeenCalledOnce();
    expect(videoAnalyzer).toHaveBeenCalledWith({
      videoUrl: firstVideo,
      durationSeconds: undefined,
    });
    expect(result.mediaAnalysis).toMatchObject({
      status: "video_partially_analyzed",
      analyzedVideoCount: 1,
      totalVideoCount: 2,
    });
    expect(result.mediaAnalysis?.output).toContain("PARTIAL VIDEO COVERAGE");
  });

  it.each(["returns no result", "throws"])(
    "keeps zero-of-many video coverage partial when the analyzer %s",
    async (failureMode) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const firstVideo = "https://scontent.cdninstagram.com/v/video/one.mp4";
      const secondVideo = "https://scontent.cdninstagram.com/v/video/two.mp4";
      const videoAnalyzer = failureMode === "throws"
        ? vi.fn(async () => { throw new Error("video unavailable"); })
        : vi.fn(async () => null);
      const candidate = {
        status: "candidate" as const,
        spotName: "Caption Cafe",
        description: "A cafe named in the caption.",
        address: "1 Seongsu-ro, Seoul",
        city: "Seoul",
        category: "Cafe",
        subcategories: [],
        localleyScore: 4,
        localPercentage: 75,
        bestTime: "Afternoon",
        tips: [],
        confidence: 0.82,
        researchSummary: "Caption evidence only.",
        evidenceUrls: ["https://www.instagram.com/p/ZERO123"],
        imageUrl: null,
        visualEvidence: null,
      };
      const create = vi.fn(async () => ({
        output_text: JSON.stringify({ ...candidate, candidates: [candidate] }),
      }));

      const result = await researchSocialSpotLink({
        canonicalUrl: "https://www.instagram.com/p/ZERO123",
        platform: "instagram",
        metadata: {
          title: "Mixed video carousel",
          description: "Two clips",
          imageUrl: null,
          videoUrl: firstVideo,
          videoUrls: [firstVideo, secondVideo],
          mediaAccessStatus: "video_ready",
          mediaCompleteness: "complete",
          finalUrl: "https://www.instagram.com/p/ZERO123",
        },
        videoAnalyzer,
        openai: { responses: { create } } as never,
      });

      expect(result.mediaAnalysis).toMatchObject({
        status: "video_partially_analyzed",
        analyzedVideoCount: 0,
        totalVideoCount: 2,
      });
    },
  );

  it("keeps valid places when one model candidate has malformed optional URLs", async () => {
    const candidate = (index: number) => ({
      status: "candidate" as const,
      spotName: `Verified Place ${index}`,
      description: `Verified place ${index}.`,
      address: `${index} Seoul-ro, Seoul`,
      city: "Seoul",
      category: "Attraction",
      subcategories: [],
      localleyScore: 4,
      localPercentage: 70,
      bestTime: "Daytime",
      tips: [],
      confidence: 0.9,
      researchSummary: `Verified candidate ${index}.`,
      evidenceUrls: [`https://example.com/place-${index}`],
      imageUrl: null as string | null,
      visualEvidence: null,
    });
    const primary = candidate(1);
    const nested = Array.from({ length: 12 }, (_, index) => candidate(index + 2));
    nested[5] = {
      ...nested[5],
      evidenceUrls: ["ftp://example.com/not-web-evidence", "https://example.com/recovered"],
      imageUrl: "javascript:alert(1)",
    };
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({ ...primary, candidates: [primary, ...nested] }),
    }));

    const result = await researchSocialSpotLink({
      canonicalUrl: "https://www.instagram.com/p/MULTI123",
      platform: "instagram",
      metadata: {
        title: "Thirteen places",
        description: "A large carousel",
        imageUrl: null,
        finalUrl: "https://www.instagram.com/p/MULTI123",
      },
      openai: { responses: { create } } as never,
    });

    expect(result.candidates).toHaveLength(13);
    expect(result.candidates.map((item) => item.spotName)).toContain("Verified Place 7");
    const recovered = result.candidates.find((item) => item.spotName === "Verified Place 7");
    expect(recovered?.evidenceUrls).toEqual(["https://example.com/recovered"]);
    expect(recovered?.imageUrl).toBeNull();
  });

  it("falls back to image and text research when video analysis fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const videoAnalyzer = vi.fn(async () => {
      throw new Error("video unavailable");
    });
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({
        status: "candidate",
        spotName: "Fallback Cafe",
        description: "Verified from the cover image and caption.",
        address: "3 Seongsu-ro, Seoul",
        city: "Seoul",
        category: "Cafe",
        subcategories: [],
        localleyScore: 4,
        localPercentage: 78,
        bestTime: "Morning",
        tips: [],
        confidence: 0.82,
        researchSummary: "The fallback evidence identifies the cafe.",
        evidenceUrls: ["https://www.tiktok.com/@localley/video/123456789"],
        imageUrl: "https://cdn.example.com/fallback-cover.jpg",
        visualEvidence: "The cafe name is visible on the cover.",
        candidates: [],
      }),
    }));

    const result = await researchSocialSpotLink({
      canonicalUrl: "https://www.tiktok.com/@localley/video/123456789",
      platform: "tiktok",
      metadata: {
        title: "Fallback Cafe",
        description: "A quiet cafe in Seongsu",
        imageUrl: "https://cdn.example.com/fallback-cover.jpg",
        mediaUrls: ["https://cdn.example.com/fallback-cover.jpg"],
        videoUrl: "https://www.tiktok.com/aweme/v1/play/?video_id=123456789",
        mediaAccessStatus: "video_ready",
        finalUrl: "https://www.tiktok.com/@localley/video/123456789",
      },
      videoAnalyzer,
      openai: { responses: { create } } as never,
    });

    expect(videoAnalyzer).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              {
                type: "input_image",
                image_url: "https://cdn.example.com/fallback-cover.jpg",
                detail: "high",
              },
            ]),
          }),
        ]),
      }),
      expect.objectContaining({ timeout: 45_000, maxRetries: 0 }),
    );
    expect(result.spotName).toBe("Fallback Cafe");
  });

  it("uploads a bounded TikTok video before FAL analysis", async () => {
    const previousFalKey = process.env.FAL_KEY;
    process.env.FAL_KEY = "fal_test";
    falMocks.subscribe.mockReset();
    falMocks.upload.mockReset();
    falMocks.subscribe.mockResolvedValueOnce({
      data: { output: '{"places":["Cafe Alpha"]}' },
    });
    falMocks.upload.mockResolvedValueOnce("https://fal.media/localley-video.mp4");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://v19-web-newkey.tiktokcdn.com/video.mp4" },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "4" },
      }));

    try {
      const output = await analyzeSocialVideo({
        videoUrl: "https://www.tiktok.com/aweme/v1/play/?video_id=123456789",
        durationSeconds: 17,
      });

      expect(output).toBe('{"places":["Cafe Alpha"]}');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(falMocks.upload).toHaveBeenCalledOnce();
      const uploadedBlob = falMocks.upload.mock.calls[0]?.[0] as Blob;
      expect(uploadedBlob.type).toBe("video/mp4");
      expect(uploadedBlob.size).toBe(4);
      expect(falMocks.subscribe).toHaveBeenNthCalledWith(
        1,
        "fal-ai/video-understanding",
        expect.objectContaining({
          input: expect.objectContaining({
            video_url: "https://fal.media/localley-video.mp4",
          }),
        }),
      );
    } finally {
      if (previousFalKey === undefined) delete process.env.FAL_KEY;
      else process.env.FAL_KEY = previousFalKey;
    }
  });

  it("uploads a trusted Instagram reel before FAL analysis", async () => {
    const previousFalKey = process.env.FAL_KEY;
    process.env.FAL_KEY = "fal_test";
    falMocks.subscribe.mockReset();
    falMocks.upload.mockReset();
    falMocks.subscribe.mockResolvedValueOnce({
      data: { output: '{"places":["Temple One","Temple Two"]}' },
    });
    falMocks.upload.mockResolvedValueOnce("https://fal.media/localley-instagram-reel.mp4");
    const reelUrl = "https://scontent.cdninstagram.com/v/video/reel.mp4?token=abc";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([4, 5, 6, 7]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "4" },
      }),
    );

    try {
      const output = await analyzeSocialVideo({
        videoUrl: reelUrl,
        durationSeconds: 24,
      });

      expect(output).toBe('{"places":["Temple One","Temple Two"]}');
      expect(fetchMock).toHaveBeenCalledWith(
        reelUrl,
        expect.objectContaining({
          headers: expect.objectContaining({ referer: "https://www.instagram.com/" }),
        }),
      );
      expect(falMocks.upload).toHaveBeenCalledOnce();
      expect(falMocks.subscribe).toHaveBeenCalledWith(
        "fal-ai/video-understanding",
        expect.objectContaining({
          input: expect.objectContaining({
            video_url: "https://fal.media/localley-instagram-reel.mp4",
          }),
        }),
      );
    } finally {
      if (previousFalKey === undefined) delete process.env.FAL_KEY;
      else process.env.FAL_KEY = previousFalKey;
    }
  });

  it.each([
    "https://127.0.0.1/private.mp4",
    "https://cdninstagram.com.evil.test/video.mp4",
    "https://user:secret@scontent.cdninstagram.com/video.mp4",
    "https://scontent.cdninstagram.com:444/video.mp4",
  ])("rejects an Instagram media redirect to %s", async (redirectUrl) => {
    const previousFalKey = process.env.FAL_KEY;
    process.env.FAL_KEY = "fal_test";
    falMocks.subscribe.mockReset();
    falMocks.upload.mockReset();
    const reelUrl = "https://scontent.cdninstagram.com/v/video/reel.mp4";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: redirectUrl },
      }),
    );

    try {
      await expect(analyzeSocialVideo({ videoUrl: reelUrl })).rejects.toThrow(
        /untrusted media location/i,
      );
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(falMocks.upload).not.toHaveBeenCalled();
    } finally {
      if (previousFalKey === undefined) delete process.env.FAL_KEY;
      else process.env.FAL_KEY = previousFalKey;
    }
  });
});
