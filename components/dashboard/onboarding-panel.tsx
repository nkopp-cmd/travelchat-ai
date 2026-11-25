"use client";

import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { Sparkles, Map, ArrowRight, Lightbulb, Globe } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { SUPPORTED_CITIES } from "@/lib/supported-cities";
import { CityImageAvatar } from "@/components/ui/city-image";

interface OnboardingPanelProps {
    className?: string;
    /** Push DD1: names of the cities the planner offers (lib/cities-catalog plannerCities). null: catalog unavailable. */
    plannerCityNames?: string[] | null;
}

// Push CM2: a new account's first screen offers ONE primary action, the first free plan. The old "Try asking Alley"
// cards were buttons with no handler on /dashboard (onPromptClick was never passed), so the first four clicks did
// nothing. They are now planner links with the city filled in.
const CITY_STARTS = [
    { city: "Seoul", text: "Street food and late-night markets in Seoul" },
    { city: "Tokyo", text: "Hidden bars and quiet side streets in Tokyo" },
    { city: "Bangkok", text: "Vintage shops and canal-side food in Bangkok" },
    { city: "Singapore", text: "Where locals eat and hang out in Singapore" },
] as const;

const cardClass = "relative overflow-hidden rounded-2xl p-6 bg-surface shadow-surface hover:bg-raised transition-colors duration-300";

/**
 * Onboarding panel shown on desktop when the account has no itineraries yet.
 * First action: plan the first trip (free). Then city starts, then the spot map.
 */
export function OnboardingPanel({ className, plannerCityNames }: OnboardingPanelProps) {
    // A 1-3 spot city linked here opened a planner whose free plan could not build (Push DD1).
    const offered = plannerCityNames ? new Set(plannerCityNames) : null;
    const cities = offered ? SUPPORTED_CITIES.filter((city) => offered.has(city.name)) : SUPPORTED_CITIES;
    return (
        <div className={cn("relative", className)}>
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
            </div>

            <div className="relative">
                <PageHeader
                    className="mb-8"
                    eyebrow="Get started"
                    eyebrowIcon={Sparkles}
                    title="Welcome to Localley"
                    lede="Start with one free plan: pick a city and get a day-by-day route built from spots locals rate."
                />

                {/* The one primary action */}
                <Link href="/itineraries/new" data-testid="onboarding-first-plan" className="group mb-8 block">
                    <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-surface transition-opacity duration-300 hover:opacity-95">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
                            <Sparkles className="h-7 w-7" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="mb-1 text-lg font-bold">Plan your first trip</h3>
                            <p className="text-sm text-primary-foreground/85">Free. A day-by-day plan in under a minute.</p>
                        </div>
                        <ArrowRight className="h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:translate-x-2" aria-hidden="true" />
                    </div>
                </Link>

                {/* City starts: the planner with the city filled in */}
                <div className="mb-10">
                    <div className="mb-5 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                        <h2 className="text-[15px] font-semibold text-foreground">Or start from a city</h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {CITY_STARTS.map((start) => (
                            <Link
                                key={start.city}
                                href={`/itineraries/new?city=${encodeURIComponent(start.city)}`}
                                className="group relative flex items-center gap-3 overflow-hidden rounded-xl bg-surface p-4 text-left shadow-surface transition-all duration-300 hover:bg-raised"
                            >
                                <CityImageAvatar
                                    city={start.city}
                                    className="relative h-12 w-12 flex-shrink-0 rounded-lg transition-transform duration-300 group-hover:scale-105"
                                    sizes="48px"
                                />
                                <span className="relative text-sm text-foreground/80 transition-colors group-hover:text-foreground">
                                    {start.text}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Secondary: the spot map */}
                <Link href="/spots?view=map" className="group mb-10 block">
                    <div className={cardClass}>
                        <div className="relative flex items-start gap-4">
                            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-raised text-primary transition-transform duration-300 group-hover:scale-105">
                                <Map className="h-7 w-7" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="mb-1 text-lg font-bold transition-colors group-hover:text-primary">Spot map</h3>
                                <p className="text-sm text-muted-foreground">Every spot we know, on one map</p>
                            </div>
                            <ArrowRight className="mt-1 h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:translate-x-2 group-hover:text-primary" aria-hidden="true" />
                        </div>
                    </div>
                </Link>

                {/* Available Cities with premium styling */}
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-raised">
                        <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
                        <span className="text-sm text-muted-foreground">
                            Available in <span className="font-semibold text-foreground">{cities.length}</span> cities
                        </span>
                    </div>
                    <div className="rounded-2xl bg-surface p-3">
                        <div className="max-h-[16rem] overflow-y-auto pr-2 scrollbar-hide">
                            <div className="flex justify-center gap-2 flex-wrap">
                                {cities.map((city, idx) => (
                                    <Link
                                        key={city.name}
                                        href={`/itineraries/new?city=${encodeURIComponent(city.name)}`}
                                        className={cn(
                                            "inline-flex items-center gap-2 px-2 py-1.5 rounded-full",
                                            "bg-raised hover:bg-primary/15",
                                            "transition-all duration-200 text-sm group"
                                        )}
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                    >
                                        <CityImageAvatar city={city.name} className="h-8 w-8 rounded-full" sizes="32px" />
                                        <span className="font-medium">{city.name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
