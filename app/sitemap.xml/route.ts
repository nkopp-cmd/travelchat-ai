import { renderIndex, SITEMAP_HEADERS } from "@/lib/seo/sitemap";
import { sitemapSpotRows } from "@/lib/seo/sitemap-spots";
import { fetchIndexableViralEvents } from "@/lib/viral/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rows, trending] = await Promise.all([sitemapSpotRows(), fetchIndexableViralEvents()]);
  return new Response(renderIndex(rows, trending), { headers: SITEMAP_HEADERS });
}
