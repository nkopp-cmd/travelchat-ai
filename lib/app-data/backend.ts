import "server-only";
import type { PreviewAppDataReader } from "./preview-db";

/**
 * Supabase exit switch (shared/plans/localley-supabase-exit.md step 3). One Worker variable picks
 * the serving store for every migrated repository: unset or "supabase" keeps Supabase, "d1" reads
 * the production D1 `localley-app` (binding APP_DB). Rollback = set it back or roll the version back.
 */
export type DataBackend = "supabase" | "d1";

export function dataBackend(): DataBackend {
  return process.env.DATA_BACKEND === "d1" ? "d1" : "supabase";
}

const contextSymbol = Symbol.for("__cloudflare-context__");

/** The application D1. Fails loudly instead of silently falling back to Supabase. */
export function appDataDb(): PreviewAppDataReader {
  const context = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[contextSymbol];
  const db = context?.env?.APP_DB;
  if (!db || typeof db !== "object" || !("prepare" in db) || typeof db.prepare !== "function") {
    throw new Error("APP_DB is not configured");
  }
  return db as PreviewAppDataReader;
}
