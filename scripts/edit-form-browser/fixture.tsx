import { useEffect } from "react";
import { ItineraryEditor } from "../../components/itineraries/itinerary-editor";

export const spot = {
  id: "11111111-2222-4333-8444-555555555555",
  name: "Seoul Museum of Craft Art",
  city: "Seoul",
  address: "4 Yulgok-ro 3-gil, Jongno-gu, Seoul",
  description: "Fixture: explore Korean craft collections near Anguk.",
  category: "culture",
  latitude: 37.5763,
  longitude: 126.9837,
};
export const itinerary = {
  id: "browser-fixture",
  title: "Two days in Seoul",
  city: "Seoul",
  days: 2,
  activities: [
    { day: 1, theme: "Old Seoul", activities: [{ name: "Gyeongbokgung", description: "Fixture palace visit" }] },
    { day: 2, theme: "Craft and neighborhoods", activities: [
      { name: "Anguk lunch", description: "Fixture lunch stop" },
      { name: "Bukchon walk", description: "Fixture neighborhood walk" },
    ] },
  ],
  highlights: ["Craft collections", "Neighborhood walks"],
  estimated_cost: "$80-120",
};

export function Harness() {
  useEffect(() => { document.documentElement.dataset.hydrated = "true"; }, []);
  return <main style={{ padding: "0 24px 24px", fontFamily: "Arial, sans-serif" }}>
    <ItineraryEditor itinerary={itinerary} planningSpot={spot} onNavigate={() => {}}
      saveRequest={(payload, signal) => fetch(`/api/itineraries/${itinerary.id}/update`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal,
      })} />
  </main>;
}
