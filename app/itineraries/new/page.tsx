import NewItineraryClient from "./client-content";
import { getPlanningSpot } from "@/lib/spots/planning";
import { isPlanningSpotId, type PlanningSpot } from "@/lib/itineraries/spot-planning";

export default async function NewItineraryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let selectedSpot: PlanningSpot | null = null;
  let spotError: string | null = null;
  if (query.spotId !== undefined) {
    try {
      selectedSpot = isPlanningSpotId(query.spotId) ? await getPlanningSpot(query.spotId) : null;
      if (!selectedSpot) spotError = "This place is unavailable for planning. You can still create a trip without it.";
    } catch {
      spotError = "We could not load this place. Refresh to try again, or create a trip without it.";
    }
  }
  return <NewItineraryClient selectedSpot={selectedSpot} spotError={spotError} />;
}
