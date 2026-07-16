import { z } from "zod";
import { geographySeedManifest } from "../geography/seed-manifest";
import { directedTransportEdges, type DirectedTransportEdge } from "./transport-manifest";

const destinationSlugs = new Set(
  geographySeedManifest.destinations.map((destination) => destination.slug),
);

export const MultiCityTripRequestSchema = z.object({
  destinations: z.array(z.object({
    destinationSlug: z.string(),
    nights: z.number().int().min(2).max(20).optional(),
    locked: z.boolean().default(false),
  })).min(1).max(5),
  orderMode: z.enum(["user", "optimize"]),
  startDate: z.iso.date().optional(),
  totalDays: z.number().int().min(3).max(21),
  budget: z.enum(["budget", "moderate", "premium"]),
  pace: z.enum(["relaxed", "moderate", "active"]),
  group: z.object({
    type: z.enum(["solo", "couple", "friends", "family", "business"]),
    adults: z.number().int().min(1).max(20),
    children: z.array(z.object({ age: z.number().int().min(0).max(17) })).default([]),
    mobility: z.array(z.string().min(1).max(100)).default([]),
  }),
  interests: z.array(z.string().min(1).max(80)).max(30).default([]),
});

export type MultiCityTripRequest = z.input<typeof MultiCityTripRequestSchema>;
type ParsedRequest = z.output<typeof MultiCityTripRequestSchema>;

export type PlannedStop = {
  destinationSlug: string;
  position: number;
  nights: number;
  locked: boolean;
};

export type PlannedTransfer = {
  position: number;
  edgeId: string;
  from: string;
  to: string;
  mode: DirectedTransportEdge["mode"];
  durationMinutes: { min: number; max: number };
  occupiedMinutes: number;
  confidence: number;
};

export type PlannedDay = {
  dayIndex: number;
  localDate: string | null;
  destinationSlug: string;
  type: "arrival" | "full" | "transfer" | "rest" | "departure";
  activeMinutesBudget: number;
  transferPosition?: number;
};

export type CorridorPlan = {
  plannerVersion: "corridor-v1";
  totalDays: number;
  totalNights: number;
  stops: PlannedStop[];
  transfers: PlannedTransfer[];
  days: PlannedDay[];
  hardViolations: [];
};

export class PlannerValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "PlannerValidationError";
  }
}

const paceWindowMinutes = { relaxed: 420, moderate: 540, active: 640 } as const;

function edgeOccupancy(edge: DirectedTransportEdge): number {
  return edge.departureBufferMinutes + edge.durationMinutes.max +
    edge.arrivalBufferMinutes + edge.hotelChangeMinutes;
}

function costPenalty(edge: DirectedTransportEdge, budget: ParsedRequest["budget"]): number {
  if (budget === "premium") return 0;
  if (budget === "moderate") return edge.costBand === "premium" ? 90 : 0;
  return edge.costBand === "premium" ? 240 : edge.costBand === "moderate" ? 75 : 0;
}

function selectEdge(from: string, to: string, budget: ParsedRequest["budget"]): DirectedTransportEdge | null {
  return directedTransportEdges
    .filter((edge) => edge.from === from && edge.to === to)
    .sort((left, right) =>
      edgeOccupancy(left) + costPenalty(left, budget) -
      (edgeOccupancy(right) + costPenalty(right, budget)) ||
      right.confidence - left.confidence ||
      left.id.localeCompare(right.id)
    )[0] || null;
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)])
      .map((tail) => [value, ...tail]),
  );
}

function routeScore(
  stops: ParsedRequest["destinations"],
  budget: ParsedRequest["budget"],
): number | null {
  let score = 0;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const edge = selectEdge(stops[index].destinationSlug, stops[index + 1].destinationSlug, budget);
    if (!edge) return null;
    score += edgeOccupancy(edge) + costPenalty(edge, budget) - edge.confidence * 10;
  }
  return score;
}

function orderStops(request: ParsedRequest): ParsedRequest["destinations"] {
  if (request.orderMode === "user" || request.destinations.length === 1) {
    return request.destinations;
  }
  const feasible = permutations(request.destinations)
    .map((stops) => ({ stops, score: routeScore(stops, request.budget) }))
    .filter((candidate): candidate is { stops: ParsedRequest["destinations"]; score: number } =>
      candidate.score !== null,
    )
    .sort((left, right) => left.score - right.score ||
      left.stops.map((stop) => stop.destinationSlug).join(",")
        .localeCompare(right.stops.map((stop) => stop.destinationSlug).join(",")));
  if (!feasible[0]) {
    throw new PlannerValidationError(["No supported transfer order connects every requested destination."]);
  }
  return feasible[0].stops;
}

