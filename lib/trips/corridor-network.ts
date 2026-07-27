import { directedTransportEdges } from "./transport-manifest";
import { geographySeedManifest } from "../geography/seed-manifest";

export type CorridorNetwork = {
  slugs: string[];
  adjacency: Record<string, string[]>;
  countryBySlug: Record<string, string>;
};

let cached: CorridorNetwork | null = null;

export function supportedCorridorNetwork(): CorridorNetwork {
  if (cached) return cached;

  const adjacency = new Map<string, Set<string>>();
  for (const edge of directedTransportEdges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }

  const countryBySlug = Object.fromEntries(
    geographySeedManifest.destinations.map((destination) => [
      destination.slug,
      destination.countryCode,
    ]),
  );

  cached = {
    slugs: [...adjacency.keys()].sort(),
    adjacency: Object.fromEntries(
      [...adjacency.entries()].map(([slug, targets]) => [slug, [...targets].sort()]),
    ),
    countryBySlug,
  };
  return cached;
}

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
