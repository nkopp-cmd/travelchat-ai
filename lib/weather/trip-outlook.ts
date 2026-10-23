import { getCityByName, getCityBySlug } from "@/lib/cities";
import { SEASON_TABLE } from "@/lib/season/season-table";
import { getWeather } from "@/lib/weather/met-norway";
import type { CityOutlook } from "@/lib/weather/trip-outlook-days";

// Planner trip outlook (shared/plans/localley-landing-map-weather.md step 3, planner days):
// each trip day gets the MET forecast when it is inside the 7-day window, otherwise the
// reviewed season for that month. Only cities in the season table answer, so the input
// space (and the upstream calls) stay bounded.

export function resolveOutlookCity(input: string) {
    const city = getCityBySlug(input.toLowerCase()) ?? getCityByName(input);
    return city && SEASON_TABLE[city.slug] ? city : undefined;
}

export async function cityOutlook(
    input: string,
    deps: Parameters<typeof getWeather>[1] = {},
): Promise<CityOutlook | null> {
    const city = resolveOutlookCity(input);
    if (!city) return null;
    const weather = await getWeather({ lat: city.center.lat, lng: city.center.lng, timeZone: city.timezone }, deps);
    return {
        slug: city.slug,
        name: city.name,
        months: SEASON_TABLE[city.slug].months.map(({ label, kind, tempC }) => ({ label, kind, tempC })),
        forecast: weather?.days ?? [],
    };
}
