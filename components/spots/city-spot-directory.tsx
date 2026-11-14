import Link from "next/link";
import { cityDirectory } from "@/lib/spots/city-directory-store";
import { groupByInitial, topPicks, type CityDirectoryEntry } from "@/lib/spots/city-directory";

/**
 * Every spot of a city hub as an A-Z link list (server HTML, collapsed by default). The paged card grid links only
 * page 1, so without this list most spot pages had no internal link (weekend sprint L3).
 */
// Money queries 6-8 of docs/reach.md ("hidden gem <city> cafe", "local cafes <city>", "hidden gems <city> food").
const PICK_BLOCKS = [
  { category: "Cafe", title: (city: string) => `Hidden-gem cafes in ${city}`, more: "All cafes",
    intro: "Small neighbourhood cafes with the highest Localley Score: quiet seats, good coffee, few tour groups. Go mid-morning on a weekday for a free table." },
  { category: "Food", title: (city: string) => `Local food in ${city}`, more: "All food spots",
    intro: "Where locals eat: the best-scored restaurants and food stalls. Arrive just before the lunch or dinner rush, and carry some cash for the smaller places." },
] as const;

const MIN_PICKS = 3;

function PickList({ id, title, intro, more, href, picks, cityName }: { id: string; title: string; intro: string; more: string; href: string; picks: CityDirectoryEntry[]; cityName: string }) {
  return (
    <div>
      <h2 id={id} className="text-xl font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{intro}</p>
      <ol className="mt-3 space-y-1 text-sm">
        {picks.map((entry, index) => (
          <li key={entry.id} className="truncate">
            <span className="mr-2 tabular-nums text-muted-foreground">{index + 1}.</span>
            <Link href={`/spots/${entry.id}`} prefetch={false} className="font-medium text-foreground underline-offset-2 hover:underline">{entry.name}</Link>
          </li>
        ))}
      </ol>
      <Link href={href} prefetch={false} className="mt-3 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
        {more} in {cityName} →
      </Link>
    </div>
  );
}

export async function CitySpotDirectory({ citySlug, cityName }: { citySlug: string; cityName: string }) {
  const entries = await cityDirectory(citySlug);
  if (entries.length === 0) return null;
  const groups = groupByInitial(entries);
  const blocks = PICK_BLOCKS.map((block) => ({ ...block, picks: topPicks(entries, block.category, 6) })).filter((block) => block.picks.length >= MIN_PICKS);
  return (
    <>
    {blocks.length > 0 ? (
      <section aria-label={`Top picks in ${cityName}`} className="mt-10 grid gap-8 rounded-2xl bg-surface p-5 shadow-surface md:grid-cols-2 md:p-7">
        {blocks.map((block) => (
          <PickList
            key={block.category}
            id={`city-picks-${block.category.toLowerCase()}`}
            title={block.title(cityName)}
            intro={block.intro}
            more={block.more}
            href={`/spots?city=${encodeURIComponent(citySlug)}&category=${block.category}`}
            picks={block.picks}
            cityName={cityName}
          />
        ))}
      </section>
    ) : null}
    <section aria-labelledby="city-spot-directory" className="mt-10 rounded-2xl bg-surface p-5 shadow-surface md:p-7">
      <details>
        <summary className="cursor-pointer list-none">
          <h2 id="city-spot-directory" className="inline text-xl font-bold text-foreground">All {entries.length} spots in {cityName}, A–Z</h2>
          <span className="ml-2 text-sm text-muted-foreground">Show list</span>
        </summary>
        <nav aria-label={`Every spot in ${cityName}`} className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.letter}>
              <h3 className="text-sm font-semibold text-muted-foreground">{group.letter}</h3>
              <ul className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {group.entries.map((entry) => (
                  <li key={entry.id} className="truncate">
                    <Link href={`/spots/${entry.id}`} prefetch={false} className="text-foreground underline-offset-2 hover:underline">{entry.name}</Link>
                    {entry.category ? <span className="text-muted-foreground"> · {entry.category}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </details>
    </section>
    </>
  );
}
