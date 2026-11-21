import type { Metadata } from "next";
import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo/meta";
import { PageHeader } from "@/components/layout/page-header";
import { Camera } from "@/components/ui/icons";
import { d1PhotoCredits } from "@/lib/spots/d1-queries";
import { groupCreditsByCity } from "@/lib/credits";
import { LocalleySignup } from "@/components/newsletter/localley-signup";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Photo credits",
    description: "The photographers and archives behind the place photos on Localley, with each licence.",
    path: "/credits",
  }),
  // A licence list, not a landing page: keep it out of the index, follow its links (Push BK2).
  robots: { index: false, follow: true },
};

// Live public data, edge-cached for an hour (cloudflare/opennext/edge-html-cache.ts).
export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const cities = groupCreditsByCity(await d1PhotoCredits());
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Photo credits", url: "/credits" }]} />
      <PageHeader eyebrow="Photos" eyebrowIcon={Camera} title="Photo credits"
        lede="Every place photo on Localley shows the real place. Many come from photographers who share their work openly. Thank you." />
      <div className="mt-8 space-y-8 text-[15px] leading-7 text-muted-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground">
        <section>
          <h2>Where the photos come from</h2>
          <p>
            Wikimedia Commons (CC0, public domain, CC BY and CC BY-SA licences), the Korea Tourism Organization (KOGL Type 1),
            the Taiwan Tourism Administration (Open Government Data License v1.0, OGDL-Taiwan-1.0), Pexels, and photos that travellers share with us. Google listing photos appear with Google&apos;s own attribution.
            Each city page lists every place photo with a link to its source page and the full licence.
          </p>
        </section>
        {cities.length > 0 ? (
          <section>
            <h2>Credits by city</h2>
            <ul className="grid gap-x-6 gap-y-1 text-sm leading-6 sm:grid-cols-2 [&_a]:font-medium [&_a]:text-foreground [&_a]:underline-offset-2 hover:[&_a]:underline">
              {cities.map((city) => (
                <li key={city.slug}>
                  <a href={`/credits/${city.slug}`}>{city.city}</a>
                  {` · ${city.spots.length} ${city.spots.length === 1 ? "place" : "places"}, ${city.photoCount} ${city.photoCount === 1 ? "photo" : "photos"}`}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-sm">To correct or remove a credit, write to hello@localley.io.</p>
        <p>
          <Link href="/itineraries/new" data-testid="credits-plan" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">Plan a free trip</Link>
        </p>
      </div>
      <LocalleySignup source="credits" className="mt-10" />
    </div>
  );
}
