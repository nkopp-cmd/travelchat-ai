"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { WEATHER_LABEL, WeatherIcon } from "@/components/weather/weather-icon";
import type { PickCondition } from "@/lib/weather/pick-conditions";

// Season + live weather chips on the Weekend picks (shared/plans/localley-landing-map-weather.md
// step 3). The landing page is a static asset, so the chips load in ONE cached request
// (/api/conditions) when the picks come near the screen; until then, and if it fails, the
// cards show no chip.

type Conditions = Record<string, PickCondition>;
let conditions: Conditions | null = null;
let requested = false;
const listeners = new Set<() => void>();

export function loadPickConditions(fetcher: typeof fetch = fetch): Promise<void> {
    if (requested) return Promise.resolve();
    requested = true;
    return fetcher("/api/conditions")
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { cities?: Conditions } | null) => {
            if (!body?.cities) return;
            conditions = body.cities;
            for (const listener of listeners) listener();
        })
        .catch(() => undefined);
}

/** Test hook: forget the loaded data. */
export function resetPickConditions() {
    conditions = null;
    requested = false;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function usePickConditions(): Conditions | null {
    return useSyncExternalStore(subscribe, () => conditions, () => null);
}

export function PickChip({ slug }: { slug: string }) {
    const anchor = useRef<HTMLSpanElement>(null);
    const all = usePickConditions();

    useEffect(() => {
        const element = anchor.current;
        if (!element || requested) return;
        if (typeof IntersectionObserver === "undefined") {
            void loadPickConditions();
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            void loadPickConditions();
        }, { rootMargin: "600px 0px" });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const item = all?.[slug];
    if (!item?.season && !item?.now) return <span ref={anchor} className="ll-pick-chip-slot" />;
    return (
        <span ref={anchor} className="ll-pick-chip-slot">
            <span className="ll-pick-chip" data-kind={item.season?.kind}>
                {item.season && <span className="font-semibold">{item.season.label}</span>}
                {item.now && (
                    <span className="flex items-center gap-1">
                        <WeatherIcon kind={item.now.kind} night={item.now.isNight} className="h-4 w-4" />
                        {item.now.tempC}° <span className="sr-only">{WEATHER_LABEL[item.now.kind]}</span>
                    </span>
                )}
            </span>
        </span>
    );
}

/** MET Norway's CC BY 4.0 credit, shown once the weather is on screen. */
export function PickAttribution() {
    const all = usePickConditions();
    if (!all || !Object.values(all).some((item) => item.now)) return null;
    return (
        <p className="mx-auto mt-3 max-w-xl px-4 text-center text-xs text-muted-foreground">
            Weather by <a href="https://api.met.no/doc/License" className="underline underline-offset-2" target="_blank" rel="noopener">MET Norway</a> (CC BY 4.0)
        </p>
    );
}
