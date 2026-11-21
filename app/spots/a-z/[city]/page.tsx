import type { Metadata } from "next";
import { cityAzDescription } from "@/lib/seo/hub-meta";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { PageHeader } from "@/components/layout/page-header";
import { MapPin } from "@/components/ui/icons";
import { CitySpotAzList, cityAzPath } from "@/components/spots/city-spot-directory";
import { getCityBySlug } from "@/lib/cities";
import { cityDirectory } from "@/lib/spots/city-directory-store";
import { hubIndexable } from "@/lib/seo/spot-indexable";
import { sitemapSpotRows } from "@/lib/seo/sitemap-spots";
import { pageMeta } from "@/lib/seo/meta";

// Every spot of one city hub, A-Z (Push CB2: moved off the hub, which links here). Live public data, edge-cached for
// an hour like the directory's own data cache (cloudflare/opennext/edge-html-cache.ts, SPOTS_AZ_PATH).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ city: string }> };

// One cached D1 read per request: metadata and page share it.
const findList = cache(async (slug: string) => {
  const city = getCityBySlug(slug);
  if (!city) return null;
  const entries = await cityDirectory(city.slug);
  return entries.length > 0 ? { city, entries } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const list = await findList(slug);
  // notFound() here (before any body streams) gives a real 404 status, so the edge cache never stores an unknown slug.
  if (!list) notFound();
  const { city, entries } = list;
  // Same thin rule as the hub: a hub out of the index keeps its list out too, links still followed.
  const thin = !hubIndexable(await sitemapSpotRows().catch(() => []), city.name);
  return {
    ...pageMeta({
      title: `All ${entries.length} spots in ${city.name}, A–Z`,
      description: cityAzDescription(city.name, city.country),
      path: cityAzPath(city.slug),
    }),
    ...(thin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CitySpotsAzPage({ params }: Props) {
  const { city: slug } = await params;
  const list = await findList(slug);
  if (!list) notFound();
  const { city, entries } = list;
  const hubPath = `/spots?city=${encodeURIComponent(city.slug)}`;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Spots", url: "/spots" }, { name: city.name, url: hubPath }, { name: "A–Z", url: cityAzPath(city.slug) }]} />
      <PageHeader eyebrow={<Link prefetch={false} href={hubPath} className="hover:underline">Hidden gems in {city.name}</Link>} eyebrowIcon={MapPin}
        title={`All ${entries.length} spots in ${city.name}, A–Z`}
        lede="Every place we list in this city. Open a spot for its Localley Score, local tips and the map, or go back to the city page to filter by category and score." />
      <CitySpotAzList entries={entries} />
      <p className="mt-10 text-sm">
        <Link prefetch={false} href={hubPath} className="font-semibold text-primary underline-offset-2 hover:underline">← Best-rated spots in {city.name}</Link>
      </p>
    </div>
  );
}
