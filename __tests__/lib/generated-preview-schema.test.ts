import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";
import { checkGeneratedPreview } from "@/lib/trips/generated-preview";

// The zod schema this module used before the hand-written checks (kept here as the reference).
const plan = z.object({
  title: z.string().min(1).max(200), city: z.string().min(1).max(100), days: z.number().int().min(1).max(14),
  dailyPlans: z.array(z.object({ day: z.number().int().min(1).max(14), theme: z.string().max(500).optional(),
    activities: z.array(z.object({ name: z.string().min(1).max(300), time: z.string().max(100).optional(), description: z.string().max(5000).optional() }).passthrough()).max(30),
  }).passthrough()).min(1).max(14),
  insights: z.array(z.unknown()).max(50).optional(), localScore: z.number().optional(),
}).passthrough();
const reference = z.object({ version: z.literal(1), id: z.string().uuid(), createdAt: z.number().finite(), itinerary: plan });

// Values near every boundary: valid, empty, too long, wrong type, null, missing.
const edgeText = (max: number) => fc.oneof({ arbitrary: fc.string({ minLength: 1, maxLength: 8 }), weight: 30 }, fc.constant(""), fc.constant("x".repeat(max)), fc.constant("x".repeat(max + 1)), fc.constant(null), fc.constant(undefined), fc.integer());
const edgeInt = fc.oneof({ arbitrary: fc.integer({ min: 1, max: 14 }), weight: 30 }, fc.integer({ min: -1, max: 16 }), fc.constant(1.5), fc.constant(Number.NaN), fc.constant(Infinity), fc.constant("1"), fc.constant(undefined));
const extra = fc.dictionary(fc.constantFrom("address", "cost", "extra", "__x"), fc.oneof(fc.string(), fc.integer(), fc.constant(null)), { maxKeys: 2 });
const activity = fc.oneof({ weight: 1, arbitrary: fc.constant({ name: "stop" }) }, fc.record({ name: edgeText(300), time: edgeText(100), description: edgeText(5000) }, { requiredKeys: ["name"] }).chain(base => extra.map(more => ({ ...more, ...base }))), fc.constant(null), fc.constant([]));
const day = fc.record({ day: edgeInt, theme: edgeText(500), activities: fc.oneof({ arbitrary: fc.array(activity, { maxLength: 3 }), weight: 20 }, fc.constant(Array(31).fill({ name: "a" })), fc.constant("x")) }, { requiredKeys: ["day", "activities"] })
  .chain(base => extra.map(more => ({ ...more, ...base })));
const itinerary = fc.record({
  title: edgeText(200), city: edgeText(100), days: edgeInt,
  dailyPlans: fc.oneof({ arbitrary: fc.array(day, { minLength: 1, maxLength: 3 }), weight: 20 }, fc.constant([]), fc.constant(Array(15).fill({ day: 1, activities: [] })), fc.constant({})),
  insights: fc.oneof(fc.array(fc.anything(), { maxLength: 3 }), fc.constant(Array(51).fill("x")), fc.constant(null), fc.constant(undefined)),
  localScore: fc.oneof(fc.double(), fc.constant("5"), fc.constant(undefined)),
}, { requiredKeys: ["title", "city", "days", "dailyPlans"] }).chain(base => extra.map(more => ({ ...more, ...base })));
const draft = fc.record({
  version: fc.oneof({ arbitrary: fc.constant(1), weight: 20 }, fc.constant(2), fc.constant("1")),
  id: fc.oneof({ arbitrary: fc.uuid(), weight: 20 }, fc.constant("550e8400-e29b-41d4-a716-446655440000"), fc.constant("not-a-uuid"), fc.constant("550E8400-E29B-01D4-A716-446655440000")),
  createdAt: fc.oneof({ arbitrary: fc.integer(), weight: 20 }, fc.constant(Infinity), fc.constant("1")),
  itinerary, junk: fc.string(),
}, { requiredKeys: ["version", "id", "createdAt", "itinerary"] });

describe("generated preview checks match the old zod schema", () => {
  it("accepts and returns exactly what zod accepted and returned", () => {
    let accepted = 0;
    fc.assert(fc.property(draft, value => {
      const json = JSON.parse(JSON.stringify(value)); // drafts always come from JSON
      const old = reference.safeParse(json), next = checkGeneratedPreview(json);
      expect(next !== null).toBe(old.success);
      if (old.success) { accepted++; expect(next).toEqual(old.data); }
    }), { numRuns: 3000 });
    expect(accepted).toBeGreaterThan(20);
  });
  it("also matches on raw objects with undefined and non-finite numbers (store path)", () => {
    fc.assert(fc.property(draft, value => {
      expect(checkGeneratedPreview(value) !== null).toBe(reference.safeParse(value).success);
    }), { numRuns: 3000 });
  });
});
