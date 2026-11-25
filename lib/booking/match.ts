import type { ViatorActivity } from "@/types/viator";

/**
 * Booking plan B4: pick at most one partner product per itinerary stop.
 * A stop gets a product only when it costs money and the product fits it (same named
 * place, or a tour type that fits the stop category), inside the trip's budget band.
 * Free stops (parks, streets, free markets) never get a card: a "Book" button on a
 * free place costs trust.
 */

export type TripBudget = "budget" | "cheap" | "moderate" | "luxury" | "splurge";

export interface MatchableStop {
    name?: string;
    category?: string;
    type?: string;
    cost?: string;
}

export type MatchableProduct = Pick<ViatorActivity, "productCode" | "title" | "priceFrom" | "currency" | "rating" | "reviewCount">;

/** Highest "from" price per person (USD) that fits the band; null means no cap. */
export const BUDGET_PRICE_CAP_USD: Record<TripBudget, number | null> = {
    budget: 40,
    cheap: 40,
    moderate: 120,
    luxury: null,
    splurge: null,
};

/** Categories that need no booking unless the stop names a paid entry. */
const FREE_CATEGORIES = new Set(["park", "neighborhood", "street", "viewpoint", "beach", "walk", "shopping"]);

/** Tour words that fit a stop category (a product title must contain one). */
const CATEGORY_TOUR_WORDS: Record<string, string[]> = {
    restaurant: ["food tour", "cooking class", "food"],
    food: ["food tour", "cooking class", "food", "street food"],
    cafe: ["cafe", "coffee"],
    bar: ["bar", "pub crawl", "nightlife"],
    nightlife: ["bar", "pub crawl", "nightlife"],
    market: ["market", "food tour"],
    temple: ["temple", "palace", "heritage"],
    palace: ["palace", "heritage", "hanbok"],
    museum: ["museum", "ticket", "admission"],
    attraction: ["ticket", "admission", "entry"],
    class: ["class", "workshop"],
    activity: ["class", "workshop", "experience"],
};

const STOP_WORDS = new Set([
    "the", "and", "for", "with", "tour", "tours", "ticket", "tickets", "entry", "admission", "night", "day",
    "seoul", "tokyo", "bangkok", "singapore", "market", "street", "food", "private", "guided", "experience",
    "station", "district", "area", "local", "city", "half", "full", "skip", "line",
    "palace", "temple", "shrine", "museum", "park", "tower", "garden", "gate", "village", "hall",
]);

const FREE_COST = /^\s*(free|no charge|none|₩\s*0|\$\s*0|0)\b/i;

/** Parse the first number of a cost string ("$8-15" -> 8). Null when the string has no number. */
export function parseCostAmount(cost?: string): number | null {
    if (!cost) return null;
    const m = cost.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
}

export function isFreeStop(stop: MatchableStop): boolean {
    const cost = stop.cost?.trim() ?? "";
    if (FREE_COST.test(cost)) return true;
    const amount = parseCostAmount(cost);
    if (amount === 0) return true;
    const category = (stop.category || stop.type || "").toLowerCase();
    // A free-type place without a stated paid cost needs no booking.
    return FREE_CATEGORIES.has(category) && (amount === null);
}

function nameTokens(text: string): string[] {
    return text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
}

function withinBudget(product: MatchableProduct, budget: TripBudget): boolean {
    const cap = BUDGET_PRICE_CAP_USD[budget];
    if (cap === null) return true;
    if (product.currency && product.currency !== "USD") return true; // no FX table; do not drop on a guess
    return typeof product.priceFrom === "number" && product.priceFrom > 0 && product.priceFrom <= cap;
}

function proof(product: MatchableProduct): number {
    const reviews = product.reviewCount ?? 0;
    const rating = reviews > 0 ? product.rating ?? 0 : 0;
    return rating * Math.log10(1 + reviews);
}

/** Best product for one stop, or null. `used` holds product codes already shown that day. */
export function matchStop(
    stop: MatchableStop,
    products: MatchableProduct[],
    budget: TripBudget = "moderate",
    used: ReadonlySet<string> = new Set(),
): MatchableProduct | null {
    if (isFreeStop(stop)) return null;
    const stopTokens = new Set(nameTokens(stop.name ?? ""));
    const category = (stop.category || stop.type || "").toLowerCase();
    const tourWords = CATEGORY_TOUR_WORDS[category] ?? [];

    let best: { product: MatchableProduct; score: number } | null = null;
    for (const product of products) {
        if (!product.productCode || used.has(product.productCode) || !withinBudget(product, budget)) continue;
        const title = product.title.toLowerCase();
        const nameHit = nameTokens(product.title).some((t) => stopTokens.has(t));
        const categoryHit = tourWords.some((w) => title.includes(w));
        if (!nameHit && !categoryHit) continue;
        const score = (nameHit ? 100 : 0) + proof(product);
        if (!best || score > best.score) best = { product, score };
    }
    return best?.product ?? null;
}

/** One product per stop for a whole day; the same product never shows twice in a day. */
export function matchDay(
    stops: MatchableStop[],
    products: MatchableProduct[],
    budget: TripBudget = "moderate",
): (MatchableProduct | null)[] {
    const used = new Set<string>();
    return stops.map((stop) => {
        const match = matchStop(stop, products, budget, used);
        if (match) used.add(match.productCode);
        return match;
    });
}
