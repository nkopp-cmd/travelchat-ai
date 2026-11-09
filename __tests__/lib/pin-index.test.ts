import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
    decodePinIndex,
    encodePinIndex,
    pinIndexQuery,
    PIN_KEY_PATTERN,
    uniqueKeyLength,
    type PinIndexRow,
} from "@/lib/spots/pin-index";

/** Deterministic pseudo-random rows (no fast-check in this repo): seeded LCG. `clustered` puts them in
 * 40 city-sized areas, as the real catalog is; otherwise they spread over the whole region (worst case). */
function rows(count: number, seed = 7, clustered = false): PinIndexRow[] {
    let state = seed;
    const next = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    const hex = () => Math.floor(next() * 0xffffffff).toString(16).padStart(8, "0");
    const categories = ["Food", "Cafe", "Nightlife", "Shopping", "Outdoors", "Culture", null];
    const cities = Array.from({ length: 40 }, () => [-40 + next() * 100, 60 + next() * 100]);
    return Array.from({ length: count }, () => {
        const city = cities[Math.floor(next() * cities.length)];
        return {
        id: `${hex()}-${hex().slice(0, 4)}-4${hex().slice(0, 3)}-a${hex().slice(0, 3)}-${hex()}${hex().slice(0, 4)}`,
        lat: clustered ? city[0] + (next() - 0.5) * 0.3 : -40 + next() * 100,
        lng: clustered ? city[1] + (next() - 0.5) * 0.3 : 60 + next() * 100,
        category: categories[Math.floor(next() * categories.length)],
        score: next() < 0.1 ? null : Math.round(next() * 10 * 10) / 10,
        };
    });
}

describe("pin index", () => {
    it("round-trips every row: one pin per row, coordinates within 1e-5, category and rounded score kept", () => {
        for (const seed of [1, 2, 3, 42, 999]) {
            const input = rows(500, seed);
            const pins = decodePinIndex(encodePinIndex(input));
            expect(pins).toHaveLength(input.length);
            const byKey = new Map(pins.map((pin) => [pin.key, pin]));
            expect(byKey.size).toBe(input.length);
            for (const row of input) {
                const matches = pins.filter((pin) => row.id.startsWith(pin.key));
                expect(matches).toHaveLength(1);
                const pin = matches[0];
                expect(Math.abs(pin.lat - row.lat)).toBeLessThanOrEqual(0.5e-5 + 1e-9);
                expect(Math.abs(pin.lng - row.lng)).toBeLessThanOrEqual(0.5e-5 + 1e-9);
                expect(pin.category).toBe(row.category);
                expect(pin.score).toBe(row.score === null ? null : Math.round(row.score));
                expect(pin.key).toMatch(PIN_KEY_PATTERN);
            }
        }
    });

    it("uses the shortest unique key of at least 8 characters", () => {
        expect(uniqueKeyLength(["aaaaaaaa-1", "bbbbbbbb-1"])).toBe(8);
        expect(uniqueKeyLength(["aaaaaaaa-1", "aaaaaaaa-2"])).toBe(10);
        expect(uniqueKeyLength([])).toBe(8);
    });

    it("keeps an empty filter valid", () => {
        const index = encodePinIndex([]);
        expect(decodePinIndex(index)).toEqual([]);
    });

    it("stays under the 40 KB gzip budget for 3,000 city-clustered pins", () => {
        const body = JSON.stringify(encodePinIndex(rows(3000, 7, true)));
        expect(gzipSync(body).length).toBeLessThan(40 * 1024);
    });

    it("orders the query string so every filter has one cache key", () => {
        expect(pinIndexQuery({})).toBe("");
        expect(pinIndexQuery({ search: "ramen", city: "tokyo", score: 7, category: "Food" }))
            .toBe("?city=tokyo&category=Food&score=7&search=ramen");
    });
});
