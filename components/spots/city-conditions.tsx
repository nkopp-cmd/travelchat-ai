import type { CityWeather, WeatherKind } from "@/lib/weather/met-norway";
import { MET_ATTRIBUTION_URL } from "@/lib/weather/met-norway";
import type { SeasonMonth } from "@/lib/season/season-table";

// Season chip + live weather for one city (shared/plans/localley-landing-map-weather.md step 3).
// Server-rendered from data fetched in parallel with the spots; no client JS.

const KIND_LABEL: Record<WeatherKind, string> = {
    clear: "Clear", partly: "Partly cloudy", cloudy: "Cloudy", fog: "Fog",
    rain: "Rain", sleet: "Sleet", snow: "Snow", thunder: "Thunderstorms",
};

export function WeatherIcon({ kind, night = false, className = "h-6 w-6" }: { kind: WeatherKind; night?: boolean; className?: string }) {
    const sun = night
        ? <path className="ll-wx-moon" d="M15.5 4.5a7 7 0 1 0 4 12.6 6 6 0 0 1-4-12.6Z" />
        : (
            <g className="ll-wx-sun">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" strokeWidth="1.8" strokeLinecap="round" stroke="currentColor" fill="none" />
            </g>
        );
    const cloud = <path className="ll-wx-cloud" d="M7 18h10.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8.2 9.6 4.2 4.2 0 0 0 7 18Z" />;
    return (
        <svg viewBox="0 0 24 24" className={`ll-wx ${className}`} data-kind={kind} aria-hidden="true" fill="currentColor">
            {kind === "clear" && sun}
            {kind === "partly" && <g transform="translate(-3 -3) scale(0.8)">{sun}</g>}
            {(kind !== "clear") && cloud}
            {(kind === "rain" || kind === "thunder" || kind === "sleet") && (
                <g className="ll-wx-drops" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M9 20v2M12.5 20v2M16 20v2" />
                </g>
            )}
            {kind === "snow" && <g className="ll-wx-drops"><circle cx="9" cy="21" r="1" /><circle cx="12.5" cy="21.5" r="1" /><circle cx="16" cy="21" r="1" /></g>}
            {kind === "thunder" && <path d="M12.5 13.5 10 18h2.5l-1 3.5 3.5-5h-2.5l1-3Z" className="ll-wx-bolt" />}
        </svg>
    );
}

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
