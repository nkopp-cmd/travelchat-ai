import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { pickProbeUrls, projectMonth, routeClass, summarize, warmSummary, withProbe } from "../../scripts/perf/cpu-per-route.mjs";

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

    it("picks one successful GET per top route and skips probe events", () => {
        const ev = (url: string, status: number, method = "GET") => ({ $workers: { eventType: "fetch", event: { request: { url, method }, response: { status } } } });
        const picked = pickProbeUrls(
            [
                ev("https://x/spots/a?cpuprobe=r1", 200),
                ev("https://x/spots/b", 404),
                ev("https://x/spots/c", 200, "POST"),
                ev("https://x/spots/d", 200),
                ev("https://x/spots?city=seoul", 200),
                ev("https://x/api/auth/get-session", 200),
            ],
            ["/spots/:x", "/spots?q"],
        );
        expect([...picked.entries()]).toEqual([
            ["/spots/:x", "https://x/spots/d"],
            ["/spots?q", "https://x/spots?city=seoul"],
        ]);
    });

    it("drops the earliest probe per route as a possible cold start", () => {
        const ev = (url: string, t: number, cpu: number) => ({ timestamp: t, $workers: { eventType: "fetch", cpuTimeMs: cpu, event: { request: { url } } } });
        const url = withProbe("https://x/spots/a", "r1");
        expect(url).toBe("https://x/spots/a?cpuprobe=r1");
        const rows = warmSummary([ev(url, 3, 20), ev(url, 1, 480), ev(url, 2, 10), ev(withProbe("https://x/spots/a", "old"), 4, 900), ev("https://x/spots/a", 5, 700)], "r1");
        expect(rows).toEqual([{ route: "/spots/:x", probes: 3, firstCpu: 480, warmP50: 20 }]);
    });

    it("projects 24 h of CPU microseconds to a 30-day month in CPU-ms", () => {
        expect(projectMonth(5_122_661_479)).toBeCloseTo(153_679_844, 0);
    });
});
