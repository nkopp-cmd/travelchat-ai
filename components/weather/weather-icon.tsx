import type { WeatherKind } from "@/lib/weather/met-norway";

// Animated weather icons (CSS in app/globals.css, .ll-wx-*; reduced motion is static).
// No hooks and no data imports, so client islands can use it without the MET client.
export const WEATHER_LABEL: Record<WeatherKind, string> = {
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
