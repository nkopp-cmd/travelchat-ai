import "server-only";

/** D1's bounded statement interface for isolated preview probes. */
export interface PreviewAppDataStatement {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  bind(...values: (string | number | null)[]): PreviewAppDataStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface PreviewAppDataReader {
  prepare(query: string): PreviewAppDataStatement;
}

const contextSymbol = Symbol.for("__cloudflare-context__");

/** Preview-only binding; production keeps Supabase until the approved canary and cutover. */
export function previewAppDataReader(): PreviewAppDataReader {
  if (process.env.SUPABASE_READ_ONLY !== "true" || process.env.AUTH_MAIL_MODE !== "outbox") {
    throw new Error("Preview D1 reads require the isolated read-only preview");
  }
  const context = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[contextSymbol];
  const db = context?.env?.APP_DATA_PREVIEW_DB;
  if (!db || typeof db !== "object" || !("prepare" in db) || typeof db.prepare !== "function") {
    throw new Error("APP_DATA_PREVIEW_DB is not configured");
  }
  return db as PreviewAppDataReader;
}

/** Bounded parity counters. Never exposes owner data or changes the serving backend. */
export async function previewAppDataCounts(): Promise<{ publishedSpots: number; importedBatches: number }> {
  const db = previewAppDataReader();
  const spots = await db.prepare("SELECT count(*) AS n FROM spots WHERE visible = 1").first<{ n: number }>();
  const batches = await db.prepare("SELECT count(*) AS n FROM legacy_import_batches").first<{ n: number }>();
  if (!spots || !batches || !Number.isSafeInteger(spots.n) || !Number.isSafeInteger(batches.n)) {
    throw new Error("Preview D1 counters unavailable");
  }
  return { publishedSpots: spots.n, importedBatches: batches.n };
}

/** Small, ordered candidate catalog read. This never substitutes for a live spots query. */
export async function previewSpotPage(limit: number, offset: number): Promise<{
  spots: { id: string; name: string; category: string; city: string | null; score: number | null }[];
  nextOffset: number | null;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 24 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000) {
    throw new Error("Invalid preview spot pagination");
  }
  const db = previewAppDataReader();
  const { results } = await db.prepare(
    "SELECT id, name, category, city, localley_score AS score FROM spots WHERE visible = 1 ORDER BY id LIMIT ? OFFSET ?",
  ).bind(limit + 1, offset).all<{ id: string; name: string; category: string; city: string | null; score: number | null }>();
  if (!Array.isArray(results) || results.length > limit + 1 || results.some(row =>
    typeof row.id !== "string" || typeof row.name !== "string" || typeof row.category !== "string" ||
    (row.city !== null && typeof row.city !== "string") ||
    (row.score !== null && (!Number.isSafeInteger(row.score) || row.score < 1 || row.score > 6))
  )) throw new Error("Preview spot data unavailable");
  const spots = results.slice(0, limit).map(row => {
    const names = JSON.parse(row.name) as Record<string, unknown>;
    const name = names.en ?? Object.values(names)[0];
    if (typeof name !== "string" || !name) throw new Error("Preview spot name unavailable");
    return { id: row.id, name, category: row.category, city: row.city, score: row.score };
  });
  return { spots, nextOffset: results.length > limit ? offset + limit : null };
}
