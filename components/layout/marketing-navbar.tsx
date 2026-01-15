"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, Compass, DollarSign } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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
                            className="w-[240px] sm:w-[300px] border-r-white/10 bg-black/95 backdrop-blur-xl text-white"
                        >
                            <nav className="flex flex-col gap-4 mt-8">
                                <Link
                                    href="/spots"
                                    className="flex items-center gap-2 px-2 py-1 text-lg font-medium text-gray-400 hover:text-violet-400 transition-colors"
                                >
                                    <Compass className="h-5 w-5" />
                                    Explore
                                </Link>
                                <Link
                                    href="/pricing"
                                    className="flex items-center gap-2 px-2 py-1 text-lg font-medium text-gray-400 hover:text-violet-400 transition-colors"
                                >
                                    <DollarSign className="h-5 w-5" />
                                    Pricing
                                </Link>
                                <div className="border-t border-white/10 pt-4 mt-2">
                                    <Link href="/sign-in">
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-start text-white/80 hover:text-white hover:bg-white/10"
                                        >
                                            Sign In
                                        </Button>
                                    </Link>
                                    <Link href="/sign-up">
                                        <Button className="w-full mt-2 bg-violet-600 hover:bg-violet-700">
                                            Get Started Free
                                        </Button>
                                    </Link>
                                </div>
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-violet-500/30 transition-all group-hover:scale-110 group-hover:shadow-violet-500/40">
                            L
                        </div>
                        <span className="text-xl font-bold text-white hidden sm:inline-block">
                            Localley
                        </span>
                    </Link>
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
