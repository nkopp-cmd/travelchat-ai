import type { Metadata } from "next";
import { cityAzDescription } from "@/lib/seo/hub-meta";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { PageHeader } from "@/components/layout/page-header";
import { CityTripStoryCard } from "@/components/blog/city-trip-story-card";
import { MapPin } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { IntentLink } from "@/components/navigation/intent-link";
import { plannerCities } from "@/lib/cities-catalog";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { CitySpotAzList, cityAzPath } from "@/components/spots/city-spot-directory";
import { getCityBySlug } from "@/lib/cities";
import { cityDirectory } from "@/lib/spots/city-directory-store";
import { hubIndexable } from "@/lib/seo/spot-indexable";
import { sitemapSpotRows } from "@/lib/seo/sitemap-spots";
import { pageMeta } from "@/lib/seo/meta";
import { cityGuideSpots } from "@/lib/seo/home-links";
import { cityJournalPosts } from "@/lib/blog/posts";

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
  // Push DQ3: both data-cache reads start together (each is an R2/Cache API read plus a D1 tag check).
  const [list, rows] = await Promise.all([findList(slug), sitemapSpotRows().catch(() => [])]);
  // notFound() here (before any body streams) gives a real 404 status, so the edge cache never stores an unknown slug.
  if (!list) notFound();
  const { city, entries } = list;
  // Same thin rule as the hub: a hub out of the index keeps its list out too, links still followed.
  const thin = !hubIndexable(rows, city.name);
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
  // Push DQ1: planner cities load in parallel with the list; a failed load still shows the generic plan link.
  // Push DV2: the sitemap rows (same data-cache read as generateMetadata) give the indexable guide spots for the top block.
  const [list, offered, rows] = await Promise.all([
    findList(slug),
    plannerCities().then((all) => new Set(all.map((c) => c.name)), () => null),
    sitemapSpotRows().catch(() => []),
  ]);
  if (!list) notFound();
  const { city, entries } = list;
  const guides = cityGuideSpots(rows, city.name);
  const planCity = !offered || offered.has(city.name) ? city.name : null;
  const hubPath = `/spots?city=${encodeURIComponent(city.slug)}`;
  const journal = cityJournalPosts(city);
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Spots", url: "/spots" }, { name: city.name, url: hubPath }, { name: "A–Z", url: cityAzPath(city.slug) }]} />
      <PageHeader eyebrow={<Link prefetch={false} href={hubPath} className="hover:underline">Hidden gems in {city.name}</Link>} eyebrowIcon={MapPin}
        title={`All ${entries.length} spots in ${city.name}, A–Z`}
        lede="Every place we list in this city. Open a spot for its Localley Score, local tips and the map, or go back to the city page to filter by category and score."
        actions={
          <Button asChild className="min-h-11">
            <IntentLink href={planCity ? `/itineraries/new?${new URLSearchParams({ city: planCity })}` : "/itineraries/new"} data-testid="az-plan-trip">
              {planCity ? `Plan a free ${planCity} trip` : "Plan a free trip"}
            </IntentLink>
          </Button>
        } />
      <CityTripStoryCard cityName={city.name} />
      {guides.length > 0 && (
        <section aria-labelledby="az-guides" className="mt-6" data-testid="az-guide-spots">
          <h2 id="az-guides" className="text-xl font-black text-foreground">Spots with a full local guide</h2>
          <p className="mt-1 text-sm text-muted-foreground">Our own photos, what to order, when to go and how to get there.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((spot) => (
              <li key={spot.id} className="min-w-0">
                <Link prefetch={false} href={`/spots/${spot.id}`}
                  className="flex min-h-11 min-w-0 items-center rounded-lg bg-raised px-4 py-2 font-semibold text-foreground transition hover:bg-overlay">
                  <span className="truncate">{spot.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CitySpotAzList entries={entries} />
      {/* Push EL1: crawl path from the indexed A-Z hubs to the city's Journal posts and the trip templates. */}
      <section aria-labelledby="az-journal" className="mt-10" data-testid="az-journal">
        <h2 id="az-journal" className="text-xl font-black text-foreground">Plan {city.name} with less guessing</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {journal.map((post) => (
            <li key={post.slug} className="min-w-0">
              <Link prefetch={false} href={`/blog/${post.slug}`}
                className="flex min-h-11 min-w-0 items-center rounded-lg bg-raised px-4 py-2 font-semibold text-foreground transition hover:bg-overlay">
                <span className="truncate">{post.title}</span>
              </Link>
            </li>
          ))}
          <li className="min-w-0">
            <Link prefetch={false} href="/templates"
              className="flex min-h-11 min-w-0 items-center rounded-lg bg-raised px-4 py-2 font-semibold text-foreground transition hover:bg-overlay">
              <span className="truncate">Ready-made trip templates</span>
            </Link>
          </li>
        </ul>
      </section>
      {/* Push DP1: the A-Z hubs are the pages Google indexes best; they get the same no-JS sign-up as the city hub. */}
      <LocalleySignup source="city-az" city={city.slug} heading={`More ${city.name} picks by email`} className="mt-10" />
      <p className="mt-10 text-sm">
        <Link prefetch={false} href={hubPath} className="font-semibold text-primary underline-offset-2 hover:underline">← Best-rated spots in {city.name}</Link>
      </p>
    </div>
  );
}
