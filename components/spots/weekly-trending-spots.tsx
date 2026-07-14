import { Flame, MapPin, Sparkles, TrendingUp } from "lucide-react";
import { SpotCard } from "@/components/spots/spot-card";
import type { WeeklyTrendingSpot } from "@/lib/spots/weekly-trending";
import { getCityBySlug } from "@/lib/cities";
import { cn } from "@/lib/utils";

export function WeeklyTrendingSpots({
  items,
}: {
  items: WeeklyTrendingSpot[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="relative mb-6 overflow-hidden rounded-xl border border-amber-300/25 bg-gradient-to-br from-amber-400/14 via-fuchsia-500/9 to-violet-500/14 p-4 shadow-2xl shadow-violet-950/30 backdrop-blur-xl md:mb-8 md:p-5">
      <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-fuchsia-400/10 blur-3xl" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="relative">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-amber-100">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            This week
          </div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white md:text-2xl">
            Localley&apos;s Top Social Finds
            <Sparkles className="h-5 w-5 text-fuchsia-300" aria-hidden="true" />
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-violet-50/65">
            A fresh weekly pulse from public social activity, grounded in Localley&apos;s verified hidden-gem details.
          </p>
        </div>
      </div>

      <div className="relative grid auto-cols-[minmax(255px,82vw)] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[300px] lg:grid-flow-row lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] lg:overflow-visible">
        {items.map((item, index) => (
          <article
            key={`${item.citySlug}-${item.spot.id}`}
            className={cn(
              "relative min-w-0 rounded-xl p-1 transition-transform duration-200 hover:-translate-y-1",
              index === 0 && "bg-gradient-to-b from-amber-200/30 to-fuchsia-300/10 shadow-xl shadow-amber-950/20",
            )}
          >
            <div className="absolute -left-1 -top-1 z-20 flex h-8 min-w-8 items-center justify-center rounded-lg border border-amber-100/35 bg-amber-300 px-2 text-sm font-black text-amber-950 shadow-lg shadow-black/30">
              #{index + 1}
            </div>
            <SpotCard spot={item.spot} priority={index < 2} />
            <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11px] font-semibold text-violet-50/70">
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0 text-fuchsia-300" aria-hidden="true" />
                {getCityBySlug(item.citySlug)?.name || item.citySlug}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200/20 bg-amber-300/10 px-2 py-1 text-amber-100">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                Momentum {Math.round(item.score)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
