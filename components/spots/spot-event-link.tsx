"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackSpotEvent, type SpotEvent } from "@/lib/spot-analytics";

export function SpotEventLink({ spotId, event, onClick, ...props }: ComponentProps<typeof Link> & {
  spotId: string;
  event: Extract<SpotEvent, "add_to_trip" | "open_detail" | "directions">;
}) {
  return <Link {...props} onClick={click => {
    onClick?.(click);
    if (!click.defaultPrevented && click.button === 0) trackSpotEvent(event, spotId);
  }} />;
}
