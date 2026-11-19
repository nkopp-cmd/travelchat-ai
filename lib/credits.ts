import type { D1PhotoCredit } from "@/lib/spots/d1-queries";

// Push AS3: /credits held all ~650 spots in one page (151 kB gzip HTML, mobile LCP 1.6 s), because the RSC payload
// repeats the whole list. The index now links one page per city (/credits/<slug>), each a small part of the list.

export type CreditSpot = { id: string; name: string; photos: { credit: string; sourceUrl: string | null }[] };
export type CreditCity = { slug: string; city: string; spots: CreditSpot[]; photoCount: number };

const OTHER_CITY = "More places";

export function creditCitySlug(city: string): string {
  return city.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "more-places";
}

function spotName(name: D1PhotoCredit["spotName"]): string {
  if (name && typeof name === "object") return name.en || Object.values(name)[0] || "";
  return typeof name === "string" ? name : "";
}

/** Credits grouped by city (input order kept: D1 sorts by city, then spot id), one entry per spot. */
export function groupCreditsByCity(credits: D1PhotoCredit[]): CreditCity[] {
  const cities = new Map<string, CreditCity>();
  for (const credit of credits) {
    const city = credit.city || OTHER_CITY;
    const slug = creditCitySlug(city);
    const group = cities.get(slug) ?? cities.set(slug, { slug, city, spots: [], photoCount: 0 }).get(slug)!;
    let spot = group.spots.at(-1);
    if (spot?.id !== credit.spotId) {
      spot = group.spots.find((s) => s.id === credit.spotId);
      if (!spot) group.spots.push(spot = { id: credit.spotId, name: spotName(credit.spotName), photos: [] });
    }
    spot.photos.push({ credit: credit.credit, sourceUrl: credit.sourceUrl ?? null });
    group.photoCount += 1;
  }
  return [...cities.values()];
}
