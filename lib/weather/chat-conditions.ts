import { getCityByName } from "@/lib/cities";
import { localMonth, seasonFor } from "@/lib/season/season-table";
import { getWeather, type CityWeather, type WeatherKind } from "@/lib/weather/met-norway";

// Season + weather lines for the Alley chat prompt (shared/plans/localley-landing-map-weather.md
// step 3, chat context), so suggestions can fit the season and the next days' weather. Reviewed
// cities only; MET reads go through the shared grid cache. Empty string when nothing is known.

const KIND_TEXT: Record<WeatherKind, string> = {
    clear: "clear", partly: "partly cloudy", cloudy: "cloudy", fog: "fog",
    rain: "rain", sleet: "sleet", snow: "snow", thunder: "thunderstorms",
};

function weekday(date: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(new Date(`${date}T12:00:00Z`));
}

export function formatChatConditions(
    cityName: string,
    timeZone: string,
    season: ReturnType<typeof seasonFor>,
    weather: CityWeather | null,
): string {
    const lines: string[] = [];
    if (season) lines.push(`- Season now: ${season.label} (usually ${season.tempC[0]}-${season.tempC[1]}°C).`);
    if (weather) {
        lines.push(`- Right now: ${weather.current.tempC}°C, ${KIND_TEXT[weather.current.kind]}.`);
        const days = weather.days.slice(0, 5).map((day) =>
            `${weekday(day.date, timeZone)} ${day.maxC}/${day.minC}°C ${KIND_TEXT[day.kind]}${day.precipMm >= 0.5 ? ` ${Math.round(day.precipMm)}mm` : ""}`);
        if (days.length > 0) lines.push(`- Next days (MET Norway forecast): ${days.join("; ")}.`);
    }
    if (lines.length === 0) return "";
    return `\nSEASON AND WEATHER IN ${cityName.toUpperCase()} (live data, use only when relevant, e.g. indoor ideas on rainy days; never invent other weather):\n${lines.join("\n")}`;
}

export async function chatConditions(
    cityName: string,
    deps: Parameters<typeof getWeather>[1] = {},
    now = new Date(),
): Promise<string> {
    const city = getCityByName(cityName);
    if (!city) return "";
    const season = seasonFor(city.slug, localMonth(city.timezone, now));
    if (!season) return "";
    const weather = await getWeather({ lat: city.center.lat, lng: city.center.lng, timeZone: city.timezone }, { ...deps, now: now.getTime() });
    return formatChatConditions(city.name, city.timezone, season, weather);
}
