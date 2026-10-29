"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SpotEventLink } from "./spot-event-link";
import { trackSpotEvent } from "@/lib/spot-analytics";
import type { Spot } from "@/types";
import { VenueCardPhoto } from "./spot-photo-image";
import { directSpotPhotos } from "@/lib/spots/own-photo";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SpotCardProps {
  spot: Spot;
  compact?: boolean;
  priority?: boolean;
}

/** An excerpt of the source description, never a generated endorsement. */
export function spotDescriptionLead(description: string) {
  const text = description.trim().replace(/\s+/g, " ");
  const sentence = text.match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim();
  return sentence && sentence.length <= 135 ? sentence : text.split(" ").slice(0, 18).join(" ");
}

export function SpotCard({ spot, compact = false, priority = false }: SpotCardProps) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = card.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    let seen = false, active = true;
    const observer = new IntersectionObserver(entries => {
      if (!active || seen || document.visibilityState === "hidden") return;
      if (entries.some(entry => entry.target === element && entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        seen = true;
        trackSpotEvent("card_view", spot.id);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [spot.id]);
  const [expanded, setExpanded] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const lead = spotDescriptionLead(spot.description);
  const more = lead !== spot.description.trim().replace(/\s+/g, " ");
  const geography = [spot.areaName, spot.cityName].filter(Boolean).join(", ");
  const planner = new URLSearchParams({ spot: spot.id });
  if (spot.cityName) planner.set("city", spot.cityName);

  return (
    <Card ref={card} data-testid="spot-card" data-spot-card={compact ? "list" : "grid"}
      className={cn("h-full min-w-0 gap-0 overflow-hidden rounded-2xl bg-surface py-0 text-foreground shadow-none", compact && "lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]")}>
      <div data-testid="spot-card-photo" className="relative w-full min-w-0 self-start bg-raised">
        <VenueCardPhoto key={spot.id} spotId={spot.id} name={spot.name} priority={priority}
          directPhotos={directSpotPhotos(spot)} frameClassName="aspect-[4/3] w-full" />
        <span data-testid="spot-category-chip" className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%_-_5rem)] rounded-full bg-overlay px-3 py-1.5 text-[13px] font-medium text-foreground">
          {spot.category}
        </span>
        <div className="absolute right-3 top-3">
          <SaveSpotButton spotId={spot.id} spotName={spot.name} className="size-11 bg-overlay text-foreground shadow-raised hover:bg-raised" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <SpotEventLink spotId={spot.id} event="open_detail" prefetch={false} href={`/spots/${spot.id}`} className="flex min-h-11 items-center rounded-md">
          <h3 data-testid="spot-card-title" className="break-words text-[17px] font-semibold leading-snug tracking-tight">{spot.name}</h3>
        </SpotEventLink>
        <p data-spot-card-meta className="break-words text-[13px] leading-5 text-muted-foreground">
          {geography ? `${geography} · ${spot.category}` : spot.category}
        </p>
        {lead && <div>
          <p id={`${id}-why`} className="break-words text-[15px] leading-6 text-muted-foreground">{expanded ? spot.description : lead}</p>
          {more && <button type="button" aria-label={`${expanded ? "Less" : "More"} about ${spot.name}`} aria-expanded={expanded} aria-controls={`${id}-why`}
            onClick={() => setExpanded(!expanded)} className="min-h-11 rounded-md pr-4 text-sm font-medium text-primary">
            {expanded ? "Less" : "More"}<span className="sr-only"> about {spot.name}</span>
          </button>}
        </div>}
        {(spot.verified || spot.communitySubmitted) && <div className="text-[13px] text-muted-foreground">
          {spot.verified && <>
            <button type="button" aria-expanded={showVerification} aria-controls={`${id}-verified`}
              onClick={() => setShowVerification(!showVerification)} className="min-h-11 rounded-md pr-4 font-medium text-success">Verified place</button>
            {showVerification && <p id={`${id}-verified`} className="pb-2 leading-5">This catalog record is marked verified. Check current hours and access before you go.</p>}
          </>}
          {spot.communitySubmitted && <p aria-label="Community submitted spot" className="py-2">Community suggestion</p>}
        </div>}
        <div className="mt-auto grid grid-cols-2 items-stretch gap-2 pt-1">
          <Button asChild className="min-w-0 px-2 text-sm"><SpotEventLink spotId={spot.id} event="add_to_trip" prefetch={false} href={`/itineraries/new?${planner}`}>Add to trip<span className="sr-only">: {spot.name}</span></SpotEventLink></Button>
          <Button asChild variant="secondary" className="min-w-0 px-2 text-sm"><SpotEventLink spotId={spot.id} event="open_detail" prefetch={false} href={`/spots/${spot.id}`}>Details<span className="sr-only">: {spot.name}</span></SpotEventLink></Button>
        </div>
      </div>
    </Card>
  );
}
