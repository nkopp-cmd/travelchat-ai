import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/met-locationforecast-seoul.json";
import {
  MET_ENDPOINT, MET_USER_AGENT, cacheSeconds, getWeather, gridKey, summarizeForecast, weatherKind,
} from "@/lib/weather/met-norway";

const seoul = { lat: 37.5665, lng: 126.978, timeZone: "Asia/Seoul" };

function memoryCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
  };
}

function metResponse(expires = new Date(Date.now() + 40 * 60_000).toUTCString()) {
  return new Response(JSON.stringify(fixture), { status: 200, headers: { expires, "content-type": "application/json" } });
}

describe("MET Norway forecast summary", () => {
  const weather = summarizeForecast(fixture as never, "Asia/Seoul", Date.parse(fixture.properties.timeseries[0].time))!;

  it("summarises a real Locationforecast response into current weather and 7 local days", () => {
    expect(weather.updatedAt).toBe(fixture.properties.meta.updated_at);
    expect(weather.current.tempC).toBe(Math.round(fixture.properties.timeseries[0].data.instant.details.air_temperature));
    expect(weather.days).toHaveLength(7);
    for (const day of weather.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.minC).toBeLessThanOrEqual(day.maxC);
      expect(day.precipMm).toBeGreaterThanOrEqual(0);
    }
    // Days are consecutive local dates.
    const dates = weather.days.map((day) => Date.parse(`${day.date}T00:00:00Z`));
    for (let index = 1; index < dates.length; index++) expect(dates[index] - dates[index - 1]).toBe(86_400_000);
  });

  it("reads current weather from the latest started hour, not the first step of a cached forecast", () => {
    const series = fixture.properties.timeseries;
    const later = summarizeForecast(fixture as never, "Asia/Seoul", Date.parse(series[2].time) + 10 * 60_000)!;
    expect(later.current.tempC).toBe(Math.round(series[2].data.instant.details.air_temperature));
    const early = summarizeForecast(fixture as never, "Asia/Seoul", Date.parse(series[0].time) - 60_000)!;
    expect(early.current.tempC).toBe(Math.round(series[0].data.instant.details.air_temperature));
  });

  it("maps MET symbol codes to icon kinds", () => {
    expect(weatherKind("clearsky_day")).toBe("clear");
    expect(weatherKind("fair_night")).toBe("partly");
    expect(weatherKind("lightrainshowers_day")).toBe("rain");
    expect(weatherKind("heavysnow")).toBe("snow");
    expect(weatherKind("rainandthunder")).toBe("thunder");
    expect(weatherKind("lightsleet")).toBe("sleet");
    expect(weatherKind("fog")).toBe("fog");
    expect(weatherKind("cloudy")).toBe("cloudy");
  });

  it("returns null for an empty or malformed forecast", () => {
    expect(summarizeForecast({ properties: { meta: { updated_at: "" }, timeseries: [] } }, "Asia/Seoul")).toBeNull();
  });
});

describe("weather edge cache", () => {
  it("shares one ~1 km grid cell between nearby points", () => {
    expect(gridKey(37.5665, 126.978)).toBe("37.57,126.98");
    expect(gridKey(37.5701, 126.9849)).toBe("37.57,126.98");
  });

  it("keeps MET's Expires but never caches for less than 30 or more than 60 minutes", () => {
    const now = Date.parse("2026-10-22T18:00:00Z");
    expect(cacheSeconds("Thu, 22 Oct 2026 18:40:00 GMT", now)).toBe(2400);
    expect(cacheSeconds("Thu, 22 Oct 2026 18:05:00 GMT", now)).toBe(1800);
    expect(cacheSeconds("Thu, 22 Oct 2026 21:00:00 GMT", now)).toBe(3600);
    expect(cacheSeconds(null, now)).toBe(1800);
  });

  it("calls MET once with an identifying User-Agent, then serves every later visit from the cache", async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async () => metResponse());
    const first = await getWeather(seoul, { cache, fetcher: fetcher as never });
    const second = await getWeather({ ...seoul, lat: 37.5701 }, { cache, fetcher: fetcher as never });
    expect(first?.days).toHaveLength(7);
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${MET_ENDPOINT}?lat=37.57&lon=126.98`);
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(MET_USER_AGENT);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const stored = [...cache.store.values()][0];
    expect(stored.headers.get("cache-control")).toMatch(/^public, max-age=(1[89]\d\d|2\d{3}|3[0-5]\d\d|3600)$/);
  });

  it("renders without weather (null) when MET fails, times out or is rate limited, and does not cache it", async () => {
    for (const fetcher of [
      vi.fn(async () => new Response("busy", { status: 429 })),
      vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }),
    ]) {
      const cache = memoryCache();
      expect(await getWeather(seoul, { cache, fetcher: fetcher as never })).toBeNull();
      expect(cache.put).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });

  it("has no retry or self-scheduling path: one call per cache miss at most", async () => {
    const fetcher = vi.fn(async () => new Response("down", { status: 503 }));
    await getWeather(seoul, { cache: memoryCache(), fetcher: fetcher as never });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
