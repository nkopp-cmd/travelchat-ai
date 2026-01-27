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
    /** Additional className for the container */
    className?: string;
    /** Additional className for the content wrapper */
    contentClassName?: string;
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
    className,
    contentClassName,
}: AppBackgroundProps) {
    return (
        <div
            className={cn(
                "min-h-screen relative overflow-hidden",
                gradient && "page-premium",
                className
            )}
        >
            {/* Ambient glow blobs */}
            {ambient && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                    {/* Primary violet glow - top left */}
                    <div
                        className={cn(
                            "absolute -top-[20%] -left-[10%]",
                            "w-[600px] h-[600px]",
                            "rounded-full",
                            "bg-violet-500/[0.07] dark:bg-violet-500/[0.12]",
                            "blur-[120px]"
                        )}
                    />
                    {/* Secondary indigo glow - bottom right */}
                    <div
                        className={cn(
                            "absolute -bottom-[10%] -right-[5%]",
                            "w-[500px] h-[500px]",
                            "rounded-full",
                            "bg-indigo-500/[0.05] dark:bg-indigo-500/[0.10]",
                            "blur-[100px]"
                        )}
                    />
                    {/* Accent glow - center */}
                    <div
                        className={cn(
                            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                            "w-[800px] h-[400px]",
                            "rounded-full",
                            "bg-purple-500/[0.03] dark:bg-purple-500/[0.06]",
                            "blur-[150px]"
                        )}
                    />
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
        default: "bg-white/50 dark:bg-white/[0.02]",
        subtle: "bg-muted/30 dark:bg-white/[0.01]",
        prominent: "bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20",
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
