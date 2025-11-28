"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
  strokeWidth?: number;
  showValue?: boolean;
  gradientId?: string;
  children?: React.ReactNode;
}

const ProgressRing = React.forwardRef<HTMLDivElement, ProgressRingProps>(
  (
    {
      className,
      value,
      size = "md",
      strokeWidth,
      showValue = true,
      gradientId = "progress-gradient",
      children,
      ...props
    },
    ref
  ) => {
    const sizeConfig = {
      sm: { dimension: 48, defaultStroke: 4, fontSize: "text-xs" },
      md: { dimension: 80, defaultStroke: 6, fontSize: "text-sm" },
      lg: { dimension: 120, defaultStroke: 8, fontSize: "text-xl" },
      xl: { dimension: 160, defaultStroke: 10, fontSize: "text-2xl" },
    };

    const config = sizeConfig[size];
    const actualStrokeWidth = strokeWidth ?? config.defaultStroke;
    const radius = (config.dimension - actualStrokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value / 100) * circumference;

    return (
      <div
        ref={ref}
        className={cn("relative inline-flex items-center justify-center", className)}
        {...props}
      >
        <svg
          width={config.dimension}
          height={config.dimension}
          className="transform -rotate-90"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={actualStrokeWidth}
            fill="none"
            className="text-muted/20"
          />
          {/* Progress circle */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={actualStrokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children ? (
            children
          ) : showValue ? (
            <span className={cn("font-bold", config.fontSize)}>{Math.round(value)}%</span>
          ) : null}
        </div>
      </div>
    );
  }
);
ProgressRing.displayName = "ProgressRing";

export { ProgressRing };
