import "server-only";

/** D1's small read interface. This cannot perform application writes. */
export interface PreviewAppDataStatement {
  first<T = Record<string, unknown>>(): Promise<T | null>;
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
