"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";

export function ConditionalNavbar() {
    const pathname = usePathname();

    // Don't show navbar on auth pages
    const hideNavbar = pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up");

    if (hideNavbar) {
        return null;
    }

    return <Navbar />;
}
