"use client";

import { useEffect, useState } from "react";
import { WEATHER_LABEL, WeatherIcon } from "@/components/weather/weather-icon";
import { MET_ATTRIBUTION_URL } from "@/lib/weather/met-norway";
import { tripOutlook, type CityOutlook } from "@/lib/weather/trip-outlook-days";

// "Your days in <city>": forecast for days inside MET's 7-day window, the usual season after
// that. One cached GET per city, only once the traveller has picked a start date.

function dayLabel(date: string): string {
    const weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
    return `${weekday} ${Number(date.slice(8, 10))}`;
}

export function TripOutlook({ city, startDate, days, fetcher = fetch }: {
    city: string;
    startDate?: string;
    days: number;
    fetcher?: typeof fetch;
}) {
    const [outlook, setOutlook] = useState<{ city: string; data: CityOutlook | null } | null>(null);
    const ready = Boolean(city && startDate);

    useEffect(() => {
        if (!ready || outlook?.city === city) return;
        const controller = new AbortController();
        fetcher(`/api/conditions/${encodeURIComponent(city)}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: CityOutlook | null) => setOutlook({ city, data }))
            .catch(() => { if (!controller.signal.aborted) setOutlook({ city, data: null }); });
        return () => controller.abort();
    }, [ready, city, outlook?.city, fetcher]);

    const data = outlook?.city === city ? outlook.data : null;
    if (!ready || !data || !startDate) return null;
    const list = tripOutlook(startDate, days, data);
    if (list.length === 0) return null;
    const hasForecast = list.some((day) => day.source === "forecast");

    return (
        <section aria-label={`Weather and season for your days in ${data.name}`} className="mt-4 rounded-2xl bg-surface p-3 sm:p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Your days in {data.name}</h3>
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                {list.map((day) => (
                    <li key={day.date} className="flex flex-col items-center gap-1 rounded-xl bg-raised px-1 py-2 text-center">
                        <span className="text-xs font-medium text-muted-foreground">{dayLabel(day.date)}</span>
                        {day.source === "forecast" ? (
                            <>
                                <WeatherIcon kind={day.kind} className="h-6 w-6" />
                                <span className="text-sm font-semibold text-foreground">{day.maxC}° <span className="font-normal text-muted-foreground">{day.minC}°</span></span>
                                <span className="sr-only">{WEATHER_LABEL[day.kind]}{day.precipMm >= 0.5 ? `, ${day.precipMm} mm rain` : ""}</span>
                            </>
                        ) : (
                            <>
                                <span className="ll-season-dot" data-kind={day.season.kind} aria-hidden="true" />
                                <span className="text-xs leading-4 text-foreground">{day.season.label}</span>
                                <span className="text-xs text-muted-foreground">usually {day.season.tempC[0]}–{day.season.tempC[1]}°</span>
                            </>
                        )}
                    </li>
                ))}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
                {hasForecast
                    ? <>Forecast by <a href={MET_ATTRIBUTION_URL} className="underline underline-offset-2" target="_blank" rel="noopener">MET Norway</a> (CC BY 4.0); later days show the usual season.</>
                    : "The forecast starts 7 days before your trip; until then you see the usual season."}
            </p>
        </section>
    );
}
