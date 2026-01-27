"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Enable hover glow effect */
    glow?: boolean;
    /** Enable hover lift animation */
    hover?: boolean;
    /** Add gradient border accent */
    gradientBorder?: boolean;
    /** Card padding size */
    padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
    none: "",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
};

/**
 * Premium Card Component
 *
 * A glassmorphism-styled card that matches the landing page design language.
 * Use this for app interior pages to maintain visual consistency.
 */
export function PremiumCard({
    className,
    children,
    glow = false,
    hover = true,
    gradientBorder = false,
    padding = "md",
    ...props
}: PremiumCardProps) {
    return (
        <div
            className={cn(
                // Base glassmorphism styling
                "rounded-2xl",
                "bg-white/70 dark:bg-white/5",
                "backdrop-blur-md",
                "border border-black/5 dark:border-white/10",
                // Transitions
                "transition-all duration-300 ease-out",
                // Hover effects
                hover && [
                    "hover:-translate-y-1",
                    "hover:border-violet-500/30 dark:hover:border-violet-500/40",
                    "hover:shadow-xl hover:shadow-violet-500/10 dark:hover:shadow-violet-500/20",
                ],
                // Glow effect
                glow && "shadow-[0_0_20px_rgba(139,92,246,0.15)] dark:shadow-[0_0_25px_rgba(139,92,246,0.2)]",
                // Gradient border
                gradientBorder && "gradient-border",
                // Padding
                paddingClasses[padding],
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

interface PremiumCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Use gradient background */
    gradient?: boolean;
}

export function PremiumCardHeader({
    className,
    children,
    gradient = false,
    ...props
}: PremiumCardHeaderProps) {
    return (
        <div
            className={cn(
                "px-6 py-4",
                gradient && [
                    "bg-gradient-to-r from-violet-600 to-indigo-600",
                    "text-white",
                    "rounded-t-2xl -m-px mb-0",
                ],
                !gradient && "border-b border-black/5 dark:border-white/10",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

export function PremiumCardContent({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("p-6", className)} {...props}>
            {children}
        </div>
    );
}

export function PremiumCardFooter({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "px-6 py-4 border-t border-black/5 dark:border-white/10",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
