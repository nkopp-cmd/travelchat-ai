import type { MultiCityTripRequest } from "@/lib/trips/corridor-planner";

const group = { type: "couple" as const, adults: 2, children: [], mobility: [] };

export const corridorGoldenTrips: Array<{ name: string; request: MultiCityTripRequest }> = [
  { name: "Seoul to Busan", request: { destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "busan" }], orderMode: "user", totalDays: 6, budget: "moderate", pace: "moderate", group, interests: ["food"] } },
  { name: "Busan to Seoul", request: { destinations: [{ destinationSlug: "busan" }, { destinationSlug: "seoul" }], orderMode: "user", totalDays: 6, budget: "budget", pace: "active", group, interests: [] } },
  { name: "Seoul to Gyeongju", request: { destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "gyeongju" }], orderMode: "user", totalDays: 5, budget: "moderate", pace: "relaxed", group, interests: ["history"] } },
  { name: "Gyeongju to Busan", request: { destinations: [{ destinationSlug: "gyeongju" }, { destinationSlug: "busan" }], orderMode: "user", totalDays: 5, budget: "budget", pace: "moderate", group, interests: [] } },
  { name: "Seoul Busan Gyeongju optimized", request: { destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "gyeongju" }, { destinationSlug: "busan" }], orderMode: "optimize", totalDays: 9, budget: "moderate", pace: "moderate", group, interests: [] } },
  { name: "Seoul and Jeju", request: { destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "jeju" }], orderMode: "user", totalDays: 7, budget: "moderate", pace: "relaxed", group, interests: ["wellness"] } },
  { name: "Busan and Jeju", request: { destinations: [{ destinationSlug: "busan" }, { destinationSlug: "jeju" }], orderMode: "user", totalDays: 6, budget: "moderate", pace: "active", group, interests: [] } },
  { name: "Tokyo and Kyoto", request: { destinations: [{ destinationSlug: "tokyo" }, { destinationSlug: "kyoto" }], orderMode: "user", totalDays: 7, budget: "moderate", pace: "moderate", group, interests: ["culture"] } },
  { name: "Kyoto and Tokyo", request: { destinations: [{ destinationSlug: "kyoto" }, { destinationSlug: "tokyo" }], orderMode: "user", totalDays: 7, budget: "premium", pace: "active", group, interests: [] } },
  { name: "Tokyo and Osaka", request: { destinations: [{ destinationSlug: "tokyo" }, { destinationSlug: "osaka" }], orderMode: "user", totalDays: 7, budget: "moderate", pace: "moderate", group, interests: [] } },
  { name: "Tokyo Kyoto Osaka", request: { destinations: [{ destinationSlug: "tokyo" }, { destinationSlug: "kyoto" }, { destinationSlug: "osaka" }], orderMode: "user", totalDays: 9, budget: "moderate", pace: "moderate", group, interests: [] } },
  { name: "Osaka Kyoto Tokyo optimized", request: { destinations: [{ destinationSlug: "osaka" }, { destinationSlug: "tokyo" }, { destinationSlug: "kyoto" }], orderMode: "optimize", totalDays: 9, budget: "premium", pace: "active", group, interests: [] } },
  { name: "Osaka and Nara", request: { destinations: [{ destinationSlug: "osaka" }, { destinationSlug: "nara" }], orderMode: "user", totalDays: 5, budget: "budget", pace: "relaxed", group, interests: ["history"] } },
  { name: "Kyoto and Nara", request: { destinations: [{ destinationSlug: "kyoto" }, { destinationSlug: "nara" }], orderMode: "user", totalDays: 5, budget: "budget", pace: "moderate", group, interests: [] } },
  { name: "Nara Kyoto Osaka", request: { destinations: [{ destinationSlug: "nara" }, { destinationSlug: "kyoto" }, { destinationSlug: "osaka" }], orderMode: "user", totalDays: 8, budget: "budget", pace: "relaxed", group, interests: [] } },
  { name: "Seoul and Tokyo", request: { destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "tokyo" }], orderMode: "user", totalDays: 8, budget: "premium", pace: "moderate", group, interests: [] } },
  { name: "Tokyo and Seoul", request: { destinations: [{ destinationSlug: "tokyo" }, { destinationSlug: "seoul" }], orderMode: "user", totalDays: 8, budget: "premium", pace: "relaxed", group, interests: [] } },
  { name: "Busan and Osaka", request: { destinations: [{ destinationSlug: "busan" }, { destinationSlug: "osaka" }], orderMode: "user", totalDays: 7, budget: "premium", pace: "moderate", group, interests: [] } },
  { name: "Seoul Busan Osaka", request: { destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "busan" }, { destinationSlug: "osaka" }], orderMode: "user", totalDays: 10, budget: "premium", pace: "moderate", group, interests: [] } },
  { name: "Single-city Seoul regression", request: { destinations: [{ destinationSlug: "seoul" }], orderMode: "user", startDate: "2026-10-01", totalDays: 4, budget: "budget", pace: "relaxed", group, interests: [] } },
];
