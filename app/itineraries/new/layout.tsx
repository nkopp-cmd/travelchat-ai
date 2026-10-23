import { preload } from "react-dom";
import { PLANNER_CITIES_URL } from "@/lib/trips/planner-cities";

// Start the destination step's only data request with the HTML (one request per screen,
// in parallel with start-up). "anonymous" matches fetch()'s default same-origin credentials.
export default function NewItineraryLayout({ children }: { children: React.ReactNode }) {
    preload(PLANNER_CITIES_URL, { as: "fetch", crossOrigin: "anonymous" });
    return children;
}
