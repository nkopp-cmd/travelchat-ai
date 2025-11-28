"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  label: string;
  value: string | number;
  iconColor?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  size?: "sm" | "md" | "lg";
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      className,
      icon: Icon,
      label,
      value,
      iconColor = "text-violet-500",
      trend,
      size = "md",
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "p-3",
      md: "p-4",
      lg: "p-6",
    };

    const iconSizes = {
      sm: "h-4 w-4",
      md: "h-5 w-5",
      lg: "h-6 w-6",
    };

    const valueSizes = {
      sm: "text-lg",
      md: "text-2xl",
      lg: "text-3xl",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-xl",
          "bg-white/10 dark:bg-white/5 backdrop-blur-xl",
          "border border-white/20 dark:border-white/10",
          "transition-all duration-300",
          "hover:bg-white/15 dark:hover:bg-white/10",
          "hover:shadow-lg hover:scale-[1.02]",
          "group",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="relative flex flex-col items-center text-center gap-2">
          <div
            className={cn(
              "rounded-full p-2 transition-transform group-hover:scale-110",
              "bg-gradient-to-br from-white/10 to-white/5"
            )}
          >
            <Icon className={cn(iconSizes[size], iconColor)} />
          </div>
          <div className={cn("font-bold", valueSizes[size])}>{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {trend && (
            <div
              className={cn(
                "text-xs font-medium",
                trend.isPositive ? "text-green-500" : "text-red-500"
              )}
            >
              {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}%
            </div>
          )}
        </div>
      </div>
    );
  }
);
StatCard.displayName = "StatCard";

export { StatCard };
