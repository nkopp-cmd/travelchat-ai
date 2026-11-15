// Client-safe corridor helpers. Keep this module free of imports: the planner step imports it, and
// lib/trips/corridor-network.ts pulls both manifests (and zod) into any bundle that imports it.
export type CorridorNetwork = {
  slugs: string[];
  adjacency: Record<string, string[]>;
  countryBySlug: Record<string, string>;
};

export function selectableSlugs(
  network: CorridorNetwork,
  selected: readonly string[],
): Set<string> {
  if (selected.length === 0) {
    return new Set(network.slugs);
  }
  const anchorCountry = network.countryBySlug[selected[0]];
  const selectable = new Set<string>();
  for (const slug of network.slugs) {
    if (selected.includes(slug)) continue;
    if (network.countryBySlug[slug] !== anchorCountry) continue;
    const connected = selected.some((picked) => network.adjacency[picked]?.includes(slug));
    if (connected) selectable.add(slug);
  }
  return selectable;
}
