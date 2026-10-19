import { Suspense } from "react";
import { headers } from "next/headers";
import { isPreviewItineraryListCandidate } from "@/lib/app-data/preview-itinerary-list";
import { TripUnavailable, TripUnavailableView } from "@/components/itineraries/trip-unavailable";

export default async function ItineraryNotFound() {
  const candidateHost = isPreviewItineraryListCandidate((await headers()).get("host"), "d1");
  return <Suspense fallback={<TripUnavailableView pending />}>
    <TripUnavailable candidateHost={candidateHost} />
  </Suspense>;
}
