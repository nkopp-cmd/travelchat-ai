"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { SpotCard } from "@/components/spots/spot-card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import type { Spot } from "@/types";

export type SpotRailItem = { key: string; spot: Spot; caption?: ReactNode };

/** Horizontal carousel of shared spot cards (weekly trending, viral events). */
export function SpotRail({ items, eyebrow, title, lede, trackLabel, seeAll, priority = false }: {
  items: SpotRailItem[]; eyebrow: string; title: string; lede: ReactNode; trackLabel: string;
  seeAll?: { href: string; label: string }; priority?: boolean;
}) {
  const id = useId();
  const headingId = `${id}-heading`, trackId = `${id}-track`;
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(0);
  const updatePosition = useCallback(() => {
    const list = track.current;
    if (!list) return;
    const frame = list.getBoundingClientRect();
    let nearest = 0, distance = Infinity, last = 0;
    Array.from(list.children).forEach((card, index) => {
      const rect = card.getBoundingClientRect(), delta = Math.abs(rect.left - frame.left);
      if (delta < distance) { nearest = index; distance = delta; }
      if (rect.left >= frame.left - 1 && rect.right <= frame.right + 1) last = index;
    });
    setPosition(nearest); setVisibleEnd(Math.max(nearest, last));
  }, []);
  useEffect(() => {
    const list = track.current;
    if (!list) return;
    const observer = new ResizeObserver(updatePosition);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items.length, updatePosition]);
  if (!items.length) return null;

  function go(index: number) {
    const list = track.current;
    const card = list?.children.item(Math.max(0, Math.min(index, items.length - 1))) as HTMLElement | null;
    if (!list || !card) return;
    const left = list.scrollLeft + card.getBoundingClientRect().left - list.getBoundingClientRect().left;
    list.scrollTo({ left, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const index = { ArrowRight: position + 1, ArrowLeft: position - 1, Home: 0, End: items.length - 1 }[event.key];
    if (index === undefined) return;
    event.preventDefault(); go(index);
  }

  return <section aria-labelledby={headingId} aria-roledescription="carousel" className="mb-8 min-w-0">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-1 text-[13px] font-medium text-primary">{eyebrow}</p>
        <h2 id={headingId} className="text-[22px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{lede}</p></div>
      {seeAll && <Link prefetch={false} href={seeAll.href} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary">{seeAll.label}</Link>}
    </div>
    <div ref={track} id={trackId} role="group" tabIndex={0} aria-label={`${trackLabel}. Use left and right arrows to browse.`}
      onScroll={updatePosition} onKeyDown={onKeyDown}
      className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain rounded-2xl pb-4 [scrollbar-width:thin] after:w-[15%] after:shrink-0 after:content-[''] sm:after:w-0">
      {items.map((item, index) => <div key={item.key}
        role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${items.length}`}
        className="flex w-[85%] min-w-0 shrink-0 snap-start flex-col gap-2 sm:w-[340px]">
        {item.caption}
        <SpotCard spot={item.spot} priority={priority && index === 0} />
      </div>)}
    </div>
    <div className="mt-1 flex items-center justify-between gap-3">
      <p role="status" aria-live="polite" aria-atomic="true" className="text-[13px] tabular-nums text-muted-foreground">
        <span aria-hidden="true">{position + 1}{visibleEnd > position ? `–${visibleEnd + 1}` : ""}/{items.length}</span>
        <span className="sr-only">{visibleEnd > position ? `Showing spots ${position + 1} through ${visibleEnd + 1} of ${items.length}` : `Showing spot ${position + 1} of ${items.length}`}</span>
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="icon" aria-label="Previous spot" aria-controls={trackId} disabled={position === 0} onClick={() => go(position - 1)}><ChevronLeft aria-hidden="true" /></Button>
        <Button type="button" variant="secondary" size="icon" aria-label="Next spot" aria-controls={trackId} disabled={visibleEnd === items.length - 1} onClick={() => go(position + 1)}><ChevronRight aria-hidden="true" /></Button>
      </div>
    </div>
  </section>;
}
