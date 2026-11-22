"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackSpotEvent, type SpotEvent } from "@/lib/spot-analytics";
import { rememberHandoffSpot } from "@/lib/trips/spot-handoff";

export function SpotEventLink({ spotId, event, handoffName, onClick, ...props }: ComponentProps<typeof Link> & {
  spotId: string;
  event: Extract<SpotEvent, "add_to_trip" | "open_detail" | "directions">;
  /** Planner links: the spot name the planner shows for this tab (push CL1). */
  handoffName?: string;
}) {
  return <Link {...props} onClick={click => {
    onClick?.(click);
    if (click.defaultPrevented || click.button !== 0) return;
    trackSpotEvent(event, spotId);
    if (handoffName) rememberHandoffSpot(spotId, handoffName);
  }} />;
}
