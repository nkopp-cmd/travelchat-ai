import Link from "next/link";
import { cityDirectory } from "@/lib/spots/city-directory-store";
import { groupByInitial, scoreCounts, topPicks, type CityDirectoryEntry } from "@/lib/spots/city-directory";
import { SCORE_LABELS } from "@/lib/spots/types";

/**
 * Every spot of a city hub as an A-Z link list. The paged card grid links only page 1, so without this list most spot
 * pages had no internal link (weekend sprint L3). The list lives on its own page (/spots/a-z/<city>, Push CB2): on the
 * hub it was 1 of every 3 compressed HTML bytes (each spot UUID twice, HTML + RSC payload) inside a closed <details>,
 * and the hub's mobile first paint waits for the whole HTML. The hub links the list page.
 */
export const cityAzPath = (citySlug: string) => `/spots/a-z/${encodeURIComponent(citySlug)}`;
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
      <Link href={href} prefetch={false} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline">
        {more} in {cityName} →
      </Link>
    </div>
  );
}

// Link-earning asset (reach-engine R3, docs/reach.md): the hub explains its own ranking method, with counts and a date.
function ScoreMethod({ entries, cityName }: { entries: CityDirectoryEntry[]; cityName: string }) {
  const levels = scoreCounts(entries).filter((level) => level.count > 0);
  const rated = levels.reduce((sum, level) => sum + level.count, 0);
  if (rated === 0) return null;
  const updated = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date());
  return (
    <section aria-labelledby="city-score-method" className="mt-10 rounded-2xl bg-surface p-5 shadow-surface md:p-7">
      <h2 id="city-score-method" className="text-xl font-bold text-foreground">How we rate places in {cityName}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Every place gets a Localley Score from 1 to 6. A place with a very high rating from a few hundred reviews scores
        higher than a famous place with thousands: the people who find it love it, and it has no tour-bus queue.
        Places that locals keep posting about score higher too. Start with Hidden Gem and Legendary Alley places, then
        use the score filter above to widen the list.
      </p>
      <ul className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level) => (
          <li key={level.score} className="flex justify-between gap-3 rounded-lg bg-muted/40 px-2 py-1">
            <span className="text-foreground">{level.score} · {SCORE_LABELS[level.score]}</span>
            <span className="tabular-nums text-muted-foreground">{level.count} {level.count === 1 ? "place" : "places"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{rated} places rated in {cityName}. Last updated {updated}.</p>
    </section>
  );
}

export async function CitySpotDirectory({ citySlug, cityName }: { citySlug: string; cityName: string }) {
  const entries = await cityDirectory(citySlug);
  if (entries.length === 0) return null;
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
    <ScoreMethod entries={entries} cityName={cityName} />
    <section aria-labelledby="city-spot-directory" className="mt-10 rounded-2xl bg-surface p-5 shadow-surface md:p-7">
      <h2 id="city-spot-directory" className="text-xl font-bold text-foreground">All {entries.length} spots in {cityName}, A–Z</h2>
      <Link href={cityAzPath(citySlug)} prefetch={false} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline">
        Open the full list →
      </Link>
    </section>
    </>
  );
}

/** The A-Z list of /spots/a-z/<city>: one short class on the wrapper styles every row (no per-row class strings). */
export function CitySpotAzList({ entries }: { entries: CityDirectoryEntry[] }) {
  return (
    <div className="spot-az mt-6 space-y-6">
      {groupByInitial(entries).map((group) => (
        <section key={group.letter} aria-label={group.letter}>
          <h2 className="text-sm font-semibold text-muted-foreground">{group.letter}</h2>
          <ul className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {group.entries.map((entry, index) => (
              // Index keys: the list is static server HTML, and a UUID key added one more UUID per row to the payload.
              <li key={index}>
                <a href={`/spots/${entry.id}`}>{entry.name}</a>
                {entry.category ? <span> · {entry.category}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
