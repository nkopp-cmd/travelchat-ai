// Live weather from MET Norway Locationforecast 2.0 (shared/plans/localley-landing-map-weather.md
// step 3). Free for commercial use under CC BY 4.0 with attribution; MET requires an identifying
// User-Agent and asks clients to honour Expires. Open-Meteo's free tier is non-commercial: do not
// switch to it.
//
// Cost and load safety (HYBRID RULE): one upstream request per ~1 km grid cell per edge-cache
// period (30-60 min, from MET's Expires), stored in the Workers Cache API. Visitors never cause
// more than that, and nothing here reschedules itself.

export const MET_ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
export const MET_USER_AGENT = "Localley/1.0 (+https://localley.io; hello@localley.io)";
export const MET_ATTRIBUTION_URL = "https://api.met.no/doc/License";
const CACHE_ORIGIN = "https://weather-cache.localley.invalid";
const MIN_TTL_SECONDS = 30 * 60;
const MAX_TTL_SECONDS = 60 * 60;
const UPSTREAM_TIMEOUT_MS = 1500;
const FORECAST_DAYS = 7;

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "sleet" | "snow" | "thunder";

export interface WeatherDay {
    /** Local calendar date, YYYY-MM-DD. */
    date: string;
    minC: number;
    maxC: number;
    kind: WeatherKind;
    /** Summed precipitation forecast for the local day. */
    precipMm: number;
}

export interface CityWeather {
    updatedAt: string;
    current: { tempC: number; kind: WeatherKind; isNight: boolean };
    days: WeatherDay[];
}

interface MetEntry {
    time: string;
    data: {
        instant: { details: { air_temperature?: number } };
        next_1_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
        next_6_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
        next_12_hours?: { summary: { symbol_code: string } };
    };
}

interface MetForecast {
    properties: { meta: { updated_at: string }; timeseries: MetEntry[] };
}

/** MET symbol codes ("lightrainshowers_day", "partlycloudy_night") -> one of our icon kinds. */
export function weatherKind(symbol: string): WeatherKind {
    const code = symbol.replace(/_(day|night|polartwilight)$/, "");
    if (code.includes("thunder")) return "thunder";
    if (code.includes("sleet")) return "sleet";
    if (code.includes("snow")) return "snow";
    if (code.includes("rain")) return "rain";
    if (code === "fog") return "fog";
    if (code === "cloudy") return "cloudy";
    if (code === "partlycloudy" || code === "fair") return "partly";
    return "clear";
}

// Daily icon: the wettest or most severe condition of the daytime hours wins.
const SEVERITY: WeatherKind[] = ["clear", "partly", "cloudy", "fog", "rain", "sleet", "snow", "thunder"];

function localDate(iso: string, timeZone: string): { date: string; hour: number } {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function summarizeForecast(forecast: MetForecast, timeZone: string): CityWeather | null {
    const series = forecast.properties?.timeseries ?? [];
    const first = series[0];
    const firstTemp = first?.data.instant.details.air_temperature;
    if (!first || typeof firstTemp !== "number") return null;
    const firstSymbol = first.data.next_1_hours?.summary.symbol_code ?? first.data.next_6_hours?.summary.symbol_code ?? "cloudy";

    const days = new Map<string, { temps: number[]; kinds: WeatherKind[]; precip: number }>();
    for (const entry of series) {
        const { date, hour } = localDate(entry.time, timeZone);
        const day = days.get(date) ?? { temps: [], kinds: [], precip: 0 };
        const temp = entry.data.instant.details.air_temperature;
        if (typeof temp === "number") day.temps.push(temp);
        // Hourly steps carry next_1_hours; the later six-hourly steps carry next_6_hours only.
        const period = entry.data.next_1_hours ?? entry.data.next_6_hours;
        if (period) {
            day.precip += period.details?.precipitation_amount ?? 0;
            if (hour >= 8 && hour <= 20) day.kinds.push(weatherKind(period.summary.symbol_code));
        }
        days.set(date, day);
    }

    const summary: WeatherDay[] = [];
    for (const [date, day] of days) {
        if (day.temps.length < 2 || day.kinds.length === 0) continue;
        summary.push({
            date,
            minC: Math.round(Math.min(...day.temps)),
            maxC: Math.round(Math.max(...day.temps)),
            kind: day.kinds.reduce((worst, kind) => (SEVERITY.indexOf(kind) > SEVERITY.indexOf(worst) ? kind : worst)),
            precipMm: Math.round(day.precip * 10) / 10,
        });
        if (summary.length === FORECAST_DAYS) break;
    }

    return {
        updatedAt: forecast.properties.meta.updated_at,
        current: { tempC: Math.round(firstTemp), kind: weatherKind(firstSymbol), isNight: /_night$/.test(firstSymbol) },
        days: summary,
    };
}

/** ~1 km cell: MET asks for at most 4 decimals; 2 decimals lets nearby requests share one entry. */
export function gridKey(lat: number, lng: number): string {
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/** Cache lifetime from MET's Expires, kept between 30 and 60 minutes. */
export function cacheSeconds(expires: string | null, now = Date.now()): number {
    const until = expires ? Date.parse(expires) : Number.NaN;
    const seconds = Number.isFinite(until) ? Math.round((until - now) / 1000) : MIN_TTL_SECONDS;
    return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, seconds));
}

interface WeatherCache {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
}

function defaultCache(): WeatherCache | undefined {
    const store = (globalThis as { caches?: { default?: WeatherCache } }).caches;
    return store?.default;
}

/**
 * Forecast for a point, from the edge cache or one MET request. Returns null when MET is slow or
 * failing: the page renders without weather instead of waiting.
 */
export async function getWeather(
    point: { lat: number; lng: number; timeZone: string },
    deps: { cache?: WeatherCache; fetcher?: typeof fetch; waitUntil?: (promise: Promise<unknown>) => void } = {},
): Promise<CityWeather | null> {
    const cache = deps.cache ?? defaultCache();
    const fetcher = deps.fetcher ?? fetch;
    const cell = gridKey(point.lat, point.lng);
    const key = new Request(`${CACHE_ORIGIN}/v1/${cell}`);
    try {
        const hit = await cache?.match(key);
        if (hit) return summarizeForecast(await hit.json(), point.timeZone);

        const [lat, lng] = cell.split(",");
        const response = await fetcher(`${MET_ENDPOINT}?lat=${lat}&lon=${lng}`, {
            headers: { "User-Agent": MET_USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        if (!response.ok) return null;
        const body = await response.text();
        const weather = summarizeForecast(JSON.parse(body), point.timeZone);
        if (weather && cache) {
            const stored = new Response(body, {
                headers: {
                    "content-type": "application/json",
                    "cache-control": `public, max-age=${cacheSeconds(response.headers.get("expires"))}`,
                },
            });
            const write = cache.put(key, stored).catch(() => undefined);
            if (deps.waitUntil) deps.waitUntil(write);
            else await write;
        }
        return weather;
    } catch {
        return null;
    }
}
