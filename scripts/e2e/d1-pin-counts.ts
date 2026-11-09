/**
 * Independent pin count from production D1 (read-only), for e2e/spots-full-map.spec.ts:
 *   npx tsx scripts/e2e/d1-pin-counts.ts            -> {"all":N,"tokyo":M}
 *   PLAYWRIGHT_D1_PIN_COUNTS="$(npx tsx scripts/e2e/d1-pin-counts.ts)" npm run test:e2e:live -- spots-full-map
 *
 * It reads raw rows with one SELECT and applies the public rules here (visible, name exclusions, the
 * name+address dedupe in list order, usable coordinates), so it does not reuse the code under test.
 * Needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in the environment.
 */
import { execFileSync } from "node:child_process";
import { PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS } from "../../lib/spots/public-quality";
import { getCityBySlug } from "../../lib/cities";

interface Row { id: string; name: string | null; address: string | null; latitude: number | null; longitude: number | null }

const sql = "SELECT id, name, address, latitude, longitude FROM spots WHERE visible = 1 ORDER BY localley_score DESC NULLS FIRST, id ASC";
const output = execFileSync("npx", ["wrangler", "d1", "execute", "localley-app", "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
const rows = (JSON.parse(output) as Array<{ results: Row[] }>)[0].results;

const text = (raw: string | null) => {
    if (!raw) return "";
    try {
        const value = JSON.parse(raw);
        if (value && typeof value === "object") return String(value.en || Object.values(value)[0] || "");
        return String(value);
    } catch {
        return raw;
    }
};
/** json_extract(name, '$.en'); null when absent, and SQL `NOT (NULL LIKE ?)` then drops the row. */
const nameEn = (raw: string | null): string | null => {
    try {
        const value = raw ? JSON.parse(raw) : null;
        return value && typeof value === "object" && value.en != null ? String(value.en) : null;
    } catch {
        return null;
    }
};
/** SQLite LIKE: % wildcard, ASCII case-insensitive. */
const like = (value: string, pattern: string) => new RegExp(`^${pattern.split("%").map((part) =>
    part.replace(/[.*+?^${}()|[\]\\_]/g, (c) => (c === "_" ? "." : `\\${c}`))).join(".*")}$`, "is").test(value);
const usable = (lat: number | null, lng: number | null) => typeof lat === "number" && typeof lng === "number"
    && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function count(citySlug?: string): number {
    const city = citySlug ? getCityBySlug(citySlug) : undefined;
    if (citySlug && !city) throw new Error(`unknown city ${citySlug}`);
    const seen = new Set<string>();
    let pins = 0;
    for (const row of rows) {
        const name = nameEn(row.name);
        if (name === null || PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS.some((pattern) => like(name, pattern))) continue;
        if (city && !like(row.address ?? "", `%${city.name}%`)) continue;
        const key = `${text(row.name).toLowerCase().trim()}|${text(row.address).toLowerCase().trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (usable(row.latitude, row.longitude)) pins += 1;
    }
    return pins;
}

process.stdout.write(`${JSON.stringify({ all: count(), tokyo: count("tokyo") })}\n`);
