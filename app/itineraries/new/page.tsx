import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { plannerCities, type PlannerCity } from "@/lib/cities-catalog";
import { pageMeta, SITE_URL } from "@/lib/seo/meta";
import { pageCardImage } from "@/lib/seo/page-card";
import { NewItineraryClient } from "./planner-client";

// Rendered per request like /spots: the destination list is in the HTML (no client fetch on the first
// screen). The edge HTML cache keeps it 5 minutes and the city counts sit in the 1 h data cache, so a
// request is a cache hit. ISR (revalidate) kept the build-time render, which has no D1, so the live HTML
// had initialCities null: an extra /api/cities fetch and no city photo on the wait screen.
export const dynamic = "force-dynamic";

// The planner is the only free-trip entry (preview -> Save -> checkout). Its own title, one self
// canonical (query variants like ?city=Seoul fold into it) and a free-offer schema let search
// visitors who want a free itinerary land here instead of on the home page.
export const metadata: Metadata = pageMeta({
  title: "Free trip planner for Asia - a 3-day plan, no sign-up",
  socialTitle: "Localley free trip planner",
  description: "Pick a city and get a free day-by-day plan built from spots locals rate: Seoul, Tokyo, Osaka, Bangkok, Singapore and more. Your first plan needs no account.",
  path: "/itineraries/new",
  image: pageCardImage("planner"),
});

const plannerJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Localley trip planner",
  url: `${SITE_URL}/itineraries/new`,
  applicationCategory: "TravelApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: 0, priceCurrency: "USD", description: "First trip plan free, no account needed" },
};

export default async function NewItineraryPage() {
  let cities: PlannerCity[] | null = null;
  try {
    cities = await plannerCities();
  } catch {
    // Without the catalog (e.g. a build without data access) the step fetches it as before.
  }
  return (
    <>
      <JsonLd data={plannerJsonLd} />
      <NewItineraryClient initialCities={cities?.length ? cities : null} />
    </>
  );
}
