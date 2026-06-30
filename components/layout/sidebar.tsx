"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Map, Award, Settings, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/hooks/use-queries";
import type { Conversation } from "@/lib/api-client";
import { useSubscriptionContext } from "@/providers/subscription-provider";

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
    const { data: conversations } = useConversations();
    const { tier, subscription, openBillingPortal } = useSubscriptionContext();
    const recentChats = ((conversations as Conversation[] | undefined) || []).slice(0, 5);
    const isPaid = tier !== "free";
    const planLabel = tier === "premium" ? "Premium" : tier === "pro" ? "Pro" : "Choose your plan";

    return (
        <div className="hidden w-[240px] shrink-0 border-r border-white/10 bg-[#0b0714]/72 text-white shadow-2xl shadow-violet-950/10 backdrop-blur-xl md:block lg:w-[280px]">
            <div className="flex h-full flex-col justify-between overflow-y-auto">
                <div className="overflow-auto py-4">
                    <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-1">
                        {routes.map((route) => (
                            <Link
                                key={route.href}
                                href={route.href}
                                className={cn(
                                    "group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all",
                                    pathname === route.href
                                        ? "border-violet-300/35 bg-violet-500/15 text-white"
                                        : "border-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.055] hover:text-white"
                                )}
                            >
                                <route.icon className={cn(
                                    "h-4 w-4 transition-colors",
                                    pathname === route.href
                                        ? "text-violet-200"
                                        : "text-white/40 group-hover:text-violet-200"
                                )} />
                                <div className="flex flex-col">
                                    <span>{route.label}</span>
                                    {pathname === route.href && (
                                        <span className="text-xs text-white/45">
                                            {route.description}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </nav>

                    {/* Recent Chats Section */}
                    {recentChats.length > 0 && (
                        <div className="mt-6 px-2 lg:px-4">
                            <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Recent chats
                            </h3>
                            <div className="space-y-0.5">
                                {recentChats.map((chat) => (
                                    <Link
                                        key={chat.id}
                                        href={`/chat?conversation=${chat.id}`}
                                        className={cn(
                                            "group flex items-start gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm transition-all hover:border-white/10 hover:bg-white/[0.055]",
                                            pathname === `/chat` && new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("conversation") === chat.id
                                                ? "bg-violet-500/10 text-violet-200"
                                                : "text-white/55 hover:text-white"
                                        )}
                                    >
                                        <MessageCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-white/35 group-hover:text-violet-200" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="truncate text-sm">{chat.title || "New Chat"}</p>
                                                {chat.linked_itinerary_id && (
                                                    <Map className="h-3 w-3 text-violet-500 flex-shrink-0" />
                                                )}
                                            </div>
                                            <p className="text-[10px] text-white/35 mt-0.5">
                                                {formatRelativeTime(chat.updated_at)}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-auto p-4">
                    <div className="rounded-xl border border-violet-300/20 bg-gradient-to-br from-violet-500/18 to-indigo-500/10 p-4 shadow-xl shadow-violet-950/20">
                        <h3 className="bg-gradient-to-r from-violet-100 to-indigo-100 bg-clip-text font-semibold text-transparent">
                            {isPaid ? `${planLabel} plan` : "Choose your plan"}
                        </h3>
                        <p className="mt-1 mb-3 text-xs leading-5 text-white/55">
                            {isPaid
                                ? "Manage billing or compare what Premium adds for richer trips."
                                : "Pro keeps trip planning fast. Premium adds deeper exports and richer media."}
                        </p>
                        {isPaid && subscription?.hasBillingPortal ? (
                            <Button
                                size="sm"
                                onClick={() => openBillingPortal()}
                                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700"
                            >
                                Manage plan
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                asChild
                                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700"
                            >
                                <Link href="/pricing">{isPaid ? "Compare plans" : "View plans"}</Link>
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
