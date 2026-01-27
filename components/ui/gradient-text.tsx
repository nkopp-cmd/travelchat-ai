"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type GradientVariant = "violet" | "indigo" | "purple" | "rose" | "emerald" | "amber";

interface GradientTextProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Gradient color variant */
    variant?: GradientVariant;
    /** Render as a different element */
    as?: "span" | "h1" | "h2" | "h3" | "h4" | "p";
    /** Animate the gradient on hover */
    animate?: boolean;
}

const gradientVariants: Record<GradientVariant, string> = {
    violet: "from-violet-600 via-violet-500 to-indigo-600 dark:from-violet-400 dark:via-violet-300 dark:to-indigo-400",
    indigo: "from-indigo-600 via-indigo-500 to-blue-600 dark:from-indigo-400 dark:via-indigo-300 dark:to-blue-400",
    purple: "from-purple-600 via-violet-500 to-pink-600 dark:from-purple-400 dark:via-violet-300 dark:to-pink-400",
    rose: "from-rose-600 via-pink-500 to-orange-500 dark:from-rose-400 dark:via-pink-300 dark:to-orange-400",
    emerald: "from-emerald-600 via-teal-500 to-cyan-600 dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-400",
    amber: "from-amber-600 via-orange-500 to-yellow-500 dark:from-amber-400 dark:via-orange-300 dark:to-yellow-400",
};

/**
 * Gradient Text Component
 *
 * Renders text with a premium gradient effect matching the landing page style.
 */
export function GradientText({
    className,
    children,
    variant = "violet",
    as: Component = "span",
    animate = false,
    ...props
}: GradientTextProps) {
    return (
        <Component
            className={cn(
                "bg-clip-text text-transparent bg-gradient-to-r",
                gradientVariants[variant],
                animate && "bg-[length:200%_auto] hover:animate-gradient",
                className
            )}
            {...props}
        >
            {children}
        </Component>
    );
}

/**
 * Page Title Component
 *
 * Premium page title with gradient text, matching landing page headlines.
 */
export function PageTitle({
    children,
    className,
    subtitle,
    badge,
}: {
    children: React.ReactNode;
    className?: string;
    subtitle?: string;
    badge?: React.ReactNode;
}) {
    return (
        <div className={cn("space-y-2", className)}>
            {badge && <div className="mb-3">{badge}</div>}
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                <GradientText as="span" variant="violet">
                    {children}
                </GradientText>
            </h1>
            {subtitle && (
                <p className="text-muted-foreground text-lg">{subtitle}</p>
            )}
        </div>
    );
}

/**
 * Section Title Component
 *
 * For section headings within pages.
 */
export function SectionTitle({
    children,
    className,
    subtitle,
}: {
    children: React.ReactNode;
    className?: string;
    subtitle?: string;
}) {
    return (
        <div className={cn("space-y-1", className)}>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
                {children}
            </h2>
            {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
        </div>
    );
}
