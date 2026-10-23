import type { CityWeather } from "@/lib/weather/met-norway";
import { MET_ATTRIBUTION_URL } from "@/lib/weather/met-norway";
import type { SeasonMonth } from "@/lib/season/season-table";
import { WEATHER_LABEL as KIND_LABEL, WeatherIcon } from "@/components/weather/weather-icon";

export { WeatherIcon };

// Season chip + live weather for one city (shared/plans/localley-landing-map-weather.md step 3).
// Server-rendered from data fetched in parallel with the spots; no client JS.

function weekday(date: string, timeZone: string, index: number): string {
    if (index === 0) return "Today";
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(new Date(`${date}T12:00:00Z`));
}

export function CityConditions({ cityName, timeZone, season, weather }: {
    cityName: string;
    timeZone: string;
    season: SeasonMonth | null;
    weather: CityWeather | null;
}) {
    if (!season && !weather) return null;
    return (
        <section aria-label={`Season and weather in ${cityName}`} className="mb-6 rounded-2xl bg-surface p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
                {season && (
                    <span className="ll-season-chip" data-kind={season.kind}>
                        <span className="font-semibold">{season.label}</span>
                        <span className="text-muted-foreground">· typical {season.tempC[0]}–{season.tempC[1]}°C</span>
                    </span>
                )}
                {season && season.score >= 4 && (
                    <span className="rounded-full bg-raised px-3 py-1 text-xs font-semibold text-foreground">Good time to go</span>
                )}
                {weather && (
                    <span className="ml-auto flex items-center gap-2 text-sm text-foreground">
                        <WeatherIcon kind={weather.current.kind} night={weather.current.isNight} className="h-5 w-5" />
                        <span><span className="font-semibold">Now {weather.current.tempC}°</span>{" "}<span className="text-muted-foreground">{KIND_LABEL[weather.current.kind]}</span></span>
                    </span>
                )}
            </div>
            {weather && weather.days.length > 0 && (
                <>
                    <ol className="mt-4 grid grid-cols-7 gap-1 text-center" aria-label={`${weather.days.length}-day forecast`}>
                        {weather.days.map((day, index) => (
                            <li key={day.date} className="flex flex-col items-center gap-1 rounded-xl px-0.5 py-2"
                                aria-label={`${weekday(day.date, timeZone, index)}: ${KIND_LABEL[day.kind]}, ${day.maxC}° / ${day.minC}°${day.precipMm >= 0.5 ? `, ${day.precipMm} mm rain` : ""}`}>
                                <span className="text-xs font-medium text-muted-foreground" aria-hidden="true">{weekday(day.date, timeZone, index)}</span>
                                <WeatherIcon kind={day.kind} className="h-6 w-6" />
                                <span className="text-sm font-semibold text-foreground" aria-hidden="true">{day.maxC}°</span>
                                <span className="text-xs text-muted-foreground" aria-hidden="true">{day.minC}°</span>
                                <span className="h-4 whitespace-nowrap text-xs leading-3 text-muted-foreground" aria-hidden="true">
                                    {day.precipMm >= 0.5 ? `${Math.round(day.precipMm)}mm` : ""}
                                </span>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Forecast by <a href={MET_ATTRIBUTION_URL} className="underline underline-offset-2" target="_blank" rel="noopener">MET Norway</a> (CC BY 4.0), updated every 30–60 min.
                    </p>
                </>
            )}
        </section>
    );
}
