import { describe, expect, it, vi } from "vitest";

// Push DL1: /trending/<slug> set openGraph without images, which dropped the root og:image (seo-check FAIL).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/viral/events", () => ({
  fetchViralEvent: vi.fn(async (slug: string) => slug === "bieber-seoul-2026-10"
    ? { event: { slug, label: "Justin Bieber in Seoul, Oct 2026", articleCount: 46 }, spots: Array.from({ length: 8 }, () => ({ spot: {}, note: null })) }
    : null),
}));
vi.mock("@/components/spots/spot-card", () => ({ SpotCard: () => null }));
vi.mock("@/components/spots/spot-card-events", () => ({ SpotCardEvents: () => null }));

const { generateMetadata } = await import("@/app/trending/[slug]/page");
const { DEFAULT_OG_IMAGE } = await import("@/lib/seo/meta");

describe("trending event metadata", () => {
  it("carries event title, canonical, og image and twitter tags", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "bieber-seoul-2026-10" }) });
    expect(meta.title).toEqual({ absolute: "Justin Bieber in Seoul, Oct 2026: every spot | Localley" });
    expect(meta.alternates?.canonical).toBe("https://www.localley.io/trending/bieber-seoul-2026-10");
    expect(meta.openGraph?.title).toBe("Justin Bieber in Seoul, Oct 2026: every spot");
    expect(meta.openGraph?.images).toEqual([{ url: DEFAULT_OG_IMAGE }]);
    expect(meta.twitter).toMatchObject({ title: "Justin Bieber in Seoul, Oct 2026: every spot", images: [DEFAULT_OG_IMAGE] });
    expect(meta.description).toBe("8 places from 46 news reports, on a map you can add to your trip.");
  });

  it("keeps an unknown event out of the index", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "nope" }) });
    expect(meta.robots).toEqual({ index: false });
  });
});
