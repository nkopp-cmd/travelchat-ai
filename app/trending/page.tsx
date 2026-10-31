import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Flame } from "@/components/ui/icons";
import { fetchViralEvents } from "@/lib/viral/events";

export const metadata: Metadata = {
  title: "Viral spots",
  description: "Places in the news this month: where celebrities ate, shopped and stayed, with the sources.",
  alternates: { canonical: "/trending" },
};

// Live public data, edge-cached for 5 minutes (cloudflare/opennext/edge-html-cache.ts).
export const dynamic = "force-dynamic";

export default async function TrendingPage() {
  const events = await fetchViralEvents();
  return (
    <main className="container mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-10 md:pt-8">
      <PageHeader eyebrow="Viral spots" eyebrowIcon={Flame} title="In the news"
        lede="When a visit goes viral, we find the places and put them on the map. Each event links to its news sources." />
      {events.length ? (
        <ul className="mt-8 divide-y divide-border rounded-2xl bg-surface shadow-surface">
          {events.map((event) => (
            <li key={event.slug}>
              <Link prefetch={false} href={`/trending/${event.slug}`} className="block min-h-11 px-5 py-4">
                <span className="block font-semibold">{event.label}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {event.spots.length} {event.spots.length === 1 ? "spot" : "spots"} · {event.articleCount} news {event.articleCount === 1 ? "report" : "reports"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-muted-foreground">No viral events right now. Check back soon.</p>
      )}
    </main>
  );
}
