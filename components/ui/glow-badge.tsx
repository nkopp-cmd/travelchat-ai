"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const glowBadgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all duration-300",
  {
    variants: {
      variant: {
        default:
          "bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)]",
        success:
          "bg-green-500/20 text-green-300 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)]",
        warning:
          "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]",
        danger:
          "bg-red-500/20 text-red-300 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)]",
        info:
          "bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)]",
        gold:
          "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:shadow-[0_0_25px_rgba(234,179,8,0.5)]",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        default: "px-3 py-1 text-xs",
        lg: "px-4 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface GlowBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof glowBadgeVariants> {
  pulse?: boolean;
}

const GlowBadge = React.forwardRef<HTMLSpanElement, GlowBadgeProps>(
  ({ className, variant, size, pulse = false, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          glowBadgeVariants({ variant, size }),
          pulse && "animate-pulse",
          className
        )}
        {...props}
      />
    );
  }
);
GlowBadge.displayName = "GlowBadge";

export { GlowBadge, glowBadgeVariants };