function allocateNights(
  ordered: ParsedRequest["destinations"],
  totalDays: number,
): PlannedStop[] {
  const availableNights = totalDays - 1;
  const nights = ordered.map((stop) => stop.nights ?? 2);
  const minimum = nights.reduce((sum, value) => sum + value, 0);
  if (minimum > availableNights) {
    throw new PlannerValidationError([
      `Requested/required nights (${minimum}) exceed the trip's ${availableNights} nights.`,
    ]);
  }
  let remaining = availableNights - minimum;
  while (remaining > 0) {
    const candidates = ordered
      .map((stop, index) => ({ stop, index, nights: nights[index] }))
      .filter(({ stop }) => !stop.locked)
      .sort((left, right) => left.nights - right.nights || left.index - right.index);
    if (candidates.length === 0) {
      throw new PlannerValidationError(["Locked night allocations do not account for every trip night."]);
    }
    nights[candidates[0].index] += 1;
    remaining -= 1;
  }
  return ordered.map((stop, position) => ({
    destinationSlug: stop.destinationSlug,
    position,
    nights: nights[position],
    locked: stop.locked,
  }));
}

function addUtcDays(date: string | undefined, offset: number): string | null {
  if (!date) return null;
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function buildTransfers(stops: PlannedStop[], budget: ParsedRequest["budget"]): PlannedTransfer[] {
  return stops.slice(0, -1).map((stop, position) => {
    const to = stops[position + 1];
    const edge = selectEdge(stop.destinationSlug, to.destinationSlug, budget);
    if (!edge) {
      throw new PlannerValidationError([
        `No reviewed transfer edge connects ${stop.destinationSlug} to ${to.destinationSlug}.`,
      ]);
    }
    return {
      position,
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      mode: edge.mode,
      durationMinutes: edge.durationMinutes,
      occupiedMinutes: edgeOccupancy(edge),
      confidence: edge.confidence,
    };
  });
}

function buildDays(request: ParsedRequest, stops: PlannedStop[], transfers: PlannedTransfer[]): PlannedDay[] {
  const fillBudget = Math.floor(paceWindowMinutes[request.pace] * 0.85);
  const boundaries = new Map<number, number>();
  let cumulativeNights = 0;
  for (let position = 0; position < stops.length - 1; position += 1) {
    cumulativeNights += stops[position].nights;
    boundaries.set(cumulativeNights + 1, position);
  }
  const days: PlannedDay[] = [];
  let stopPosition = 0;
  let activeFullDays = 0;
  const restCadence = request.pace === "relaxed" || request.group.type === "family" ? 4 : 6;
  for (let dayIndex = 1; dayIndex <= request.totalDays; dayIndex += 1) {
    let type: PlannedDay["type"] = "full";
    let activeMinutesBudget = fillBudget;
    let transferPosition: number | undefined;
    if (dayIndex === 1) {
      type = "arrival";
      activeMinutesBudget = Math.floor(fillBudget * 0.5);
    } else if (dayIndex === request.totalDays) {
      type = "departure";
      activeMinutesBudget = Math.floor(fillBudget * 0.4);
    } else if (boundaries.has(dayIndex)) {
      transferPosition = boundaries.get(dayIndex)!;
      stopPosition = transferPosition + 1;
      const transfer = transfers[transferPosition];
      type = "transfer";
      activeMinutesBudget = transfer.durationMinutes.max > 180
        ? Math.max(120, Math.min(Math.floor(fillBudget * 0.5), fillBudget - transfer.occupiedMinutes))
        : Math.max(120, fillBudget - transfer.occupiedMinutes);
      activeFullDays = 0;
    } else {
      activeFullDays += 1;
      if (activeFullDays > restCadence) {
        type = "rest";
        activeMinutesBudget = Math.floor(fillBudget * 0.45);
        activeFullDays = 0;
      }
    }
    days.push({
      dayIndex,
      localDate: addUtcDays(request.startDate, dayIndex - 1),
      destinationSlug: stops[stopPosition].destinationSlug,
      type,
      activeMinutesBudget,
      ...(transferPosition === undefined ? {} : { transferPosition }),
    });
  }
  return days;
}

function validateRequest(request: ParsedRequest): void {
  const issues: string[] = [];
  const maxStops = Math.min(5, Math.floor(request.totalDays / 2.5));
  if (request.destinations.length > maxStops) {
    issues.push(`${request.totalDays} days supports at most ${maxStops} overnight stops.`);
  }
  const seen = new Set<string>();
  for (const stop of request.destinations) {
    if (!destinationSlugs.has(stop.destinationSlug)) issues.push(`Unknown destination: ${stop.destinationSlug}.`);
    if (seen.has(stop.destinationSlug)) issues.push(`Duplicate destination: ${stop.destinationSlug}.`);
    if (stop.locked && stop.nights === undefined) issues.push(`Locked stop ${stop.destinationSlug} requires nights.`);
    seen.add(stop.destinationSlug);
  }
  if (issues.length > 0) throw new PlannerValidationError(issues);
}

export function planCorridorTrip(input: MultiCityTripRequest): CorridorPlan {
  const parsed = MultiCityTripRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new PlannerValidationError(parsed.error.issues.map((issue) => issue.message));
  }
  validateRequest(parsed.data);
  const ordered = orderStops(parsed.data);
  const stops = allocateNights(ordered, parsed.data.totalDays);
  const transfers = buildTransfers(stops, parsed.data.budget);
  const days = buildDays(parsed.data, stops, transfers);
  return {
    plannerVersion: "corridor-v1",
    totalDays: parsed.data.totalDays,
    totalNights: parsed.data.totalDays - 1,
    stops,
    transfers,
    days,
    hardViolations: [],
  };
}
