import Link from "next/link";
import type { HomeSpotLink } from "@/lib/seo/home-links";

/** Server HTML only: plain links to guide spots and city hubs (no client JS). */
export function GuideSpotLinks({ spots, hubs }: { spots: HomeSpotLink[]; hubs: { name: string; href: string }[] }) {
  if (!spots.length && !hubs.length) return null;
  return (
    <section id="guide-spots" className="bg-surface py-14">
      <div className="container mx-auto max-w-7xl px-4 md:px-6">
        {spots.length > 0 && (
          <>
            <h2 className="text-3xl font-black leading-tight text-foreground md:text-4xl">Spots locals rate</h2>
            <p className="mt-2 text-muted-foreground">Each one has a local guide: what to order, when to go and how to get there.</p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {spots.map((spot) => (
                <li key={spot.id}>
                  <Link prefetch={false} href={`/spots/${spot.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-raised px-4 py-3 text-foreground transition hover:bg-overlay">
                    <span className="truncate font-semibold">{spot.name}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">{spot.hub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {hubs.length > 0 && (
          <nav aria-label="City guides" className="mt-8 flex flex-wrap gap-2">
            {hubs.map((hub) => (
              <Link prefetch={false} key={hub.href} href={hub.href}
                className="inline-flex min-h-11 items-center rounded-full bg-raised px-4 text-sm font-semibold text-foreground hover:bg-overlay">
                Local spots in {hub.name}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
