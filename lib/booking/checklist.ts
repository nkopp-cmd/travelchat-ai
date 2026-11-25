/**
 * Booking plan B6: the trip checklist. Pure functions over the per-stop matches from B5, so the
 * panel and the inline cards always show the same products.
 */
import type { BookableItem } from "@/components/booking/bookable-card";

export type ChecklistGroup = "early" | "anytime";

export interface ChecklistEntry {
    item: BookableItem;
    /** 1-based day number of the first stop that matched this product. */
    day: number;
    stopName: string;
    group: ChecklistGroup;
}

// Timed entry, quota and show products sell out first; open tours and classes can wait.
const EARLY = /\b(ticket|tickets|admission|entry|timed|skip[- ]the[- ]line|observatory|observation deck|teamlab|sky|show|cruise|palace|museum|tower)\b/i;

export function checklistGroup(title: string, stopName = ""): ChecklistGroup {
    return EARLY.test(title) || EARLY.test(stopName) ? "early" : "anytime";
}

/** One entry per product, in trip order (day, then stop). Free stops and unmatched stops have no entry. */
export function buildChecklist(matches: (BookableItem | null)[][], stopNames: string[][]): ChecklistEntry[] {
    const seen = new Set<string>();
    const entries: ChecklistEntry[] = [];
    matches.forEach((day, dayIndex) => {
        day.forEach((item, stopIndex) => {
            if (!item || seen.has(item.productCode)) return;
            seen.add(item.productCode);
            const stopName = stopNames[dayIndex]?.[stopIndex] ?? "";
            entries.push({ item, day: dayIndex + 1, stopName, group: checklistGroup(item.title, stopName) });
        });
    });
    return entries;
}

export interface ChecklistTotals {
    currency: string;
    /** Sum of "from" prices per person of all priced entries in `currency`. */
    total: number;
    /** Part of `total` not yet marked booked. */
    toBook: number;
    booked: number;
    count: number;
}

/**
 * Per-person running total. Only entries in the main currency count (mixing currencies would give a
 * wrong number); entries without a price count as items but add nothing.
 */
export function checklistTotals(entries: ChecklistEntry[], bookedCodes: ReadonlySet<string>): ChecklistTotals {
    const currency = entries.find((e) => (e.item.priceFrom ?? 0) > 0)?.item.currency ?? "USD";
    let total = 0;
    let toBook = 0;
    let booked = 0;
    for (const { item } of entries) {
        const isBooked = bookedCodes.has(item.productCode);
        if (isBooked) booked += 1;
        const price = item.priceFrom;
        if (!price || !Number.isFinite(price) || price <= 0 || (item.currency ?? "USD") !== currency) continue;
        total += price;
        if (!isBooked) toBook += price;
    }
    return { currency, total, toBook, booked, count: entries.length };
}

/** localStorage key for the "booked" marks of one itinerary (device-local, no account data). */
export const bookedStorageKey = (itineraryId: string) => `localley:booked:${itineraryId}`;

export function parseBookedCodes(raw: string | null): Set<string> {
    if (!raw) return new Set();
    try {
        const value: unknown = JSON.parse(raw);
        return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 200) : []);
    } catch {
        return new Set();
    }
}
