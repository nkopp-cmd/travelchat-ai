import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/met-locationforecast-seoul.json";
import { chatConditions, formatChatConditions } from "@/lib/weather/chat-conditions";

function memoryCache() {
  const store = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
  };
}

describe("chat season and weather context", () => {
  it("gives the prompt the local season, the current weather and the next five days", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    const now = new Date(fixture.properties.timeseries[0].time);
    const text = await chatConditions("Seoul", { cache: memoryCache(), fetcher: fetcher as never }, now);
    expect(text).toContain("SEASON AND WEATHER IN SEOUL");
    expect(text).toContain("- Season now: Autumn foliage (usually 10-20°C).");
    expect(text).toContain(`- Right now: ${Math.round(fixture.properties.timeseries[0].data.instant.details.air_temperature)}°C`);
    expect(text.match(/- Next days \(MET Norway forecast\): (.*)\./)?.[1].split("; ")).toHaveLength(5);
    expect(text).toContain("never invent other weather");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps the season when MET is down, and adds nothing for unreviewed cities", async () => {
    const down = vi.fn(async () => new Response("down", { status: 503 }));
    const text = await chatConditions("Tokyo", { cache: memoryCache(), fetcher: down as never }, new Date("2026-04-05T03:00:00Z"));
    expect(text).toContain("- Season now: Cherry blossom");
    expect(text).not.toContain("Right now");
    expect(await chatConditions("Atlantis", { fetcher: down as never })).toBe("");
    expect(formatChatConditions("Seoul", "Asia/Seoul", null, null)).toBe("");
  });
});
