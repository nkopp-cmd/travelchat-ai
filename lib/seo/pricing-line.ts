// Push BF1: one in-context body link to /pricing on every spot page and city hub (graph: /pricing had 2 body links).
// Copy stays true to lib/subscription.ts: the numbers come from TIER_CONFIGS (Push BG3), never literals.
import { TIER_CONFIGS } from "@/lib/subscription";

export type PricingLine = { before: string; anchor: string; after: string };

const VARIANTS: readonly PricingLine[] = [
  { before: "Save these spots and ", anchor: "plan the whole day with Localley Pro", after: "." },
  { before: "Planning more than one day? ", anchor: "Unlimited trip plans come with Pro", after: "." },
  { before: `Free keeps ${TIER_CONFIGS.free.limits.savedSpotsLimit} saved spots. `, anchor: `Pro keeps ${TIER_CONFIGS.pro.limits.savedSpotsLimit} and plans unlimited trips`, after: "." },
  { before: "Turn this list into a full route: ", anchor: "see what Localley Pro adds", after: "." },
  { before: "Going for a week? ", anchor: "Compare the Free and Pro plans", after: " first." },
];

/** Stable variant per page key (spot id or city slug), so a page always shows the same line (cache-safe). */
export function pricingLine(key: string): PricingLine {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return VARIANTS[hash % VARIANTS.length];
}

export const PRICING_LINE_VARIANTS = VARIANTS;
