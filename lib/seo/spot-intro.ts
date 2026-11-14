import type { CityDirectoryEntry, NearbyEntry } from "@/lib/spots/city-directory";
import { scoreLabel } from "@/lib/seo/spot-card";

/** About 10 minutes on foot at ~80 m/min. */
export const WALK_RADIUS_KM = 0.8;

export type SpotIntroInput = {
  id: string;
  name: string;
  category: string;
  score: number;
  area: string;
  city: string;
  /** The city hub directory (score-ranked); empty when the hub is not known. */
  directory: readonly CityDirectoryEntry[];
  /** Closest hub spots, nearest first, without the spot itself. */
  nearby: readonly NearbyEntry[];
};

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function walk(distanceKm: number): string {
  if (distanceKm < 1) return `${Math.max(50, Math.round((distanceKm * 1000) / 10) * 10)} m`;
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * A two-sentence lead built only from our own data (score, hub rank, neighbours), so every spot page opens with text
 * no other page has (sprint-2 L8: GSC "Discovered - currently not indexed" on near-duplicate spot pages).
 */
export function spotIntro(input: SpotIntroInput): string {
  const label = scoreLabel(input.score);
  const category = input.category.trim().toLowerCase();
  const place = input.area && input.area !== input.city ? `${input.area}, ${input.city}` : input.city;
  const self = input.directory.find((entry) => entry.id.toLowerCase() === input.id.toLowerCase());
  const rated = input.directory.length;
  const rankText = self && rated > 1 ? ` and ranked ${ordinal(self.rank + 1)} of ${rated.toLocaleString("en-US")} rated places in ${input.city}` : "";
  const noun = category || "place";
  const article = /^[aeiou]/.test(noun) ? "an" : "a";
  const first = `${input.name} is ${article} ${noun} in ${place}, rated ${label} (Localley Score ${input.score}/6)${rankText}.`;

  const closest = input.nearby[0];
  if (!closest) return first;
  const inWalk = input.nearby.filter((entry) => entry.distanceKm <= WALK_RADIUS_KM).length;
  const more = inWalk > 1
    ? ` ${inWalk === input.nearby.length ? `At least ${inWalk}` : inWalk} rated spots are within a 10-minute walk.`
    : "";
  return `${first} The closest rated spot is ${closest.name}, ${walk(closest.distanceKm)} away.${more}`;
}
