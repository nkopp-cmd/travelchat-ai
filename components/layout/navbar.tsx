"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { ArrowRight, Map, Menu, Compass, Award, Settings, CreditCard, Sparkles, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SubscriptionBadge } from "@/components/subscription";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { Logo } from "@/components/brand/logo";
import { useScrollDirection } from "@/hooks/use-scroll-direction";

const routes = [
    {
        href: "/dashboard",
        label: "Explore",
        icon: Compass,
    },
    {
        href: "/itineraries",
        label: "My Itineraries",
        icon: Map,
    },
    {
        href: "/profile",
        label: "Profile",
        icon: Award,
    },
];

const mobileRoutes = [
    {
        href: "/spots",
        label: "Spots",
        icon: Search,
    },
    {
        href: "/templates",
        label: "Templates",
        icon: Sparkles,
    },
    {
        href: "/pricing",
        label: "Plan",
        icon: CreditCard,
    },
    {
        href: "/settings",
        label: "Settings",
        icon: Settings,
    },
];

export function Navbar() {
    const pathname = usePathname();
    const { isSignedIn } = useUser();
    const isLanding = pathname === "/";
    const scrollDirection = useScrollDirection({ threshold: 20 });

    // Hide header on scroll down on mobile (not on landing page)
    const isHidden = !isLanding && scrollDirection === "down";

    return (
        <header
            className={cn(
                "sticky top-0 z-50 w-full transition-all duration-300",
                isLanding
                    ? "border-b border-white/10 bg-gradient-to-b from-black/70 via-black/50 to-black/30 backdrop-blur-md"
                    : [
                        // Premium glassmorphism for app pages
                        "border-b border-black/5 dark:border-white/10",
                        "bg-white/70 dark:bg-black/50",
                        "backdrop-blur-xl",
                        "shadow-sm shadow-violet-500/5",
                    ],
                // Hide on scroll down on mobile
                isHidden && "md:translate-y-0 -translate-y-full"
            )}
        >
            <div className="container flex h-14 md:h-16 items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "md:hidden",
                                    isLanding
                                        ? "text-white/80 hover:bg-white/10 hover:text-white"
                                        : "text-foreground/80 hover:bg-violet-500/10 hover:text-foreground"
                                )}
                            >
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[86vw] max-w-[340px] border-r border-violet-200/15 bg-[#0b0714]/96 p-0 text-white shadow-2xl shadow-violet-950/40 backdrop-blur-xl">
                            <nav className="flex h-full min-h-dvh flex-col gap-4 px-4 pb-5 pt-5">
                                <div className="space-y-3">
                                    <Logo size="md" isLanding={isLanding} />
                                    <div className="overflow-hidden rounded-xl border border-violet-200/15 bg-white/[0.055] shadow-xl shadow-violet-950/20">
                                        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-3 py-3">
                                            <p className="text-sm font-bold text-white">Localley cockpit</p>
                                            <p className="mt-0.5 text-xs leading-5 text-violet-100/75">
                                                Account tools, real spots, templates, and plan controls.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 p-2">
                                            <SheetClose asChild>
                                                <Link
                                                    href="/itineraries/new"
                                                    className="flex min-h-10 items-center justify-center rounded-lg bg-white text-sm font-bold text-violet-700 transition hover:bg-violet-50"
                                                >
                                                    New trip
                                                </Link>
                                            </SheetClose>
                                            <SheetClose asChild>
                                                <Link
                                                    href="/spots"
                                                    className="flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-sm font-bold text-white transition hover:bg-white/[0.1]"
                                                >
                                                    Find spots
                                                </Link>
                                            </SheetClose>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-1.5">
                                    {mobileRoutes.map((route) => (
                                        <SheetClose asChild key={route.href}>
                                            <Link
                                                href={route.href}
                                                className={cn(
                                                    "group flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2.5 transition",
                                                    pathname === route.href
                                                        ? "border-violet-300/40 bg-violet-500/15 text-white"
                                                        : "border-white/10 bg-white/[0.04] text-white/70 hover:border-violet-300/35 hover:bg-violet-400/10 hover:text-white"
                                                )}
                                            >
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200 transition group-hover:bg-violet-500/25">
                                                    <route.icon className="h-[18px] w-[18px]" />
                                                </span>
                                                <span className="flex-1 text-sm font-semibold">{route.label}</span>
                                                <ArrowRight className="h-4 w-4 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-violet-200" />
                                            </Link>
                                        </SheetClose>
                                    ))}
                                </div>
                                <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-white/55">
                                    Use the bottom bar for Explore, Chat, and My Trips. This drawer keeps the extra tools close.
                                </div>
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <Logo size="md" isLanding={isLanding} />
                </div>

                <nav className="hidden md:flex items-center gap-1">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                                pathname === route.href
                                    ? isLanding ? "text-white bg-white/20" : "text-foreground bg-foreground/5"
                                    : isLanding ? "text-white/90 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            <route.icon className="h-4 w-4" />
                            {route.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-2 sm:gap-4">
                    {isSignedIn ? (
                        <>
                            <SubscriptionBadge className="hidden sm:flex" />
                            <NotificationCenter />
                            <UserButton
                                afterSignOutUrl="/"
                                appearance={{
                                    elements: {
                                        avatarBox: "ring-1 ring-white/10 shadow-lg shadow-violet-500/10",
                                        userButtonTrigger:
                                            "rounded-full transition-all hover:ring-2 hover:ring-violet-400/40 focus:ring-2 focus:ring-violet-400/50",
                                        userButtonPopoverCard:
                                            "rounded-2xl border border-white/12 bg-[#0f1020]/96 text-white shadow-2xl shadow-black/50 backdrop-blur-xl",
                                        userButtonPopoverMain:
                                            "bg-transparent px-2 pb-2 pt-2 text-white",
                                        userButtonPopoverActions:
                                            "gap-1 px-1 pb-1",
                                        userPreview:
                                            "rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3",
                                        userPreviewTextContainer:
                                            "gap-0.5",
                                        userPreviewMainIdentifier:
                                            "text-sm font-semibold text-white",
                                        userPreviewSecondaryIdentifier:
                                            "text-xs text-white/60",
                                        userButtonPopoverActionButton:
                                            "min-h-11 rounded-xl px-3 py-2 text-white/90 hover:bg-violet-500/12 hover:text-white focus:bg-violet-500/14 focus:text-white transition-colors",
                                        userButtonPopoverActionButtonText:
                                            "text-sm font-medium text-white/90",
                                        userButtonPopoverActionButtonIcon:
                                            "text-violet-300",
                                        userButtonPopoverFooter:
                                            "mt-2 border-t border-white/10 px-3 py-3 text-white/45",
                                        userButtonPopoverFooterPages:
                                            "text-xs text-white/45 hover:text-white/70",
                                    },
                                }}
                            />
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Link href="/sign-in">
                                <Button variant="ghost" size="sm" className={cn(
                                    "hover:bg-white/10",
                                    isLanding ? "text-white hover:text-white" : ""
                                )}>
                                    Sign In
                                </Button>
                            </Link>
                            {/* Hide Get Started on mobile - use bottom nav instead */}
                            <Link href="/sign-up" className="hidden sm:block">
                                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 rounded-full px-6 shadow-lg shadow-violet-500/20">
                                    Get Started
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
