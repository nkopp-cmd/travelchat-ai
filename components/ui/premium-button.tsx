"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonProps = React.ComponentProps<typeof Button>;

interface PremiumButtonProps extends ButtonProps {
    /** Add glow effect */
    glow?: boolean;
    /** Use gradient background */
    gradient?: boolean;
    /** Loading state */
    loading?: boolean;
    /** Icon to show on the left */
    leftIcon?: React.ReactNode;
    /** Icon to show on the right */
    rightIcon?: React.ReactNode;
}

/**
 * Premium Button Component
 *
 * Enhanced button with glow effects and gradient styling.
 * Matches the landing page CTA button style.
 */
export function PremiumButton({
    className,
    children,
    glow = false,
    gradient = true,
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    ...props
}: PremiumButtonProps) {
    const isDisabled = disabled || loading;

    return (
        <Button
            className={cn(
                // Base styling
                "relative overflow-hidden font-semibold",
                // Gradient background
                gradient && [
                    "bg-gradient-to-r from-violet-600 to-indigo-600",
                    "hover:from-violet-500 hover:to-indigo-500",
                    "text-white border-0",
                ],
                // Glow effect
                glow && [
                    "shadow-[0_0_25px_rgba(139,92,246,0.35)]",
                    "hover:shadow-[0_0_35px_rgba(139,92,246,0.5)]",
                ],
                // Hover animation
                "transition-all duration-300",
                "hover:scale-[1.02]",
                // Disabled state
                isDisabled && "opacity-70 cursor-not-allowed hover:scale-100",
                className
            )}
            disabled={isDisabled}
            {...props}
        >
            {/* Shimmer overlay on hover */}
            <span className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Content */}
            <span className="relative flex items-center gap-2">
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    leftIcon
                )}
                {children}
                {!loading && rightIcon}
            </span>
        </Button>
    );
}

/**
 * Glass Button Component
 *
 * Glassmorphism-styled button for secondary actions.
 */
export function GlassButton({
    className,
    children,
    ...props
}: ButtonProps) {
    return (
        <Button
            variant="outline"
            className={cn(
                "bg-white/10 dark:bg-white/5",
                "backdrop-blur-md",
                "border-white/20 dark:border-white/10",
                "hover:bg-white/20 dark:hover:bg-white/10",
                "hover:border-white/30 dark:hover:border-white/20",
                "text-foreground",
                "transition-all duration-300",
                className
            )}
            {...props}
        >
            {children}
        </Button>
    );
}
