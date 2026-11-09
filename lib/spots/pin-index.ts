/**
 * Compact pin index for the /spots map (shared/plans/localley-full-map.md item 1): every visible spot with
 * usable coordinates for one filter, small enough to load at once (~25 KB gzip for 3,000 spots).
 *
 * Columnar and delta encoded: pins are sorted along a Morton (Z-order) curve so neighbours are close, then
 * lat/lng are stored as integer deltas at `p` (1e5 = about 1 m). A pin is keyed by the shortest id prefix
 * (at least 8 characters) that is unique in the index; the card endpoint resolves the prefix to the spot.
 * Names stay out of the index (they would double its size); the card brings them on tap.
 */

export interface PinIndexRow {
    id: string;
    lat: number;
    lng: number;
    category: string | null;
    score: number | null;
}

export interface PinIndex {
    v: 1;
    /** Coordinate precision: lat/lng = integer / p. */
    p: number;
    /** Key length: each pin key is `k.slice(i * kl, (i + 1) * kl)`. */
    kl: number;
    /** Category names; `t` holds one base-36 index per pin ("-" = none). */
    c: string[];
    k: string;
    la: number[];
    ln: number[];
    t: string;
    /** One base-36 digit per pin: the rounded Localley score ("-" = none). */
    s: string;
}

export interface DecodedPin {
    key: string;
    lat: number;
    lng: number;
    category: string | null;
    score: number | null;
}

export const PIN_INDEX_PRECISION = 1e5;
export const PIN_KEY_MIN_LENGTH = 8;
const MAX_CATEGORIES = 36;

/** 16-bit grid cell of a coordinate, interleaved into one 32-bit Z-order value. */
function morton(lat: number, lng: number): number {
    const x = Math.min(65535, Math.max(0, Math.floor(((lng + 180) / 360) * 65536)));
    const y = Math.min(65535, Math.max(0, Math.floor(((lat + 90) / 180) * 65536)));
    let z = 0;
    for (let bit = 15; bit >= 0; bit -= 1) {
        z = z * 4 + ((y >> bit) & 1) * 2 + ((x >> bit) & 1);
    }
    return z;
}

/** Shortest prefix length (>= PIN_KEY_MIN_LENGTH) that keeps every id unique. */
export function uniqueKeyLength(ids: string[]): number {
    const longest = ids.reduce((max, id) => Math.max(max, id.length), PIN_KEY_MIN_LENGTH);
    for (let length = PIN_KEY_MIN_LENGTH; length < longest; length += 1) {
        const seen = new Set<string>();
        if (ids.every((id) => {
            const key = id.slice(0, length).padEnd(length, "~");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })) return length;
    }
    return longest;
}

export function encodePinIndex(rows: PinIndexRow[], precision = PIN_INDEX_PRECISION): PinIndex {
    const sorted = rows
        .map((row) => ({ row, z: morton(row.lat, row.lng) }))
        .sort((a, b) => a.z - b.z || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0))
        .map((entry) => entry.row);
    const kl = uniqueKeyLength(sorted.map((row) => row.id));
    const categories: string[] = [];
    const categoryIndex = new Map<string, number>();
    let k = "";
    let t = "";
    let s = "";
    const la: number[] = [];
    const ln: number[] = [];
    let lastLat = 0;
    let lastLng = 0;
    for (const row of sorted) {
        k += row.id.slice(0, kl).padEnd(kl, "~");
        const lat = Math.round(row.lat * precision);
        const lng = Math.round(row.lng * precision);
        la.push(lat - lastLat);
        ln.push(lng - lastLng);
        lastLat = lat;
        lastLng = lng;
        let index = row.category ? categoryIndex.get(row.category) : undefined;
        if (row.category && index === undefined && categories.length < MAX_CATEGORIES) {
            index = categories.push(row.category) - 1;
            categoryIndex.set(row.category, index);
        }
        t += index === undefined ? "-" : index.toString(36);
        s += typeof row.score === "number" && Number.isFinite(row.score)
            ? Math.min(35, Math.max(0, Math.round(row.score))).toString(36)
            : "-";
    }
    return { v: 1, p: precision, kl, c: categories, k, la, ln, t, s };
}

export function decodePinIndex(index: PinIndex): DecodedPin[] {
    const pins: DecodedPin[] = [];
    let lat = 0;
    let lng = 0;
    for (let i = 0; i < index.la.length; i += 1) {
        lat += index.la[i];
        lng += index.ln[i];
        const type = index.t[i];
        const score = index.s[i];
        pins.push({
            key: index.k.slice(i * index.kl, (i + 1) * index.kl).replace(/~+$/, ""),
            lat: lat / index.p,
            lng: lng / index.p,
            category: type && type !== "-" ? index.c[parseInt(type, 36)] ?? null : null,
            score: score && score !== "-" ? parseInt(score, 36) : null,
        });
    }
    return pins;
}

/** A pin key is an id prefix: hex digits and dashes only, so it is safe in a path and a range query. */
export const PIN_KEY_PATTERN = /^[0-9a-f-]{8,36}$/;

/** Query string for the pin index of a filter, in a fixed order so caches share one key per filter. */
export function pinIndexQuery(filters: { city?: string | null; category?: string | null; score?: number | null; search?: string | null }): string {
    const params = new URLSearchParams();
    if (filters.city) params.set("city", filters.city);
    if (filters.category) params.set("category", filters.category);
    if (filters.score) params.set("score", String(filters.score));
    if (filters.search) params.set("search", filters.search);
    const query = params.toString();
    return query ? `?${query}` : "";
}
