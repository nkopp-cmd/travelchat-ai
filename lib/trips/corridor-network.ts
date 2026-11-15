import { directedTransportEdges } from "./transport-manifest";
import { geographySeedManifest } from "../geography/seed-manifest";
import type { CorridorNetwork } from "./corridor-select";

export { selectableSlugs, type CorridorNetwork } from "./corridor-select";

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
