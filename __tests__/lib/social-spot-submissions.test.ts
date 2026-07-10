import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPublicCreditName,
  analyzeSocialVideo,
  buildAnonymousContributorEmail,
  extractSocialMetadataFromHtml,
  fetchSocialLinkMetadata,
  maskEmailForCredit,
  normalizeContributorEmail,
  normalizeSocialSpotUrl,
  researchSocialSpotLink,
  socialSpotEvidenceSchema,
  socialSpotSubmissionSchema,
} from "@/lib/social-spot-submissions";

const falMocks = vi.hoisted(() => ({
  config: vi.fn(),
  subscribe: vi.fn(),
  upload: vi.fn(),
}));

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
      "https://cdn.example.com/cover.jpg",
      "https://cdn.example.com/slide-one.jpg?width=1440",
      "https://cdn.example.com/slide-two.jpg?width=1440",
    ]);
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
});
