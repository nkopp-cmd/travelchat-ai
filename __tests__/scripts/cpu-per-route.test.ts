import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { routeClass, summarize } from "../../scripts/perf/cpu-per-route.mjs";

describe("cpu-per-route (Push DM1)", () => {
    it("groups slugs into coarse route classes", () => {
        expect(routeClass("https://www.localley.io/spots/abc")).toBe("/spots/:x");
        expect(routeClass("https://www.localley.io/spots/abc/og")).toBe("/spots/:x/...");
        expect(routeClass("https://www.localley.io/spots?city=seoul")).toBe("/spots?q");
        expect(routeClass("https://www.localley.io/itineraries/1?_rsc=x")).toBe("/itineraries/:x (rsc)");
        expect(routeClass("https://www.localley.io/api/auth/get-session")).toBe("/api/auth");
        expect(routeClass("https://www.localley.io/")).toBe("/");
    });

    it("sorts by CPU sum and computes p50 per route", () => {
        const ev = (url: string, cpu: number) => ({ $workers: { eventType: "fetch", cpuTimeMs: cpu, wallTimeMs: cpu, event: { request: { url } } } });
        const rows = summarize([ev("https://x/spots/a", 10), ev("https://x/spots/b", 30), ev("https://x/spots/c", 20), ev("https://x/api/auth/get-session", 200)]);
        expect(rows[0].route).toBe("/api/auth");
        expect(rows[1]).toMatchObject({ route: "/spots/:x", requests: 3, cpuP50: 20 });
        expect(rows[0].cpuShare + rows[1].cpuShare).toBeCloseTo(1);
    });
});
