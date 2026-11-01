"use client";

import Link from "next/link";
import { SpotRail } from "@/components/spots/spot-rail";
import type { ViralSpot } from "@/lib/viral/events";

/** "Viral this week": spots from news about a celebrity visit or a viral moment, each linked to its event page. */
export function ViralSpots({ items, priority = true }: { items: ViralSpot[]; priority?: boolean }) {
  return <SpotRail priority={priority} eyebrow="Viral this week" title="Where everyone is going"
    lede="Places named in recent news about a visit or a viral moment, with the sources."
    trackLabel="Viral spots" seeAll={{ href: "/trending", label: "All events" }}
    items={items.map((item) => ({ key: `${item.event.slug}-${item.spot.id}`, spot: item.spot,
      caption: <Link prefetch={false} href={`/trending/${item.event.slug}`}
        className="inline-flex min-h-11 items-center self-start rounded-full bg-primary/10 px-3 text-[13px] font-medium text-primary">
        {item.event.label}
      </Link> }))} />;
}
