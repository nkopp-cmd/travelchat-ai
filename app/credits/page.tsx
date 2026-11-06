import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo/meta";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Camera } from "@/components/ui/icons";
import { d1PhotoCredits, type D1PhotoCredit } from "@/lib/spots/d1-queries";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Photo credits",
    description: "The photographers and archives behind the place photos on Localley, with each licence.",
    path: "/credits",
  }),
};

// Live public data, edge-cached for an hour (cloudflare/opennext/edge-html-cache.ts).
export const dynamic = "force-dynamic";

function spotName(name: D1PhotoCredit["spotName"]): string {
  if (name && typeof name === "object") return name.en || Object.values(name)[0] || "";
  return typeof name === "string" ? name : "";
}

export default async function CreditsPage() {
  const credits = await d1PhotoCredits();
  const byCity = new Map<string, Map<string, { name: string; photos: D1PhotoCredit[] }>>();
  for (const credit of credits) {
    const city = credit.city || "More places";
    const spots = byCity.get(city) ?? byCity.set(city, new Map()).get(city)!;
    const spot = spots.get(credit.spotId) ?? spots.set(credit.spotId, { name: spotName(credit.spotName), photos: [] }).get(credit.spotId)!;
    spot.photos.push(credit);
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Photo credits", url: "/credits" }]} />
      <PageHeader eyebrow="Photos" eyebrowIcon={Camera} title="Photo credits"
        lede="Every place photo on Localley shows the real place. Many come from photographers who share their work openly. Thank you." />
      <div className="mt-8 space-y-8 text-[15px] leading-7 text-muted-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground">
        <section>
          <h2>Where the photos come from</h2>
          <p>
            Wikimedia Commons (CC0, public domain, CC BY and CC BY-SA licences), the Korea Tourism Organization (KOGL Type 1),
            the Taiwan Tourism Administration (Open Government Data License v1.0, OGDL-Taiwan-1.0), Pexels, and photos that travellers share with us. Google listing photos appear with Google&apos;s own attribution.
            Each photo below links to its source page with the full licence.
          </p>
        </section>
        {[...byCity].map(([city, spots]) => (
          <section key={city}>
            <h2>{city}</h2>
            <ul className="space-y-1 text-sm leading-6">
              {[...spots].map(([id, spot]) => (
                <li key={id}>
                  <Link prefetch={false} href={`/spots/${id}`} className="font-medium text-foreground underline-offset-2 hover:underline">{spot.name}</Link>
                  {": "}
                  {spot.photos.map((photo, index) => (
                    <span key={photo.src}>
                      {index > 0 ? "; " : null}
                      {photo.sourceUrl
                        ? <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{photo.credit}</a>
                        : photo.credit}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-sm">To correct or remove a credit, write to hello@localley.io.</p>
      </div>
    </main>
  );
}
