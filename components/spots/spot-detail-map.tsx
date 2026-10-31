"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Spot } from "@/types";

const MAP_PLACEHOLDER = <p role="status" className="grid h-full place-items-center text-sm text-muted-foreground">Loading map...</p>;

// Same dark map and tone pin as the spots map view; static (no card) on the spot's own page.
const SpotPinMap = dynamic(() => import("./spot-pin-map"), {
  ssr: false,
  loading: () => MAP_PLACEHOLDER,
});

export function hasValidVenueCoordinates(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** True once the element comes within `margin` of the viewport (or at once without IntersectionObserver). */
export function useNearViewport<T extends Element>(margin = "300px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (near || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); setNear(true); }
    }, { rootMargin: margin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, margin]);
  // Without IntersectionObserver (and on the server, where ssr:false renders the same placeholder) mount at once.
  return { ref, near: near || typeof IntersectionObserver === "undefined" };
}

export function SpotDetailMap({ lat, lng, name, searchUrl, category = "Local spot", photos = [] }: {
  lat: number; lng: number; name: string; searchUrl: string; category?: string; photos?: string[];
}) {
  // The MapLibre chunk (~290 KB gzip, ~1.8 s script on a mid phone) loads only when the map is
  // about to scroll into view, so it no longer competes with the hero photo (LCP) on first load.
  const { ref, near } = useNearViewport<HTMLDivElement>();
  const pin = { id: "venue", name, category, photos, location: { lat, lng, address: "" } } as unknown as Spot;
  return <div>
    {hasValidVenueCoordinates(lat, lng) ? <>
      <div ref={ref} className="relative z-0 h-64" data-testid="spot-detail-map">
        {near ? <SpotPinMap key={`${lat}:${lng}`} spots={[pin]} /> : MAP_PLACEHOLDER}
      </div>
      <p className="p-3 text-xs text-white">Approximate venue pin. Entrance not confirmed.</p>
    </> : <p className="p-3 text-sm text-white">No map pin available.</p>}
    <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="inline-block p-3 text-sm text-violet-100 underline">Search for this venue in Maps</a>
  </div>;
}
