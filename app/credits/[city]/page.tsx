import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo/meta";
import { PageHeader } from "@/components/layout/page-header";
import { Camera } from "@/components/ui/icons";
import { d1PhotoCredits } from "@/lib/spots/d1-queries";
import { groupCreditsByCity } from "@/lib/credits";

// Live public data, edge-cached for an hour (cloudflare/opennext/edge-html-cache.ts, CREDITS_CITY_PATH).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ city: string }> };

// One D1 read per request: metadata and page share it.
const findCity = cache(async (slug: string) =>
  groupCreditsByCity(await d1PhotoCredits()).find((city) => city.slug === slug) ?? null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const city = await findCity(slug);
  // notFound() here (before any body streams) gives a real 404 status, so the edge cache never stores an unknown slug.
  if (!city) notFound();
  return pageMeta({
    title: `Photo credits: ${city.city}`,
    description: `The photographers and archives behind the ${city.city} place photos on Localley, with each licence.`,
    path: `/credits/${city.slug}`,
  });
}

export default async function CreditsCityPage({ params }: Props) {
  const { city: slug } = await params;
  const city = await findCity(slug);
  if (!city) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Photo credits", url: "/credits" }, { name: city.city, url: `/credits/${city.slug}` }]} />
      <PageHeader eyebrow={<Link prefetch={false} href="/credits" className="hover:underline">Photo credits</Link>} eyebrowIcon={Camera} title={city.city}
        lede={`${city.spots.length} ${city.spots.length === 1 ? "place" : "places"}, ${city.photoCount} ${city.photoCount === 1 ? "photo" : "photos"}. Each credit links to its source page with the full licence.`} />
      <ul className="mt-8 space-y-1 text-sm leading-6 text-muted-foreground [&_a]:underline-offset-2 hover:[&_a]:underline [&_li>a:first-child]:font-medium [&_li>a:first-child]:text-foreground">
        {city.spots.map((spot) => (
          <li key={spot.id}>
            <a href={`/spots/${spot.id}`}>{spot.name}</a>
            {": "}
            {spot.photos.map((photo, index) => (
              <span key={index}>
                {index > 0 ? "; " : null}
                {photo.sourceUrl ? <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">{photo.credit}</a> : photo.credit}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">To correct or remove a credit, write to hello@localley.io.</p>
    </div>
  );
}
