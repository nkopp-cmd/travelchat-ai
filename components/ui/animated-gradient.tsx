"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AnimatedGradientProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "mesh" | "orbs" | "wave";
  colors?: string[];
}

const AnimatedGradient = React.forwardRef<HTMLDivElement, AnimatedGradientProps>(
  ({ className, variant = "mesh", colors, children, ...props }, ref) => {
    if (variant === "orbs") {
      return (
        <div ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
          {/* Animated orbs */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-violet-500/30 to-transparent rounded-full blur-3xl animate-blob" />
            <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/30 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000" />
            <div className="absolute -bottom-1/2 left-1/4 w-full h-full bg-gradient-radial from-purple-500/30 to-transparent rounded-full blur-3xl animate-blob animation-delay-4000" />
          </div>
          <div className="relative z-10">{children}</div>
        </div>
      );
    }

    if (variant === "wave") {
      return (
        <div ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-indigo-600/20 to-purple-600/20 animate-gradient-xy" />
          <div className="relative z-10">{children}</div>
        </div>
      );
    }

    // Default: mesh gradient
    return (
      <div ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-indigo-600/10" />
          <div className="absolute inset-0 bg-gradient-to-tl from-purple-600/10 via-transparent to-pink-600/10" />
          <div className="absolute inset-0 backdrop-blur-[100px]" />
        </div>
        <div className="relative z-10">{children}</div>
      </div>
    );
  }
);
AnimatedGradient.displayName = "AnimatedGradient";

export { AnimatedGradient };
