"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Map, Award, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const routes = [
    {
        href: "/dashboard",
        label: "Explore",
        icon: Compass,
        description: "Discover spots & chat with Alley",
    },
    {
        href: "/itineraries",
        label: "My Itineraries",
        icon: Map,
        description: "Your saved trips",
    },
    {
        href: "/profile",
        label: "Profile",
        icon: Award,
        description: "Progress & achievements",
    },
    {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        description: "App preferences",
    },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="hidden border-r border-border/40 bg-background/60 backdrop-blur-xl md:block w-[240px] lg:w-[280px] shrink-0">
            <div className="flex h-full flex-col justify-between overflow-y-auto">
                <div className="overflow-auto py-4">
                    <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-1">
                        {routes.map((route) => (
                            <Link
                                key={route.href}
                                href={route.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all hover:bg-accent group",
                                    pathname === route.href
                                        ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <route.icon className={cn(
                                    "h-4 w-4 transition-colors",
                                    pathname === route.href
                                        ? "text-violet-600 dark:text-violet-400"
                                        : "text-muted-foreground group-hover:text-foreground"
                                )} />
                                <div className="flex flex-col">
                                    <span>{route.label}</span>
                                    {pathname === route.href && (
                                        <span className="text-xs text-muted-foreground">
                                            {route.description}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </nav>
                </div>
                <div className="mt-auto p-4">
                    <div className="rounded-xl border border-border/50 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 p-4 shadow-sm">
                        <h3 className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600">
                            Upgrade to Pro
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 mb-3">
                            Unlock unlimited AI chats and exclusive hidden gems.
                        </p>
                        <Button size="sm" className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-md shadow-violet-500/20">
                            Upgrade
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
