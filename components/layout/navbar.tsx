"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { Map, Menu, Compass, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SubscriptionBadge } from "@/components/subscription";
import { NotificationCenter } from "@/components/notifications/notification-center";

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

export function Navbar() {
    const pathname = usePathname();
    const { isSignedIn } = useUser();
    const isLanding = pathname === "/";

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
                    ]
            )}
        >
            <div className="container flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="md:hidden text-foreground/80 hover:text-foreground">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[240px] sm:w-[300px] border-r-white/10 bg-black/90 backdrop-blur-xl text-white">
                            <nav className="flex flex-col gap-4 mt-8">
                                {routes.map((route) => (
                                    <Link
                                        key={route.href}
                                        href={route.href}
                                        className={cn(
                                            "flex items-center gap-2 px-2 py-1 text-lg font-medium transition-colors hover:text-violet-400",
                                            pathname === route.href
                                                ? "text-violet-400"
                                                : "text-gray-400"
                                        )}
                                    >
                                        <route.icon className="h-5 w-5" />
                                        {route.label}
                                    </Link>
                                ))}
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-violet-500/30 transition-all group-hover:scale-110 group-hover:shadow-violet-500/40">
                            L
                        </div>
                        <span className={cn(
                            "text-xl font-bold transition-colors",
                            isLanding
                                ? "text-white"
                                : "bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600",
                            "hidden sm:inline-block"
                        )}>
                            Localley
                        </span>
                    </Link>
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
                            <UserButton afterSignOutUrl="/" />
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
                            <Link href="/sign-up">
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
