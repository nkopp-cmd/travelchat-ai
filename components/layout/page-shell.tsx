import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page width and spacing for every page (shared/plans/localley-design-consistency.md).
 * wide: catalogs and grids (the /spots width). narrow: reading and conversation pages.
 */
export function PageShell({ width = "wide", className, children }: {
    width?: "wide" | "narrow";
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn(
            "mx-auto w-full space-y-6 px-4 pb-24 pt-6 md:pb-10 md:pt-8",
            width === "wide" ? "container" : "max-w-3xl",
            className,
        )}>
            {children}
        </div>
    );
}
