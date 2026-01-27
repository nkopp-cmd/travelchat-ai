"use client";

import { cn } from "@/lib/utils";

interface ItinerarySkeletonProps {
  count?: number;
  variant?: "card" | "list";
  className?: string;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-card/50 border border-white/5">
      {/* Image skeleton */}
      <div className="aspect-[16/9] bg-white/5 animate-pulse" />

      {/* Content skeleton */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <div className="h-5 bg-white/10 rounded-lg animate-pulse w-3/4" />

        {/* Meta info */}
        <div className="flex items-center gap-4">
          <div className="h-4 bg-white/5 rounded animate-pulse w-20" />
          <div className="h-4 bg-white/5 rounded animate-pulse w-16" />
        </div>

        {/* Tags */}
        <div className="flex gap-2">
          <div className="h-6 bg-white/5 rounded-full animate-pulse w-16" />
          <div className="h-6 bg-white/5 rounded-full animate-pulse w-20" />
        </div>
      </div>
    </div>
  );
}

function SkeletonListItem() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-white/5">
      {/* Image thumbnail */}
      <div className="w-16 h-16 rounded-xl bg-white/5 animate-pulse shrink-0" />

      {/* Content */}
      <div className="flex-1 space-y-2">
        <div className="h-5 bg-white/10 rounded animate-pulse w-3/4" />
        <div className="flex items-center gap-3">
          <div className="h-4 bg-white/5 rounded animate-pulse w-20" />
          <div className="h-4 bg-white/5 rounded animate-pulse w-12" />
        </div>
      </div>

      {/* Arrow */}
      <div className="w-5 h-5 bg-white/5 rounded animate-pulse shrink-0" />
    </div>
  );
}

export function ItinerarySkeleton({
  count = 3,
  variant = "card",
  className,
}: ItinerarySkeletonProps) {
  return (
    <div
      className={cn(
        variant === "card"
          ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          : "space-y-3",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {variant === "card" ? <SkeletonCard /> : <SkeletonListItem />}
        </div>
      ))}
    </div>
  );
}

export function ItineraryGridSkeleton({ count = 6 }: { count?: number }) {
  return <ItinerarySkeleton count={count} variant="card" />;
}

export function ItineraryListSkeleton({ count = 5 }: { count?: number }) {
  return <ItinerarySkeleton count={count} variant="list" />;
}
