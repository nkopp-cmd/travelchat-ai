"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

// The landing and auth routes do not render this navigation. Keep its user menu,
// notifications and billing controls out of their initial client bundle.
const Navbar = dynamic(() => import("@/components/layout/navbar").then((module) => module.Navbar));

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
