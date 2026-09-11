import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/itineraries/[id]/update/route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.client }));

const expected = { title: "Original", city: "Seoul", activities: [{ day: 2, activities: [] }], highlights: ['a,b', 'a"b', 'a\\b', "NULL"], estimated_cost: "$10" };
const body = { title: "New", city: "Seoul", days: [{ day: 2, activities: [{ name: "Cafe", spotId: "canonical", lat: 37, lng: 127, notes: "Keep" }] }], insights: [{ id: "note", text: "Keep note", kind: "insight" }], highlights: [], estimated_cost: "", expected };
const requests: { url: URL; method: string; body: unknown }[] = [];
let owner = "owner";
let fetchedRow: Record<string, unknown> = expected;
let updateResult: unknown = [{ id: "trip", ...expected, title: "New" }];
let updateStatus = 200;
let clientNumber = 0;

beforeEach(() => {
    owner = "owner";
    fetchedRow = expected;
    updateResult = [{ id: "trip", ...expected, title: "New" }];
    updateStatus = 200;
    requests.length = 0;
    mocks.auth.mockResolvedValue({ userId: "owner" });
    const client = createClient("https://test.invalid", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: `snapshot-test-${clientNumber++}` },
        global: { fetch: vi.fn(async (input, init) => {
            const method = init?.method || "GET";
            requests.push({ url: new URL(String(input)), method, body: init?.body ? JSON.parse(String(init.body)) : null });
            return new Response(JSON.stringify(method === "POST" ? updateResult : { ...fetchedRow, clerk_user_id: owner }), {
                status: method === "POST" ? updateStatus : 200, headers: { "Content-Type": "application/json" },
            });
        }) },
    });
    mocks.client.mockResolvedValue(client);
});

function save(value: unknown = body) {
    return PATCH(new NextRequest("https://localley.io/api/itineraries/trip/update", { method: "PATCH", body: JSON.stringify(value) }), { params: Promise.resolve({ id: "trip" }) });
}

describe("itinerary update snapshots", () => {
    it("rejects unauthenticated and non-owner writes", async () => {
        mocks.auth.mockResolvedValueOnce({ userId: null });
        expect((await save()).status).toBe(401);
        owner = "other";
        expect((await save()).status).toBe(403);
        expect(requests.some((request) => request.method !== "GET")).toBe(false);
    });
    it("requires a complete snapshot", async () => {
        const missing = { title: body.title, city: body.city, days: body.days };
        expect((await save(missing)).status).toBe(428);
        for (const value of [null, [], {}, { ...expected, highlights: "wrong" }]) {
            expect((await save({ ...body, expected: value })).status).toBe(400);
        }
        expect(requests).toHaveLength(0);
    });
    it("posts all five raw fields and preserves the ownership select(*)", async () => {
        const response = await save();
        expect(response.status).toBe(200);
        expect(requests).toHaveLength(2);
        expect(requests[0].url.searchParams.get("select")).toBe("*");
        expect(requests[0].url.searchParams.get("id")).toBe("eq.trip");
        const query = requests[1];
        expect(query.method).toBe("POST");
        expect(query.url.href).toBe("https://test.invalid/rest/v1/rpc/save_itinerary_snapshot");
        expect(query.body).toEqual({
            p_itinerary_id: "trip", p_expected: expected,
            p_replacement: { title: "New", city: "Seoul", activities: { dailyPlans: body.days, insights: body.insights }, highlights: [], estimated_cost: null },
        });
        expect((await response.json()).itinerary.title).toBe("New");
    });
    it("sends snapshot nulls without defaulting them", async () => {
        const snapshot = { title: null, city: null, activities: null, highlights: null, estimated_cost: null };
        expect((await save({ ...body, expected: snapshot })).status).toBe(200);
        expect(requests[1].body).toMatchObject({ p_expected: snapshot });
    });
    it("returns 409 for zero matching rows", async () => {
        updateResult = [];
        expect((await save()).status).toBe(409);
    });
    it.each(["title", "city", "activities", "highlights", "estimated_cost"])("does not rebase a stale %s snapshot from the ownership read", async (field) => {
        fetchedRow = { ...expected, [field]: field === "activities" || field === "highlights" ? [] : "Changed elsewhere" };
        updateResult = [];
        expect((await save()).status).toBe(409);
        expect(requests[1].body).toMatchObject({ p_expected: expected });
    });
    it("returns 500 for update database errors", async () => {
        updateStatus = 400;
        updateResult = { code: "XX000", message: "test error" };
        expect((await save()).status).toBe(500);
    });
    it.each([null, {}, [{ id: "one" }, { id: "two" }]])("returns 500 for an invalid RPC result, not a conflict", async (result) => {
        updateResult = result;
        expect((await save()).status).toBe(500);
    });
    it.each(["PGRST202", "42883"])("returns 503 when the RPC is missing (%s), without a fallback write", async (code) => {
        updateStatus = 404;
        updateResult = { code, message: "Function not found" };
        const response = await save();
        expect(response.status).toBe(503);
        expect((await response.json()).error).toMatch(/migration is required/);
        expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
    });
    it("returns 403 for RPC permission errors, not a conflict", async () => {
        updateStatus = 403;
        updateResult = { code: "42501", message: "permission denied" };
        expect((await save()).status).toBe(403);
    });
    it.each([null, [], { ...body, days: [null] }, { ...body, highlights: [1] }, { ...body, title: "" }])("rejects invalid request bodies", async (value) => {
        expect((await save(value)).status).toBe(400);
        expect(requests).toHaveLength(0);
    });
    it("rejects malformed JSON", async () => {
        const response = await PATCH(new NextRequest("https://localley.io/api/itineraries/trip/update", { method: "PATCH", body: "{" }), { params: Promise.resolve({ id: "trip" }) });
        expect(response.status).toBe(400);
        expect(requests).toHaveLength(0);
    });
    it.each([42, 56])("keeps a short constant POST URL for %i Korean stops", async (count) => {
        const activities = Array.from({ length: count }, (_, index) => ({
            name: `\uacbd\ubcf5\uad81 ${index}`, address: "\uc11c\uc6b8\ud2b9\ubcc4\uc2dc \uc885\ub85c\uad6c", notes: "\ud55c\uad6d \uc5ec\ud589 \uae30\ub85d ".repeat(30), spotId: `spot-${index}`, lat: 37.57, lng: 126.98,
        }));
        const days = [{ day: 1, activities }];
        const snapshot = { ...expected, activities: { dailyPlans: days, insights: body.insights } };
        expect(encodeURIComponent(JSON.stringify(snapshot.activities)).length).toBeGreaterThan(20_000);
        expect((await save({ ...body, days, expected: snapshot })).status).toBe(200);
        expect(requests[1].url.href).toBe("https://test.invalid/rest/v1/rpc/save_itinerary_snapshot");
        expect(requests[1].url.href.length).toBeLessThan(100);
        expect(requests[1].method).toBe("POST");
        expect(requests[1].body).toMatchObject({ p_expected: snapshot, p_replacement: { activities: snapshot.activities } });
    });
});
