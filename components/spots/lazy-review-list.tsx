"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

type ReviewListComponent = ComponentType<{ spotId: string }>;

/**
 * The reviews sit at the bottom of the spot page. Their code (Radix Select,
 * AlertDialog, Avatar, Progress, the review form) and their fetch load only when
 * the section comes near the viewport, not with the page.
 */
export function LazyReviewList({ spotId }: { spotId: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [List, setList] = useState<ReviewListComponent | null>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node || List) return;
    let cancelled = false;
    const load = () => {
      import("./review-list").then((mod) => {
        if (!cancelled) setList(() => mod.ReviewList);
      });
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [List]);

  if (List) return <List spotId={spotId} />;
  return <div ref={holder} data-testid="reviews-placeholder" aria-busy="true" className="min-h-40 rounded-xl bg-surface" />;
}
