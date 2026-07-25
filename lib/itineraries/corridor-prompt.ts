import type { CorridorPlan } from "@/lib/trips/corridor-planner";

export type CorridorLeg = {
  slug: string;
  cityName: string;
  nights: number;
  dayIndexes: number[];
};

export function corridorLegsFromPlan(plan: CorridorPlan, cityNameBySlug: Record<string, string>): CorridorLeg[] {
  return plan.stops.map((stop) => ({
    slug: stop.destinationSlug,
    cityName: cityNameBySlug[stop.destinationSlug] || stop.destinationSlug,
    nights: stop.nights,
    dayIndexes: plan.days
      .filter((day) => day.destinationSlug === stop.destinationSlug)
      .map((day) => day.dayIndex),
  }));
}

export function transferDayIndexes(plan: CorridorPlan): number[] {
  return plan.days.filter((day) => day.type === "transfer").map((day) => day.dayIndex);
}

function formatMinutes(minutes: { min: number; max: number }): string {
  const toHours = (value: number) => {
    const hours = value / 60;
    return hours >= 1 ? `${Number(hours.toFixed(1))} hours` : `${value} minutes`;
  };
  return `${toHours(minutes.min)}–${toHours(minutes.max)}`;
}

export function corridorRouteLabel(legs: CorridorLeg[]): string {
  return legs.map((leg) => leg.cityName).join(" → ");
}

export function corridorTransferInsights(
  plan: CorridorPlan,
  cityNameBySlug: Record<string, string>,
): Array<{ label: string; text: string; kind: "transport" }> {
  return plan.transfers.map((transfer) => {
    const from = cityNameBySlug[transfer.from] || transfer.from;
    const to = cityNameBySlug[transfer.to] || transfer.to;
    return {
      label: `${from} → ${to}`,
      text: `Travel by ${transfer.mode}, about ${formatMinutes(transfer.durationMinutes)} plus station/terminal time (~${transfer.terminalBufferMinutes} min buffer). Keep the rest of the day light.`,
      kind: "transport" as const,
    };
  });
}

export function buildCorridorUserPrompt(input: {
  plan: CorridorPlan;
  legs: CorridorLeg[];
  totalDays: number;
  interests: string[];
  budget?: string;
  localnessLevel?: number;
  pace?: string;
  groupType?: string;
  spotContextByLeg: Array<{ slug: string; cityName: string; context: string }>;
}): string {
  const { plan, legs, totalDays } = input;
  const dayLines = plan.days.map((day) => {
    const leg = legs.find((item) => item.slug === day.destinationSlug);
    const cityName = leg?.cityName || day.destinationSlug;
    if (day.type === "transfer") {
      const transfer = plan.transfers.find((item) => item.to === day.destinationSlug);
      const fromName = transfer ? (legs.find((item) => item.slug === transfer.from)?.cityName || transfer.from) : "";
      return `- Day ${day.dayIndex}: TRAVEL DAY — ${fromName} → ${cityName}. Schedule at most 1–2 light, nearby activities after arrival; no cross-town plans.`;
    }
    return `- Day ${day.dayIndex}: ${cityName}`;
  });

  const candidateSections = input.spotContextByLeg
    .map((leg) => `\n\nVERIFIED CANDIDATES — ${leg.cityName.toUpperCase()} (use these only for ${leg.cityName} days):\n${leg.context}`)
    .join("");

  return `
Create a ${totalDays}-day MULTI-CITY itinerary for the route ${corridorRouteLabel(legs)} with these preferences:
- Interests: ${input.interests.join(", ") || "general exploration"}
- Budget: ${input.budget || "moderate"}
- Localness Level: ${input.localnessLevel || 3}/5 (5 = maximum local authenticity)
- Pace: ${input.pace || "moderate"}
- Group Type: ${input.groupType || "solo"}

DAY-TO-CITY ASSIGNMENT (mandatory, do not change the order or counts):
${dayLines.join("\n")}

Rules specific to this multi-city trip:
- Add a "city" field to EVERY day object with the exact city name from the assignment above.
- Use only candidates from the matching city's list for each day's activities.
- The title should reflect the whole route (e.g., 'Seoul & Busan Food Trail'), still 3-5 words.
- Respect the pace on full days; travel days are lighter.
${candidateSections}
  `;
}

export function splitDailyPlansByLeg<T extends { day: number }>(
  dailyPlans: T[],
  legs: CorridorLeg[],
): Array<{ leg: CorridorLeg; plans: T[] }> {
  const legByDay = new Map<number, CorridorLeg>();
  for (const leg of legs) {
    for (const dayIndex of leg.dayIndexes) {
      legByDay.set(dayIndex, leg);
    }
  }
  const ordered: Array<{ leg: CorridorLeg; plans: T[] }> = [];
  for (const dayPlan of dailyPlans) {
    const leg = legByDay.get(dayPlan.day);
    if (!leg) continue;
    const last = ordered[ordered.length - 1];
    if (last && last.leg.slug === leg.slug) {
      last.plans.push(dayPlan);
    } else {
      ordered.push({ leg, plans: [dayPlan] });
    }
  }
  return ordered;
}
