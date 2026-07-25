import type { MultiCityTripRequest } from "./corridor-planner";

export type WizardBudget = "cheap" | "moderate" | "splurge";
export type WizardPace = "relaxed" | "moderate" | "active" | "packed";
export type WizardGroupType = "solo" | "couple" | "family" | "friends" | "business";

export const MAX_CORRIDOR_DESTINATIONS = 5;
export const MIN_CORRIDOR_DAYS = 3;
export const MAX_CORRIDOR_DAYS = 21;

export function mapWizardBudget(budget: WizardBudget): "budget" | "moderate" | "premium" {
  if (budget === "cheap") return "budget";
  if (budget === "splurge") return "premium";
  return "moderate";
}

export function mapWizardPace(pace: WizardPace): "relaxed" | "moderate" | "active" {
  return pace === "packed" ? "active" : pace;
}

export function mapWizardGroup(groupType: WizardGroupType | string): {
  type: "solo" | "couple" | "friends" | "family" | "business";
  adults: number;
  children: Array<{ age: number }>;
  mobility: string[];
} {
  const type = (["solo", "couple", "friends", "family", "business"] as const).includes(
    groupType as "solo" | "couple" | "friends" | "family" | "business",
  )
    ? (groupType as "solo" | "couple" | "friends" | "family" | "business")
    : "solo";
  return {
    type,
    adults: type === "solo" ? 1 : 2,
    children: type === "family" ? [{ age: 6 }] : [],
    mobility: [],
  };
}

export function buildCorridorRequest(input: {
  destinationSlugs: string[];
  totalDays: number;
  budget: WizardBudget;
  pace: WizardPace;
  groupType: WizardGroupType | string;
  interests: string[];
}): MultiCityTripRequest {
  return {
    destinations: input.destinationSlugs.map((destinationSlug) => ({ destinationSlug })),
    orderMode: "optimize",
    totalDays: input.totalDays,
    budget: mapWizardBudget(input.budget),
    pace: mapWizardPace(input.pace),
    group: mapWizardGroup(input.groupType),
    interests: input.interests,
  };
}

export function maxStopsForDays(totalDays: number): number {
  return Math.min(MAX_CORRIDOR_DESTINATIONS, Math.floor(totalDays / 2.5));
}

export function corridorSelectionError(destinationCount: number, totalDays: number): string | null {
  if (destinationCount < 2) return "Pick at least 2 cities for a multi-city trip.";
  const maxStops = maxStopsForDays(totalDays);
  if (destinationCount > maxStops) {
    return `${totalDays} days supports at most ${maxStops} overnight ${maxStops === 1 ? "stop" : "stops"}. Add days or remove a city.`;
  }
  return null;
}
