import type { Metadata } from "next";

// Page-level SEO metadata (shared/plans/seo-full.md): one self canonical, og + twitter with an image, per page.
// Next.js replaces (not merges) a parent's openGraph/twitter when a page sets its own, so every page that sets
// openGraph must carry the image again. Use this helper instead of hand-written openGraph blocks.

export const SITE_URL = "https://www.localley.io";
export const SITE_NAME = "Localley";
export const DEFAULT_OG_IMAGE = "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200&h=630&auto=format&fit=crop";

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** First absolute http(s) image in the list, else the default share image. */
export function shareImage(candidates: readonly (string | null | undefined)[] = []): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (/^https:\/\//.test(candidate)) return candidate;
    if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.startsWith("/api/")) return absoluteUrl(candidate);
  }
  return DEFAULT_OG_IMAGE;
}

interface PageMetaInput {
  /** Document title; " | Localley" is appended unless absoluteTitle is set. Always absolute: a layout with a
   *  plain string title (app/spots/layout.tsx) stops the root template for its children. */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  /** Path (with query only when the query is part of the indexable URL, e.g. /spots?city=seoul). */
  path: string;
  image?: string;
  type?: "website" | "article";
  /** Social title; defaults to the title. */
  socialTitle?: string;
}

export function pageMeta({ title, absoluteTitle, description, path, image, type = "website", socialTitle }: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const img = image ?? DEFAULT_OG_IMAGE;
  const social = socialTitle ?? title;
  return {
    title: { absolute: absoluteTitle ? title : `${title} | ${SITE_NAME}` },
    description,
    alternates: { canonical: url },
    openGraph: { title: social, description, url, siteName: SITE_NAME, type, locale: "en_US", images: [{ url: img }] },
    twitter: { card: "summary_large_image", title: social, description, images: [img] },
  };
}

/** Clip to max chars on a word boundary (meta descriptions: 50-170 chars). */
export function clip(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}
