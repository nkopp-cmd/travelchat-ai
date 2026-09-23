"use client";

import Link from "next/link";
import { LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useUser } from "@/lib/auth/client";

/** Replaces Clerk's <UserButton />: avatar with profile, settings and sign-out. */
export function UserMenu() {
    const { user } = useUser();
    if (!user) return null;
    const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
        || user.primaryEmailAddress?.emailAddress[0]?.toUpperCase() || "?";
    const itemClass = "min-h-11 rounded-xl px-3 py-2 text-white/90 focus:bg-violet-500/14 focus:text-white";
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Account menu"
                className="rounded-full ring-1 ring-white/10 shadow-lg shadow-violet-500/10 transition-all hover:ring-2 hover:ring-violet-400/40 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
            >
                <Avatar className="h-8 w-8">
                    {user.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
                    <AvatarFallback className="bg-violet-600 text-xs text-white">{initials}</AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl border border-white/12 bg-[#0f1020]/96 p-2 text-white shadow-2xl shadow-black/50 backdrop-blur-xl">
                <DropdownMenuLabel className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
                    <div className="text-sm font-semibold text-white">{user.fullName || "Localley traveler"}</div>
                    <div className="truncate text-xs font-normal text-white/60">{user.primaryEmailAddress?.emailAddress}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem asChild className={itemClass}>
                    <Link href="/profile"><User className="mr-2 h-4 w-4 text-violet-300" />Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={itemClass}>
                    <Link href="/settings"><Settings className="mr-2 h-4 w-4 text-violet-300" />Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem className={itemClass} onSelect={() => { void signOut("/"); }}>
                    <LogOut className="mr-2 h-4 w-4 text-violet-300" />Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
