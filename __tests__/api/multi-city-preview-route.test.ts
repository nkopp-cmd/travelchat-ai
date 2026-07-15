import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/v2/trips/preview/route";
import { corridorGoldenTrips } from "@/__tests__/fixtures/corridor-golden-trips";

function request(body: unknown) {
  return new Request("https://www.localley.io/api/v2/trips/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://www.localley.io/api/v2/trips/preview", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("POST /api/v2/trips/preview", () => {
  const previousFlag = process.env.MULTI_CITY_PREVIEW_API;

  beforeEach(() => {
    process.env.MULTI_CITY_PREVIEW_API = "on";
  });

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.MULTI_CITY_PREVIEW_API;
    else process.env.MULTI_CITY_PREVIEW_API = previousFlag;
  });

  it("is undiscoverable when the server-only flag is off", async () => {
    delete process.env.MULTI_CITY_PREVIEW_API;
    const response = await POST(request(corridorGoldenTrips[0].request));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a deterministic, slug-only corridor preview", async () => {
    const trip = corridorGoldenTrips[0].request;
    const first = await POST(request(trip));
    const second = await POST(request(trip));
    expect(first.status).toBe(200);
    expect(await first.text()).toBe(await second.text());

    const body = JSON.parse(await (await POST(request(trip))).text());
    expect(body).toMatchObject({
      ok: true,
      preview: {
        plannerVersion: "corridor-v1",
        stops: [
          { position: 0, destinationSlug: "seoul", nights: 3, dayIndexes: [1, 2, 3] },
          { position: 1, destinationSlug: "busan", nights: 2, dayIndexes: [4, 5, 6] },
        ],
        transfers: [{
          position: 0,
          fromSlug: "seoul",
          toSlug: "busan",
          mode: "train",
          durationMinutes: { min: 150, max: 200 },
          terminalBufferMinutes: 55,
          costBand: "$$",
          confidence: "high",
        }],
        warnings: [],
      },
    });

    const allowedKeys = new Set([
      "ok", "preview", "plannerVersion", "destinationSlug", "nights", "type",
      "stops", "position", "dayIndexes", "transfers", "fromSlug", "toSlug",
      "mode", "durationMinutes", "min", "max", "terminalBufferMinutes", "costBand", "confidence", "days",
      "dayIndex", "activeMinutesBudget", "warnings", "code", "message", "theme",
    ]);
    const checkKeys = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(checkKeys);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(allowedKeys.has(key), `unexpected response key: ${key}`).toBe(true);
        checkKeys(child);
      }
    };
    checkKeys(body);
    expect(JSON.stringify(body)).not.toContain("mobility");
    expect(JSON.stringify(body)).not.toContain("interests");
  });

  it("rejects strict, malformed and over-capacity requests", async () => {
    const invalid = await POST(request({ ...corridorGoldenTrips[0].request, unexpected: true }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });

    const tooManyStops = await POST(request({
      ...corridorGoldenTrips[10].request,
      totalDays: 6,
    }));
    expect(tooManyStops.status).toBe(400);

    const malformed = await POST(rawRequest("{"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });

    const oversizedByHeader = await POST(rawRequest("{}", { "content-length": String(32 * 1024 + 1) }));
    expect(oversizedByHeader.status).toBe(413);

    const oversizedBody = await POST(rawRequest(JSON.stringify({ padding: "x".repeat(32 * 1024) })));
    expect(oversizedBody.status).toBe(413);

    const understatedBody = await POST(rawRequest(
      JSON.stringify({ padding: "x".repeat(32 * 1024) }),
      { "content-length": "2" },
    ));
    expect(understatedBody.status).toBe(413);

    const multibyteBody = await POST(rawRequest(JSON.stringify({ padding: "旅".repeat(11_000) })));
    expect(multibyteBody.status).toBe(413);

    const exactLimit = await POST(rawRequest(`{"padding":"${"x".repeat(32 * 1024 - 14)}"}`));
    expect(exactLimit.status).toBe(400);

    const malformedLength = await POST(rawRequest("{}", { "content-length": "nope" }));
    expect(malformedLength.status).toBe(400);

    const wrongContentType = await POST(rawRequest("{}", { "content-type": "text/plain" }));
    expect(wrongContentType.status).toBe(415);

    const malformedSlug = await POST(request({
      ...corridorGoldenTrips[0].request,
      destinations: [{ destinationSlug: "Not A Slug" }],
    }));
    expect(malformedSlug.status).toBe(400);

    const extraChildField = await POST(request({
      ...corridorGoldenTrips[0].request,
      group: { type: "family", adults: 2, children: [{ age: 6, name: "private" }] },
    }));
    expect(extraChildField.status).toBe(400);
  });

  it("distinguishes unknown destinations from unsupported reviewed routes", async () => {
    const unknown = await POST(request({
      ...corridorGoldenTrips[0].request,
      destinations: [{ destinationSlug: "atlantis" }],
    }));
    expect(unknown.status).toBe(422);
    expect(await unknown.json()).toMatchObject({ ok: false, error: { code: "UNKNOWN_DESTINATION" } });

    const unsupported = await POST(request({
      ...corridorGoldenTrips[0].request,
      destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "nara" }],
    }));
    expect(unsupported.status).toBe(422);
    expect(await unsupported.json()).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_ROUTE" } });
  });

  it("classifies duplicate and impossible night allocations as unsatisfiable", async () => {
    const duplicate = await POST(request({
      ...corridorGoldenTrips[0].request,
      destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "seoul" }],
    }));
    expect(duplicate.status).toBe(422);
    expect(await duplicate.json()).toMatchObject({ ok: false, error: { code: "UNSATISFIABLE_TRIP" } });

    const impossibleNights = await POST(request({
      ...corridorGoldenTrips[0].request,
      destinations: [
        { destinationSlug: "seoul", nights: 4, locked: true },
        { destinationSlug: "busan", nights: 4, locked: true },
      ],
      totalDays: 7,
    }));
    expect(impossibleNights.status).toBe(422);
    expect(await impossibleNights.json()).toMatchObject({ ok: false, error: { code: "UNSATISFIABLE_TRIP" } });
  });

  it("makes pace and family rhythm visible without providers", async () => {
    const relaxedFamily = await POST(request({
      ...corridorGoldenTrips[0].request,
      pace: "relaxed",
      group: { type: "family", adults: 2, children: [{ age: 6 }], mobility: [] },
    }));
    const activeCouple = await POST(request({
      ...corridorGoldenTrips[0].request,
      pace: "active",
    }));
    const relaxedBody = await relaxedFamily.json();
    const activeBody = await activeCouple.json();
    expect(relaxedBody.preview.days[1].activeMinutesBudget)
      .toBeLessThan(activeBody.preview.days[1].activeMinutesBudget);
  });

  it("does not invent activity time when a transfer consumes the pacing window", async () => {
    const response = await POST(request(corridorGoldenTrips[15].request));
    const body = await response.json();
    const transferDay = body.preview.days.find((day: { type: string }) => day.type === "transfer");
    expect(transferDay.activeMinutesBudget).toBe(0);
    expect(body.preview.warnings).toContain("TRANSFER_DAY_FULL");
  });
});
