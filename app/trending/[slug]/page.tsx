import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { SpotCard } from "@/components/spots/spot-card";
import { Flame, Newspaper } from "@/components/ui/icons";
import { fetchViralEvent } from "@/lib/viral/events";

// Live public data, edge-cached for 5 minutes (cloudflare/opennext/edge-html-cache.ts).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(date: string | null) {
  const parsed = date ? new Date(`${date}T00:00:00Z`) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? dateFormat.format(parsed) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await fetchViralEvent((await params).slug);
  if (!data) return { title: "Viral spots", robots: { index: false } };
  const { event, spots } = data;
  const title = `${event.label}: every spot`;
  const description = `${spots.length} ${spots.length === 1 ? "place" : "places"} from ${event.articleCount} news ${event.articleCount === 1 ? "report" : "reports"}, on a map you can add to your trip.`;
  return { title, description, alternates: { canonical: `/trending/${event.slug}` }, openGraph: { title, description } };
}

export default async function ViralEventPage({ params }: Props) {
  const data = await fetchViralEvent((await params).slug);
  if (!data || !data.spots.length) notFound();
  const { event, spots } = data;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "ItemList", name: event.label,
    itemListElement: spots.map(({ spot }, index) => ({ "@type": "ListItem", position: index + 1, url: `https://localley.io/spots/${spot.id}`, name: spot.name })),
  };

  return (
    <main className="container mx-auto px-4 pb-24 pt-6 md:pb-10 md:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader eyebrow="Viral spots" eyebrowIcon={Flame} title={event.label}
        lede={event.summary || `The places named in the news about ${event.person} in ${event.city}.`} />
      <section aria-labelledby="viral-spots-heading" className="mt-8">
        <h2 id="viral-spots-heading" className="mb-4 text-[22px] font-semibold tracking-tight">
          {spots.length} {spots.length === 1 ? "spot" : "spots"} in {event.city}
        </h2>
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {spots.map(({ spot, note }, index) => (
            <li key={spot.id} className="flex min-w-0 flex-col gap-2">
              {note && <p className="text-sm text-muted-foreground">{note}</p>}
              <SpotCard spot={spot} priority={index === 0} />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="viral-sources-heading" className="mt-10 max-w-3xl">
        <h2 id="viral-sources-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Newspaper className="h-5 w-5" aria-hidden="true" /> Sources
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          We found these places in {event.articleCount} news {event.articleCount === 1 ? "report" : "reports"}. Read the originals:
        </p>
        <ul className="space-y-2">
          {event.sources.map((source) => (
            <li key={source.url} className="text-sm">
              <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline-offset-2 hover:underline">
                {source.title}
              </a>
              <span className="text-muted-foreground"> · {source.publisher}{formatDate(source.date) ? ` · ${formatDate(source.date)}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
