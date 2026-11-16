"use client";

import Image from "next/image";
import { useContext } from "react";
import { Loader2 } from "@/components/ui/icons";
import { PlannerCitiesContext } from "./planner-cities-context";
import type { WizardData } from "./wizard-context";
import type { PlannerCity } from "@/lib/cities-catalog";

const BUDGET_LABEL: Record<WizardData["budget"], string> = {
  cheap: "Low budget",
  moderate: "Mid budget",
  splurge: "Splurge",
};

/** The chosen city's row from the server-rendered planner list (single-city trips only); null when unknown. */
export function generatingCity(data: WizardData, cities: PlannerCity[] | null): PlannerCity | null {
  if (data.tripMode !== "single" || !data.city || !cities) return null;
  const name = data.city.trim().toLowerCase();
  return cities.find((city) => city.name.toLowerCase() === name) ?? null;
}

/** One line with the visitor's own choices, e.g. "3 days · Food & Dining, Cafes & Coffee · Mid budget". */
export function generatingChoices(data: WizardData): string {
  const days = `${data.days} ${data.days === 1 ? "day" : "days"}`;
  const interests = data.interests.slice(0, 2).join(", ") + (data.interests.length > 2 ? ` +${data.interests.length - 2}` : "");
  return [days, interests, BUDGET_LABEL[data.budget]].filter(Boolean).join(" · ");
}

/**
 * What the visitor sees while the trip is built (about 10-30 s). It uses only the city list that came
 * with the planner HTML: no request of its own. Without a known city it shows the plain loader.
 */
export function GeneratingScreen({ data, progressMessage }: { data: WizardData; progressMessage: string }) {
  const city = generatingCity(data, useContext(PlannerCitiesContext));
  const place = city?.name ?? (data.tripMode === "multi" ? "your cities" : data.city || "your trip");
  return (
    <div className="flex min-h-[60vh] flex-col items-center px-4 pt-6" role="status" aria-live="polite">
      {city?.heroImage ? (
        <div className="relative mb-6 aspect-[16/10] w-full max-w-md overflow-hidden rounded-2xl bg-muted">
          <Image src={city.heroImage} alt="" fill sizes="(max-width: 480px) 100vw, 448px" quality={70} priority className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <p className="text-2xl font-bold">{city.emoji} {city.name}</p>
            {city.vibe && <p className="text-sm text-white">{city.vibe}</p>}
          </div>
        </div>
      ) : (
        <div className="relative mb-8 mt-[10vh]">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
        </div>
      )}
      <h1 className="mb-2 text-center text-xl font-bold text-foreground">
        Building your {place} plan
      </h1>
      <p className="mb-4 text-center text-sm text-muted-foreground">{generatingChoices(data)}</p>
      {city && (
        <p className="mb-4 text-center text-sm text-foreground">
          Picking from {city.spotCount} local spots in {city.name}
        </p>
      )}
      <p className="flex items-center gap-2 text-center text-primary">
        {city?.heroImage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        <span className="animate-pulse">{progressMessage}</span>
      </p>
      <p className="mt-4 text-sm text-muted-foreground">This usually takes 10-30 seconds</p>
    </div>
  );
}
