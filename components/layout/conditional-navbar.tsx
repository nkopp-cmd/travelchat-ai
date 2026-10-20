"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

// Use one navigation across public and app pages. Auth forms keep their focused shell.
const Navbar = dynamic(() => import("@/components/layout/navbar").then((module) => module.Navbar));

export function ConditionalNavbar() {
    const pathname = usePathname();

    // Auth forms keep their focused shell.
    const hideNavbar =
        pathname?.startsWith("/sign-in") ||
        pathname?.startsWith("/sign-up");

    if (hideNavbar) {
        return null;
    }

    return <Navbar />;
}
