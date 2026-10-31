"use client";

import { SpotRail } from "@/components/spots/spot-rail";
import type { WeeklyTrendingSpot } from "@/lib/spots/weekly-trending";

export function WeeklyTrendingSpots({ items, citySlug, priority = true }: { items: WeeklyTrendingSpot[]; citySlug?: string | null; priority?: boolean }) {
  const allParams = new URLSearchParams({ sort: "trending" });
  if (citySlug) allParams.set("city", citySlug);
  return <SpotRail items={items.map((item) => ({ key: `${item.citySlug}-${item.spot.id}`, spot: item.spot }))}
    eyebrow="Trending now" title="Places worth a detour" lede="From the last two weeks of public social posts."
    trackLabel="Trending spots" seeAll={{ href: `/spots?${allParams}#spot-results`, label: "See all" }} priority={priority} />;
}
