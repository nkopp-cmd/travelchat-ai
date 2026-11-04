import { guideEntries, pageEntries, parseSitemapFile, renderUrlset, SITEMAP_HEADERS, spotChunk, spotEntries } from "@/lib/seo/sitemap";
import { sitemapSpotRows } from "@/lib/seo/sitemap-spots";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const target = parseSitemapFile((await params).file);
  if (!target) return new Response("Not found", { status: 404 });
  if (target.kind === "pages") return new Response(renderUrlset(pageEntries()), { headers: SITEMAP_HEADERS });
  if (target.kind === "guides") return new Response(renderUrlset(guideEntries()), { headers: SITEMAP_HEADERS });
  const rows = spotChunk(await sitemapSpotRows(), target.n);
  if (!rows) return new Response("Not found", { status: 404 });
  return new Response(renderUrlset(spotEntries(rows)), { headers: SITEMAP_HEADERS });
}
