"use client";

import MapComponent from "@/components/ui/map";

export function hasValidVenueCoordinates(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export function SpotDetailMap({ lat, lng, name, searchUrl }: { lat: number; lng: number; name: string; searchUrl: string }) {
  return <div>
    {hasValidVenueCoordinates(lat, lng) ? <>
      <div className="relative z-0 h-64" data-testid="spot-detail-map">
        <MapComponent key={`${lat}:${lng}`} forceProvider="openstreetmap" initialViewState={{ latitude: lat, longitude: lng, zoom: 16 }} markers={[{ lat, lng, title: name }]} />
      </div>
      <p className="p-3 text-xs text-white">Approximate venue pin. Entrance not confirmed.</p>
    </> : <p className="p-3 text-sm text-white">No map pin available.</p>}
    <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="inline-block p-3 text-sm text-violet-100 underline">Search for this venue in Maps</a>
  </div>;
}
