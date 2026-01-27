"use client";

import Link from "next/link";
import { Sparkles, Map, ArrowRight, Lightbulb, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_CITIES } from "@/lib/supported-cities";

interface OnboardingPanelProps {
    className?: string;
    onPromptClick?: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
    {
        text: "Find me the best street food in Seoul",
        icon: "🍜",
        gradient: "from-orange-500/20 to-amber-500/10",
    },
    {
        text: "What are some hidden bars in Tokyo?",
        icon: "🍸",
        gradient: "from-purple-500/20 to-violet-500/10",
    },
    {
        text: "Show me vintage shops in Bangkok",
        icon: "🛍️",
        gradient: "from-pink-500/20 to-rose-500/10",
    },
    {
        text: "Where do locals hang out in Singapore?",
        icon: "🌴",
        gradient: "from-emerald-500/20 to-teal-500/10",
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
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative">
                {/* Welcome Header with animated icon */}
                <div className="text-center mb-10">
                    <div className="relative inline-flex mb-5">
                        {/* Glow effect */}
                        <div className="absolute inset-0 h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 blur-xl opacity-50 animate-pulse" />
                        <div className={cn(
                            "relative inline-flex items-center justify-center h-20 w-20 rounded-2xl",
                            "bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600",
                            "shadow-2xl shadow-violet-500/40",
                            "transform hover:scale-105 transition-transform duration-300"
                        )}>
                            <Sparkles className="h-10 w-10 text-white" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600">
                        Welcome to Localley
                    </h2>
                    <p className="text-muted-foreground max-w-md mx-auto text-base">
                        Your AI-powered local guide. Discover hidden gems, local favorites, and authentic experiences.
                    </p>
                </div>

                {/* Try Asking Section with premium prompt cards */}
                <div className="mb-10">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                            <Lightbulb className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-foreground/80">Try asking Alley...</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {EXAMPLE_PROMPTS.map((prompt, idx) => (
                            <button
                                key={idx}
                                onClick={() => onPromptClick?.(prompt.text)}
                                className={cn(
                                    "flex items-center gap-3 p-4 rounded-xl",
                                    "border border-black/5 dark:border-white/10",
                                    "bg-white/60 dark:bg-white/5 backdrop-blur-md",
                                    "hover:shadow-lg hover:shadow-violet-500/10",
                                    "hover:border-violet-400/50 hover:-translate-y-1",
                                    "transition-all duration-300 text-left group",
                                    "relative overflow-hidden"
                                )}
                            >
                                {/* Gradient background on hover */}
                                <div className={cn(
                                    "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                                    prompt.gradient
                                )} />

                                <span className="relative text-2xl flex-shrink-0 transform group-hover:scale-110 transition-transform duration-300">
                                    {prompt.icon}
                                </span>
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
                            "bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-indigo-500/10",
                            "border border-violet-500/20 hover:border-violet-500/40",
                            "shadow-lg hover:shadow-2xl hover:shadow-violet-500/20",
                            "transition-all duration-300",
                            "hover:-translate-y-1"
                        )}>
                            {/* Animated background glow */}
                            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className="relative flex items-start gap-4">
                                <div className={cn(
                                    "h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0",
                                    "bg-gradient-to-br from-violet-600 to-indigo-600",
                                    "shadow-lg shadow-violet-500/30",
                                    "group-hover:scale-110 group-hover:rotate-3 transition-all duration-300"
                                )}>
                                    <Sparkles className="h-7 w-7 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-lg mb-1 group-hover:text-violet-600 transition-colors">
                                        Generate Itinerary
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Get a personalized day-by-day plan in seconds
                                    </p>
                                </div>
                                <ArrowRight className={cn(
                                    "h-5 w-5 text-muted-foreground flex-shrink-0 mt-1",
                                    "group-hover:text-violet-600 group-hover:translate-x-2",
                                    "transition-all duration-300"
                                )} />
                            </div>
                        </div>
                    </Link>

                    <Link href="/spots" className="block group">
                        <div className={cn(
                            "relative overflow-hidden rounded-2xl p-6",
                            "bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-cyan-500/10",
                            "border border-emerald-500/20 hover:border-emerald-500/40",
                            "shadow-lg hover:shadow-2xl hover:shadow-emerald-500/20",
                            "transition-all duration-300",
                            "hover:-translate-y-1"
                        )}>
                            {/* Animated background glow */}
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className="relative flex items-start gap-4">
                                <div className={cn(
                                    "h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0",
                                    "bg-gradient-to-br from-emerald-600 to-teal-600",
                                    "shadow-lg shadow-emerald-500/30",
                                    "group-hover:scale-110 group-hover:rotate-3 transition-all duration-300"
                                )}>
                                    <Map className="h-7 w-7 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-lg mb-1 group-hover:text-emerald-600 transition-colors">
                                        Browse Spots
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Explore hidden gems and local favorites
                                    </p>
                                </div>
                                <ArrowRight className={cn(
                                    "h-5 w-5 text-muted-foreground flex-shrink-0 mt-1",
                                    "group-hover:text-emerald-600 group-hover:translate-x-2",
                                    "transition-all duration-300"
                                )} />
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Available Cities with premium styling */}
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10">
                        <Globe className="h-4 w-4 text-violet-500" />
                        <span className="text-sm text-muted-foreground">
                            Available in <span className="font-semibold text-foreground">{SUPPORTED_CITIES.length}</span> cities
                        </span>
                    </div>
                    <div className="flex justify-center gap-2 flex-wrap">
                        {SUPPORTED_CITIES.map((city, idx) => (
                            <Link
                                key={city.name}
                                href={`/itineraries/new?city=${encodeURIComponent(city.name)}`}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-full",
                                    "border border-black/5 dark:border-white/10",
                                    "bg-white/60 dark:bg-white/5 backdrop-blur-sm",
                                    "hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/10",
                                    "hover:-translate-y-0.5 hover:bg-violet-50 dark:hover:bg-violet-950/30",
                                    "transition-all duration-200 text-sm group"
                                )}
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                <span className="transform group-hover:scale-110 transition-transform">
                                    {city.emoji}
                                </span>
                                <span className="font-medium">{city.name}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
