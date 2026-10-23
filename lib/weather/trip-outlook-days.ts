import type { SeasonKind } from "@/lib/season/season-table";
import type { WeatherDay, WeatherKind } from "@/lib/weather/met-norway";

// Client-safe half of the planner trip outlook (no city list, no MET client): types and the
// per-day merge of forecast and season. Server half: lib/weather/trip-outlook.ts.

export interface OutlookSeason {
    label: string;
    kind: SeasonKind;
    tempC: [number, number];
}

export interface CityOutlook {
    slug: string;
    name: string;
    /** January .. December. */
    months: OutlookSeason[];
    forecast: WeatherDay[];
}

export type OutlookDay =
    | { date: string; source: "forecast"; kind: WeatherKind; minC: number; maxC: number; precipMm: number }
    | { date: string; source: "season"; season: OutlookSeason };

/** One entry per trip day (calendar dates, UTC arithmetic like lib/trips/date-range). */
export function tripOutlook(startDate: string, days: number, outlook: Pick<CityOutlook, "months" | "forecast">): OutlookDay[] {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(start.getTime()) || outlook.months.length !== 12) return [];
    const byDate = new Map(outlook.forecast.map((day) => [day.date, day]));
    return Array.from({ length: Math.max(0, Math.min(days, 21)) }, (_, index) => {
        const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
        const day = byDate.get(date);
        if (day) return { date, source: "forecast", kind: day.kind, minC: day.minC, maxC: day.maxC, precipMm: day.precipMm };
        return { date, source: "season", season: outlook.months[Number(date.slice(5, 7)) - 1] };
    });
}
