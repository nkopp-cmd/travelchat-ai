import { getCityBySlug } from "@/lib/cities";
import { localMonth, seasonFor, type SeasonKind } from "@/lib/season/season-table";
import { getWeather, type WeatherKind } from "@/lib/weather/met-norway";

// Season + current weather for a fixed list of cities in one response (the landing "Weekend
// picks", shared/plans/localley-landing-map-weather.md step 3). Each city reads the shared
// MET grid-cell cache, so this adds no per-visitor upstream calls.

export interface PickCondition {
    season: { label: string; kind: SeasonKind; score: number } | null;
    now: { tempC: number; kind: WeatherKind; isNight: boolean } | null;
}

export async function pickConditions(
    slugs: readonly string[],
    deps: Parameters<typeof getWeather>[1] = {},
    now = new Date(),
): Promise<Record<string, PickCondition>> {
    const entries = await Promise.all(slugs.map(async (slug): Promise<[string, PickCondition] | null> => {
        const city = getCityBySlug(slug);
        if (!city) return null;
        const season = seasonFor(slug, localMonth(city.timezone, now));
        const weather = await getWeather({ lat: city.center.lat, lng: city.center.lng, timeZone: city.timezone }, { ...deps, now: now.getTime() });
        return [slug, {
            season: season && { label: season.label, kind: season.kind, score: season.score },
            now: weather?.current ?? null,
        }];
    }));
    return Object.fromEntries(entries.filter((entry): entry is [string, PickCondition] => entry !== null));
}
