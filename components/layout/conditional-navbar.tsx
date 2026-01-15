"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";

export function ConditionalNavbar() {
    const pathname = usePathname();

    // Don't show navbar on auth pages or landing page (which has its own marketing navbar)
    const hideNavbar =
        pathname === "/" ||
        pathname?.startsWith("/sign-in") ||
        pathname?.startsWith("/sign-up");

    if (hideNavbar) {
        return null;
    }

    return <Navbar />;
}
