import type { Spot } from "@/types";
import { VenueCardPhoto } from "./spot-photo-image";
import { cardPhotoCredits, cardSpotPhotos } from "@/lib/spots/own-photo";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { splitDescriptionLinks } from "@/lib/spots/description-links";
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

/**
 * Server-rendered card: plain HTML with native toggles (details/summary) and plain links. Card views, link events
 * and client navigation come from the one <SpotCardEvents /> island of the page (data-spot-card-id, data-spot-event).
 * Only the photo and the save button hydrate.
 */
export function SpotCard({ spot, compact = false, priority = false }: SpotCardProps) {
  // Source links ("[Visit Seoul](https://...)") belong on the detail page's source list, not in card text.
  const description = splitDescriptionLinks(spot.description).text;
  const lead = spotDescriptionLead(description);
  const more = lead !== description.replace(/\s+/g, " ");
  const geography = [spot.areaName, spot.cityName].filter(Boolean).join(", ");
  const planner = new URLSearchParams({ spot: spot.id });
  if (spot.cityName) planner.set("city", spot.cityName);

  const detail = `/spots/${spot.id}`;
  const listOnDesktop = "lg:[[data-spot-view=list]_&]:grid lg:[[data-spot-view=list]_&]:grid-cols-[20rem_minmax(0,1fr)]";
  const toggle = "flex min-h-11 w-fit cursor-pointer list-none items-center rounded-md pr-4 [&::-webkit-details-marker]:hidden";

  return (
    <Card data-testid="spot-card" data-spot-card={compact ? "list" : "grid"} data-spot-card-id={spot.id}
      className={cn("h-full min-w-0 gap-0 overflow-hidden rounded-2xl bg-surface py-0 text-foreground shadow-none", compact ? "lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]" : listOnDesktop)}>
      <div data-testid="spot-card-photo" className="relative w-full min-w-0 self-start bg-raised">
        <VenueCardPhoto key={spot.id} spotId={spot.id} name={spot.name} priority={priority}
          directPhotos={cardSpotPhotos(spot)} photoCredits={cardPhotoCredits(spot)} frameClassName="aspect-[4/3] w-full" category={spot.category} />
        <span data-testid="spot-category-chip" className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%_-_5rem)] rounded-full bg-overlay px-3 py-1.5 text-[13px] font-medium text-foreground">
          {spot.category}
        </span>
        <div className="absolute right-3 top-3">
          <SaveSpotButton spotId={spot.id} spotName={spot.name} className="size-11 bg-overlay text-foreground shadow-raised hover:bg-raised" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <a href={detail} data-spot-event="open_detail" data-spot-id={spot.id} className="flex min-h-11 items-center rounded-md">
          <h3 data-testid="spot-card-title" className="break-words text-[17px] font-semibold leading-snug tracking-tight">{spot.name}</h3>
        </a>
        <p data-spot-card-meta className="break-words text-[13px] leading-5 text-muted-foreground">
          {geography ? `${geography} · ${spot.category}` : spot.category}
        </p>
        {lead && <div data-spot-card-why className="text-[15px] leading-6 text-muted-foreground [&:has(details[open])>p]:hidden">
          <p className="break-words">{lead}</p>
          {more && <details className="group">
            <summary className={cn(toggle, "text-sm font-medium text-primary")}>
              <span className="group-open:hidden">More</span><span className="hidden group-open:inline">Less</span><span className="sr-only"> about {spot.name}</span>
            </summary>
            <p className="break-words">{description}</p>
          </details>}
        </div>}
        {(spot.verified || spot.communitySubmitted) && <div className="text-[13px] text-muted-foreground">
          {spot.verified && <details>
            <summary className={cn(toggle, "font-medium text-success")}>Verified place</summary>
            <p className="pb-2 leading-5">This catalog record is marked verified. Check current hours and access before you go.</p>
          </details>}
          {spot.communitySubmitted && <p aria-label="Community submitted spot" className="py-2">Community suggestion</p>}
        </div>}
        <div className="mt-auto grid grid-cols-2 items-stretch gap-2 pt-1">
          <a data-slot="button" href={`/itineraries/new?${planner}`} data-spot-event="add_to_trip" data-spot-id={spot.id} className={cn(buttonVariants(), "min-w-0 px-2 text-sm")}>Add to trip<span className="sr-only">: {spot.name}</span></a>
          <a data-slot="button" href={detail} data-spot-event="open_detail" data-spot-id={spot.id} className={cn(buttonVariants({ variant: "secondary" }), "min-w-0 px-2 text-sm")}>Details<span className="sr-only">: {spot.name}</span></a>
        </div>
      </div>
    </Card>
  );
}
