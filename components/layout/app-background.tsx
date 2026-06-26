"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AppBackgroundProps {
    children: React.ReactNode;
    /** Ambient glow blobs in background */
    ambient?: boolean;
    /** Subtle grid pattern overlay */
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
    grid = false,
    gradient = true,
    fitParent = false,
    className,
    contentClassName,
    style,
}: AppBackgroundProps) {
    return (
        <div
            className={cn(
                "relative overflow-hidden",
                !fitParent && "min-h-screen",
                gradient && "page-premium bg-[#0b0714]",
                className
            )}
            style={style}
        >
            {ambient && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,58,237,0.18),rgba(15,23,42,0.04)_38%,rgba(79,70,229,0.14)_100%)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0)_22%,rgba(255,255,255,0.025)_100%)]" />
                    <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
                </div>
            )}

            {/* Optional grid pattern overlay */}
            {grid && (
                <div
                    className="absolute inset-0 pointer-events-none grid-pattern opacity-50"
                    aria-hidden="true"
                />
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
        default: "bg-white/50 dark:bg-white/[0.04]",
        subtle: "bg-muted/30 dark:bg-white/[0.025]",
        prominent: "bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-950/30 dark:to-indigo-950/25",
    };

    return (
        <div
            className={cn(
                "relative rounded-2xl border border-black/5 dark:border-white/5",
                "backdrop-blur-sm",
                variantClasses[variant],
                className
            )}
        >
            {children}
        </div>
    );
}
