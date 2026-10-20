"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AppBackgroundProps {
    children: React.ReactNode;
    /** Ambient glow blobs in background */
    ambient?: boolean;
    /** @deprecated Decorative grids are omitted by the borderless design. */
    grid?: boolean;
    /** Use premium gradient background */
    gradient?: boolean;
    /** Fill parent height instead of using min-h-screen (for sidebar layouts) */
    fitParent?: boolean;
    /** Additional className for the container */
    className?: string;
    /** Additional className for the content wrapper */
    contentClassName?: string;
    /** Optional inline styles for viewport-calculated shells */
    style?: React.CSSProperties;
}

/**
 * App Background Component
 *
 * Provides the premium background treatment matching the landing page.
 * Wraps page content with ambient glows, gradients, and optional grid patterns.
 */
export function AppBackground({
    children,
    ambient = true,
    gradient = true,
    fitParent = false,
    className,
    contentClassName,
    style,
}: AppBackgroundProps) {
    return (
        <div
            className={cn(
                "relative",
                fitParent ? "min-h-0 overflow-hidden" : "min-h-dvh",
                gradient && "page-premium bg-background",
                className
            )}
            style={style}
        >
            {ambient && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(124_58_237/0.06),transparent_65%)]" />
                </div>
            )}

            {/* Content wrapper */}
            <div className={cn("relative z-10", contentClassName)}>
                {children}
            </div>
        </div>
    );
}

/**
 * Section Background Component
 *
 * For sections within a page that need their own ambient treatment.
 */
export function SectionBackground({
    children,
    className,
    variant = "default",
}: {
    children: React.ReactNode;
    className?: string;
    variant?: "default" | "subtle" | "prominent";
}) {
    const variantClasses = {
        default: "bg-surface",
        subtle: "bg-surface/60",
        prominent: "bg-raised",
    };

    return (
        <div
            className={cn(
                "relative rounded-2xl",
                variantClasses[variant],
                className
            )}
        >
            {children}
        </div>
    );
}
