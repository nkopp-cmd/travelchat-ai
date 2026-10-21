"use client";

import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { Sparkles, Map, ArrowRight, Lightbulb, Globe } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { SUPPORTED_CITIES } from "@/lib/supported-cities";
import { CityImageAvatar } from "@/components/ui/city-image";

interface OnboardingPanelProps {
    className?: string;
    onPromptClick?: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
    {
        text: "Find me the best street food in Seoul",
        icon: "🍜",
    },
    {
        text: "What are some hidden bars in Tokyo?",
        icon: "🍸",
    },
    {
        text: "Show me vintage shops in Bangkok",
        icon: "🛍️",
    },
    {
        text: "Where do locals hang out in Singapore?",
        icon: "🌴",
    },
];

/**
 * Onboarding panel shown when user has no itineraries or on first visit.
 * Provides guidance, example prompts, and clear CTAs to get started.
 */
export function OnboardingPanel({ className, onPromptClick }: OnboardingPanelProps) {
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
                    lede="Your local guide for hidden gems, local favorites and authentic experiences."
                />

                {/* Try Asking Section with premium prompt cards */}
                <div className="mb-10">
                    <div className="flex items-center gap-2 mb-5">
                        <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                        <span className="text-[15px] font-semibold text-foreground">Try asking Alley</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {EXAMPLE_PROMPTS.map((prompt, idx) => (
                            <button
                                key={idx}
                                onClick={() => onPromptClick?.(prompt.text)}
                                className={cn(
                                    "flex items-center gap-3 p-4 rounded-xl",
                                    "bg-surface shadow-surface hover:bg-raised",
                                    "transition-all duration-300 text-left group",
                                    "relative overflow-hidden"
                                )}
                            >

                                <CityImageAvatar
                                    city={prompt.text}
                                    className="relative h-12 w-12 flex-shrink-0 rounded-lg transition-transform duration-300 group-hover:scale-105"
                                    sizes="48px"
                                />
                                <span className="relative text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                                    {prompt.text}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick Actions with glassmorphism */}
                <div className="grid gap-4 sm:grid-cols-2 mb-10">
                    <Link href="/itineraries/new" className="block group">
                        <div className={cn(
                            "relative overflow-hidden rounded-2xl p-6",
                            "bg-surface shadow-surface hover:bg-raised",
                            "transition-colors duration-300"
                        )}>
                            <div className="relative flex items-start gap-4">
                                <div className={cn(
                                    "h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0",
                                    "bg-primary text-primary-foreground",
                                    "transition-transform duration-300 group-hover:scale-105"
                                )}>
                                    <Sparkles className="h-7 w-7" aria-hidden="true" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                                        Generate Itinerary
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Get a personalized day-by-day plan in seconds
                                    </p>
                                </div>
                                <ArrowRight className={cn(
                                    "h-5 w-5 text-muted-foreground flex-shrink-0 mt-1",
                                    "group-hover:text-primary group-hover:translate-x-2",
                                    "transition-all duration-300"
                                )} />
                            </div>
                        </div>
                    </Link>

                    <Link href="/spots" className="block group">
                        <div className={cn(
                            "relative overflow-hidden rounded-2xl p-6",
                            "bg-surface shadow-surface hover:bg-raised",
                            "transition-colors duration-300"
                        )}>
                            <div className="relative flex items-start gap-4">
                                <div className={cn(
                                    "h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0",
                                    "bg-primary text-primary-foreground",
                                    "transition-transform duration-300 group-hover:scale-105"
                                )}>
                                    <Map className="h-7 w-7" aria-hidden="true" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                                        Browse Spots
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Explore hidden gems and local favorites
                                    </p>
                                </div>
                                <ArrowRight className={cn(
                                    "h-5 w-5 text-muted-foreground flex-shrink-0 mt-1",
                                    "group-hover:text-primary group-hover:translate-x-2",
                                    "transition-all duration-300"
                                )} />
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Available Cities with premium styling */}
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-raised">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-sm text-muted-foreground">
                            Available in <span className="font-semibold text-foreground">{SUPPORTED_CITIES.length}</span> cities
                        </span>
                    </div>
                    <div className="rounded-2xl bg-surface p-3">
                        <div className="max-h-[16rem] overflow-y-auto pr-2 scrollbar-hide">
                            <div className="flex justify-center gap-2 flex-wrap">
                                {SUPPORTED_CITIES.map((city, idx) => (
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
