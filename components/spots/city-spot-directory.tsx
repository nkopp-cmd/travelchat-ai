import Link from "next/link";
import { cityDirectory } from "@/lib/spots/city-directory-store";
import { groupByInitial } from "@/lib/spots/city-directory";

/**
 * Every spot of a city hub as an A-Z link list (server HTML, collapsed by default). The paged card grid links only
 * page 1, so without this list most spot pages had no internal link (weekend sprint L3).
 */
export async function CitySpotDirectory({ citySlug, cityName }: { citySlug: string; cityName: string }) {
  const entries = await cityDirectory(citySlug);
  if (entries.length === 0) return null;
  const groups = groupByInitial(entries);
  return (
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
  );
}
