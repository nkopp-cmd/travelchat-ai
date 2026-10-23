import { plannerCities, type PlannerCity } from "@/lib/cities-catalog";
import { NewItineraryClient } from "./planner-client";

// Same freshness as /spots and /api/cities: the destination list is rendered into the HTML
// (no client fetch on the first screen) and refreshed every 5 minutes.
export const revalidate = 300;

export default async function NewItineraryPage() {
  let cities: PlannerCity[] | null = null;
  try {
    cities = await plannerCities();
  } catch {
    // Without the catalog (e.g. a build without data access) the step fetches it as before.
  }
  return <NewItineraryClient initialCities={cities?.length ? cities : null} />;
}
