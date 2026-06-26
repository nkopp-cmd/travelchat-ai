"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass, DollarSign, Menu, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { CityImageAvatar } from "@/components/ui/city-image";

const marketingLinks = [
    {
        href: "/spots",
        label: "Explore spots",
        description: "Browse local-first places by city",
        icon: Compass,
    },
    {
        href: "/pricing",
        label: "Pricing",
        description: "Choose Pro or Premium before you travel",
        icon: DollarSign,
    },
];

/**
 * Marketing-specific navbar for landing and public pages.
 * Does not expose authenticated app routes (My Itineraries, Profile).
 * Focuses on selling the product with clear CTAs.
 */
export function MarketingNavbar() {
    return (
        <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-gradient-to-b from-black/80 via-black/60 to-transparent backdrop-blur-md">
            <div className="container flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="md:hidden text-white/80 hover:text-white hover:bg-white/10"
                            >
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent
                            side="left"
                            className="w-[86vw] max-w-[340px] border-r border-violet-200/15 bg-[#0b0714]/96 p-0 text-white shadow-2xl shadow-violet-950/40 backdrop-blur-xl"
                        >
                            <nav className="flex h-full min-h-dvh flex-col gap-5 px-4 pb-6 pt-6">
                                <div className="space-y-4">
                                    <Logo size="md" isLanding={true} />
                                    <div className="rounded-lg border border-violet-200/15 bg-white/[0.045] p-4">
                                        <div className="mb-3 flex -space-x-2">
                                            {["Seoul", "Tokyo", "Bangkok", "Singapore"].map((city) => (
                                                <CityImageAvatar
                                                    key={city}
                                                    city={city}
                                                    className="h-9 w-9 rounded-full ring-2 ring-[#0b0714]"
                                                    sizes="36px"
                                                />
                                            ))}
                                        </div>
                                        <p className="text-sm font-bold text-white">Plan Asia like a local friend made the map.</p>
                                        <p className="mt-1 text-xs leading-5 text-violet-100/65">Local routes, paid access, fewer tourist traps.</p>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    {marketingLinks.map((item) => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className="group flex min-h-16 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 transition hover:border-violet-300/40 hover:bg-violet-400/10"
                                        >
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200 transition group-hover:bg-violet-500 group-hover:text-white">
                                                <item.icon className="h-5 w-5" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-bold text-white">{item.label}</span>
                                                <span className="block text-xs leading-5 text-white/55">{item.description}</span>
                                            </span>
                                            <ArrowRight className="h-4 w-4 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-violet-200" />
                                        </Link>
                                    ))}
                                </div>

                                <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
                                    <Link href="/sign-up">
                                        <Button className="h-12 w-full rounded-lg bg-violet-500 font-bold text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400">
                                            <Sparkles className="h-4 w-4" />
                                            Create account
                                        </Button>
                                    </Link>
                                    <Link href="/sign-in">
                                        <Button
                                            variant="outline"
                                            className="h-11 w-full rounded-lg border-white/10 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white"
                                        >
                                            Sign in
                                        </Button>
                                    </Link>
                                </div>
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <Logo size="md" isLanding={true} />
                </div>

                <nav className="hidden md:flex items-center gap-1">
                    <Link
                        href="/spots"
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <Compass className="h-4 w-4" />
                        Explore
                    </Link>
                    <Link
                        href="/pricing"
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <DollarSign className="h-4 w-4" />
                        Pricing
                    </Link>
                </nav>

                <div className="flex items-center gap-2">
                    <Link href="/sign-in">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-white/80 hover:text-white hover:bg-white/10"
                        >
                            Sign In
                        </Button>
                    </Link>
                    <Link href="/sign-up">
                        <Button
                            size="sm"
                            className="bg-violet-600 hover:bg-violet-700 rounded-full px-6 shadow-lg shadow-violet-500/20 transition-all hover:scale-105"
                        >
                            Get Started
                        </Button>
                    </Link>
                </div>
            </div>
        </header>
    );
}
