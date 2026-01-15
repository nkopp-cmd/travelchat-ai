"use client";

import Link from "next/link";
import { Sparkles, Map, ArrowRight, Lightbulb } from "lucide-react";
import { SUPPORTED_CITIES } from "@/lib/supported-cities";

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
        <div className={className}>
            {/* Welcome Header */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 mb-4 shadow-lg shadow-violet-500/30">
                    <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Welcome to Localley</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    Your AI-powered local guide. Ask me anything about hidden gems, local favorites, and authentic experiences.
                </p>
            </div>

            {/* Try Asking Section */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-muted-foreground">Try asking Alley...</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {EXAMPLE_PROMPTS.map((prompt, idx) => (
                        <button
                            key={idx}
                            onClick={() => onPromptClick?.(prompt.text)}
                            className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card hover:border-violet-500/30 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all text-left group"
                        >
                            <span className="text-xl flex-shrink-0">{prompt.icon}</span>
                            <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                                {prompt.text}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 sm:grid-cols-2 mb-8">
                <Link href="/itineraries/new" className="block">
                    <div className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-5 hover:border-violet-500/40 transition-all group">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                <Sparkles className="h-6 w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold mb-1 group-hover:text-violet-600 transition-colors">
                                    Generate Itinerary
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Get a personalized day-by-day plan in seconds
                                </p>
                            </div>
                            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-violet-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
                        </div>
                    </div>
                </Link>
                <Link href="/spots" className="block">
                    <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-5 hover:border-emerald-500/40 transition-all group">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                <Map className="h-6 w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold mb-1 group-hover:text-emerald-600 transition-colors">
                                    Browse Spots
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Explore hidden gems and local favorites
                                </p>
                            </div>
                            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
                        </div>
                    </div>
                </Link>
            </div>

            {/* Available Cities */}
            <div>
                <p className="text-sm text-muted-foreground mb-3 text-center">
                    Currently available in {SUPPORTED_CITIES.length} cities
                </p>
                <div className="flex justify-center gap-2 flex-wrap">
                    {SUPPORTED_CITIES.map((city) => (
                        <Link
                            key={city.name}
                            href={`/itineraries/new?city=${encodeURIComponent(city.name)}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-card hover:border-violet-500/30 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all text-sm"
                        >
                            <span>{city.emoji}</span>
                            <span>{city.name}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
