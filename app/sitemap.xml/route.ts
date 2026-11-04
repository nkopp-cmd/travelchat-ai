import { renderIndex, SITEMAP_HEADERS } from "@/lib/seo/sitemap";
import { sitemapSpotRows } from "@/lib/seo/sitemap-spots";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(renderIndex(await sitemapSpotRows()), { headers: SITEMAP_HEADERS });
}
