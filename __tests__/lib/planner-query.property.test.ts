import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { WizardData } from "@/components/itineraries/wizard/wizard-context";
import { templates } from "@/lib/templates";
import { PLANNER_DRAFT_TTL } from "@/lib/trips/planner-draft";
import { plannerStartFromQuery } from "@/lib/trips/planner-query";
import { generateCorridorItinerarySchema, generateItinerarySchema } from "@/lib/validations";

// Push AO2: whatever a planner link or a saved draft holds, the wizard starts with data whose
// generate request body passes the server schema. The only open input is the city: the user still
// picks it on step 0 when the link has none. Mirrors defaultData + handleGenerate in the wizard.
const defaults: WizardData = {
  city: "", days: 3, budget: "moderate", interests: [], localnessLevel: 3, pace: "moderate",
  groupType: "solo", tripMode: "single", citySlugs: [], cityNameBySlug: {},
};
const NOW = 1_800_000_000_000;

function body(data: WizardData) {
  return data.tripMode === "multi" && data.citySlugs.length >= 2
    ? { multi: true as const, value: {
        corridor: { destinations: data.citySlugs.map((destinationSlug) => ({ destinationSlug })), totalDays: data.days },
        interests: data.interests, budget: data.budget, localnessLevel: data.localnessLevel, pace: data.pace, groupType: data.groupType,
      } }
    : { multi: false as const, value: {
        city: data.city || "Seoul", days: data.days, interests: data.interests, budget: data.budget,
        localnessLevel: data.localnessLevel, pace: data.pace, groupType: data.groupType,
        templatePrompt: data.templatePrompt, spotId: data.selectedSpotId,
      } };
}

function expectAccepted(search: string, draft: string | null = null) {
  const start = plannerStartFromQuery(search, draft, NOW);
  const data = { ...defaults, ...start.initialData };
  const request = body(data);
  const parsed = request.multi ? generateCorridorItinerarySchema.safeParse(request.value) : generateItinerarySchema.safeParse(request.value);
  if (!parsed.success) throw new Error(`${search} -> ${JSON.stringify(parsed.error.issues.map((i) => [i.path.join("."), i.code]))}`);
  expect([0, 2, 3]).toContain(start.initialStep);
}

const keys = ["city", "days", "localness", "interests", "budget", "pace", "group", "spot", "template", "resume"] as const;
const valueFor = {
  city: fc.oneof(fc.string({ maxLength: 300 }), fc.constantFrom("Seoul", "  ", "tokyo", "x".repeat(150))),
  days: fc.oneof(fc.string({ maxLength: 8 }), fc.integer({ min: -100, max: 1000 }).map(String), fc.constantFrom("1e9", "7.9", "NaN", "-0", "0x10")),
  localness: fc.oneof(fc.string({ maxLength: 4 }), fc.integer({ min: -10, max: 100 }).map(String)),
  interests: fc.oneof(fc.string(), fc.constantFrom("Food & Dining,History", " Shopping , Shopping ", "Food & Dining," + "a".repeat(80))),
  budget: fc.oneof(fc.string({ maxLength: 10 }), fc.constantFrom("cheap", "moderate", "splurge", "budget", "luxury")),
  pace: fc.oneof(fc.string({ maxLength: 10 }), fc.constantFrom("relaxed", "packed", "slow")),
  group: fc.oneof(fc.string({ maxLength: 20 }), fc.constantFrom("solo", "couple", "bachelor-party", "FAMILY")),
  spot: fc.oneof(fc.uuid().map((id) => id.toUpperCase()), fc.string({ maxLength: 40 })),
  template: fc.oneof(fc.constantFrom(...templates.map((t) => t.id)), fc.string({ maxLength: 20 })),
  resume: fc.constantFrom("1", "0", "true"),
};
const query = fc.array(fc.oneof(
  fc.oneof(...keys.map((key) => valueFor[key].map((value) => [key, value] as [string, string]))),
  fc.tuple(fc.string({ maxLength: 10 }), fc.string({ maxLength: 20 })),
), { maxLength: 14 }).map((pairs) => new URLSearchParams(pairs).toString());

describe("planner query -> initial data passes the generate schema (push AO2)", () => {
  it("any structured planner query", () => {
    fc.assert(fc.property(query, (search) => expectAccepted(search)), { numRuns: 1000 });
  });

  it("any raw query string, also with a leading ?", () => {
    fc.assert(fc.property(fc.string({ maxLength: 200 }), fc.boolean(), (raw, mark) => expectAccepted(mark ? `?${raw}` : raw)), { numRuns: 500 });
  });

  it("every template link, with and without a day override", () => {
    for (const t of templates) {
      expectAccepted(`template=${t.id}`);
      expectAccepted(`template=${t.id}&days=14&city=Tokyo`);
    }
  });

  it("any draft the planner restores", () => {
    let restoredCount = 0;
    const text = (max: number) => fc.string({ minLength: 0, maxLength: max + 20 });
    const draftData = fc.record({
      city: text(100), days: fc.integer({ min: -2, max: 25 }), budget: fc.constantFrom("cheap", "moderate", "splurge", "luxury"),
      interests: fc.array(fc.string({ minLength: 1, maxLength: 70 }), { maxLength: 12 }),
      localnessLevel: fc.integer({ min: 0, max: 6 }), pace: fc.constantFrom("relaxed", "packed", "slow"),
      groupType: fc.constantFrom("solo", "family", "party"), tripMode: fc.constantFrom("single", "multi"),
      citySlugs: fc.array(fc.oneof(fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/), fc.constantFrom("seoul", "-busan", "a".repeat(70))), { maxLength: 6 }),
      cityNameBySlug: fc.constant({}),
      templatePrompt: fc.option(fc.string({ maxLength: 2100 }), { nil: undefined }),
    }, { requiredKeys: ["city", "days", "budget", "interests", "localnessLevel", "pace", "groupType", "tripMode", "citySlugs", "cityNameBySlug"] });
    fc.assert(fc.property(draftData, fc.integer({ min: 0, max: PLANNER_DRAFT_TTL - 1 }), query, (data, age, search) => {
      const raw = JSON.stringify({ version: 1, savedAt: NOW - age, data });
      expectAccepted(`resume=1&${search}`, raw);
      if (plannerStartFromQuery("resume=1", raw, NOW).restored) restoredCount++;
    }), { numRuns: 2000 });
    expect(restoredCount).toBeGreaterThan(0);
  });

  it("keeps the AO1 group rule and clamps link days to 7", () => {
    expect(plannerStartFromQuery("city=Seoul&group=bachelor-party", null, NOW).initialData).toEqual({ city: "Seoul" });
    expect(plannerStartFromQuery("days=99", null, NOW)).toMatchObject({ initialData: { days: 7 }, initialStep: 2 });
    const multi = JSON.stringify({ version: 1, savedAt: NOW, data: { ...defaults, tripMode: "multi", citySlugs: ["seoul", "busan"] } });
    expect(plannerStartFromQuery("resume=1&days=1", multi, NOW).initialData.days).toBe(3);
    expect(plannerStartFromQuery(`city=${"x".repeat(150)}`, null, NOW).initialData.city).toHaveLength(100);
  });
});
