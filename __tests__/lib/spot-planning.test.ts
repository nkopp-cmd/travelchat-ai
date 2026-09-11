import { describe, expect, it } from "vitest";
import { insertPlanningSpot, planHasSpot, planningCitiesMatch, isItinerarySnapshot, type PlanningSpot } from "@/lib/itineraries/spot-planning";

const spot: PlanningSpot = { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Cafe Onion", city: "Seoul", address: "Seoul", description: "Cafe", category: "cafe", latitude: 37.58, longitude: 126.98 };

describe("spot planning", () => {
    const plans = [{ day: 2, theme: "Markets", notes: "Keep this", activities: [{ name: "Market", notes: "Cash" }] }, { day: 7, activities: [{ name: "Museum" }] }];
    it("uses actual day numbers and preserves all other data", () => {
        const result = insertPlanningSpot(plans, spot, 2, 0);
        expect(result[0].activities.map((activity) => activity.name)).toEqual([spot.name, "Market"]);
        expect(result[0]).toMatchObject({ notes: "Keep this", theme: "Markets" });
        expect(result[0].activities[1]).toBe(plans[0].activities[0]);
        expect(result[1]).toBe(plans[1]);
        expect(plans[0].activities).toHaveLength(1);
        expect(result[0].activities[0]).toMatchObject({ spotId: spot.id, lat: 37.58, lng: 126.98 });
        expect(result[0].activities[0]).not.toHaveProperty("time");
        expect(result[0].activities[0]).not.toHaveProperty("cost");
        expect(result[0].activities[0]).not.toHaveProperty("duration");
    });
    it("inserts at end and rejects duplicates anywhere", () => {
        const result = insertPlanningSpot(plans, spot, 7, 1);
        expect(result[1].activities[1].name).toBe(spot.name);
        expect(planHasSpot(result, spot.id.toUpperCase())).toBe(true);
        expect(() => insertPlanningSpot(result, spot, 2, 0)).toThrow("already in your plan");
    });
    it("rejects invalid days and positions", () => {
        for (const [day, position] of [[1, 0], [2, -1], [2, 2], [2, 0.5]]) {
            expect(() => insertPlanningSpot(plans, spot, day, position)).toThrow("valid day and position");
        }
    });
    it("does not invent coordinates", () => {
        const result = insertPlanningSpot(plans, { ...spot, latitude: undefined, longitude: undefined }, 2, 0);
        expect(result[0].activities[0]).not.toHaveProperty("lat");
    });
    it("matches cities without case or space differences", () => {
        expect(planningCitiesMatch(" seoul ", "Seoul")).toBe(true);
        expect(planningCitiesMatch("Tokyo", "Seoul")).toBe(false);
        expect(planningCitiesMatch("", "")).toBe(false);
    });
    it("requires every raw snapshot field and allows nulls", () => {
        expect(isItinerarySnapshot({ title: null, city: null, activities: null, highlights: null, estimated_cost: null })).toBe(true);
        expect(isItinerarySnapshot({ title: "Trip", city: "Seoul", activities: [] })).toBe(false);
        expect(isItinerarySnapshot({ title: "Trip", city: "Seoul", activities: [], highlights: [1], estimated_cost: null })).toBe(false);
    });
});
