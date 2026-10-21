"use client";

import dynamic from "next/dynamic";
import type { Spot } from "@/types";

// Same dark map and tone pin as the spots map view; static (no card) on the spot's own page.
const SpotPinMap = dynamic(() => import("./spot-pin-map"), {
  ssr: false,
  loading: () => <p role="status" className="grid h-full place-items-center text-sm text-muted-foreground">Loading map...</p>,
});

export function hasValidVenueCoordinates(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export function SpotDetailMap({ lat, lng, name, searchUrl, category = "Local spot", photos = [] }: {
  lat: number; lng: number; name: string; searchUrl: string; category?: string; photos?: string[];
}) {
  const pin = { id: "venue", name, category, photos, location: { lat, lng, address: "" } } as unknown as Spot;
  return <div>
    {hasValidVenueCoordinates(lat, lng) ? <>
      <div className="relative z-0 h-64" data-testid="spot-detail-map">
        <SpotPinMap key={`${lat}:${lng}`} spots={[pin]} />
      </div>
      <p className="p-3 text-xs text-white">Approximate venue pin. Entrance not confirmed.</p>
    </> : <p className="p-3 text-sm text-white">No map pin available.</p>}
    <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="inline-block p-3 text-sm text-violet-100 underline">Search for this venue in Maps</a>
  </div>;
}
