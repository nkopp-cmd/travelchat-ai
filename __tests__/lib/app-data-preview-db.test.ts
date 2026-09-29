import { afterEach, describe, expect, it } from "vitest";
import { previewAppDataCounts, previewSpotPage } from "@/lib/app-data/preview-db";

const contextSymbol = Symbol.for("__cloudflare-context__");
const env = process.env;

afterEach(() => {
  process.env = env;
  delete (globalThis as Record<symbol, unknown>)[contextSymbol];
});

describe("isolated application D1 preview", () => {
  it("fails closed outside the read-only preview even when a binding exists", async () => {
    (globalThis as Record<symbol, unknown>)[contextSymbol] = { env: {
      APP_DATA_PREVIEW_DB: { prepare: () => { throw new Error("must not touch DB"); } },
    } };
    process.env = { ...env, SUPABASE_READ_ONLY: "false", AUTH_MAIL_MODE: "outbox" };
    await expect(previewAppDataCounts()).rejects.toThrow("isolated read-only preview");
    process.env.SUPABASE_READ_ONLY = "true";
    process.env.AUTH_MAIL_MODE = "";
    await expect(previewAppDataCounts()).rejects.toThrow("isolated read-only preview");
  });

  it("uses APP_DATA_PREVIEW_DB, never AUTH_DB or Supabase, for count-only reads", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    const queries: string[] = [];
    (globalThis as Record<symbol, unknown>)[contextSymbol] = { env: {
      AUTH_DB: { prepare: () => { throw new Error("auth DB is separate"); } },
      APP_DATA_PREVIEW_DB: { prepare: (sql: string) => {
        queries.push(sql);
        return { first: async () => ({ n: sql.includes("legacy_import_batches") ? 0 : 8 }) };
      } },
    } };
    await expect(previewAppDataCounts()).resolves.toEqual({ publishedSpots: 8, importedBatches: 0 });
    expect(queries).toEqual([
      "SELECT count(*) AS n FROM spots WHERE visible = 1",
      "SELECT count(*) AS n FROM legacy_import_batches",
    ]);
  });

  it("does not fake success when the binding or imported schema is absent", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    await expect(previewAppDataCounts()).rejects.toThrow("not configured");
    (globalThis as Record<symbol, unknown>)[contextSymbol] = { env: {
      APP_DATA_PREVIEW_DB: { prepare: () => ({ first: async () => ({ n: NaN }) }) },
    } };
    await expect(previewAppDataCounts()).rejects.toThrow("counters unavailable");
  });

  it("pages only public D1 spots with bound parameters and no owner fields", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    const queries: string[] = [], params: unknown[][] = [];
    (globalThis as Record<symbol, unknown>)[contextSymbol] = { env: {
      AUTH_DB: { prepare: () => { throw new Error("never read auth DB"); } },
      APP_DATA_PREVIEW_DB: { prepare: (sql: string) => {
        queries.push(sql);
        return { bind: (...values: unknown[]) => {
          params.push(values);
          return { all: async () => ({ results: [
            { id: "pilot-1", name: '{"en":"Pilot Cafe"}', category: "Cafe", city: "Seoul", score: 5 },
            { id: "pilot-2", name: '{"en":"Second"}', category: "Food", city: null, score: null },
          ] }) };
        } };
      } },
    } };
    await expect(previewSpotPage(1, 0)).resolves.toEqual({
      spots: [{ id: "pilot-1", name: "Pilot Cafe", category: "Cafe", city: "Seoul", score: 5 }], nextOffset: 1,
    });
    expect(queries[0]).toContain("WHERE visible = 1 ORDER BY id LIMIT ? OFFSET ?");
    expect(params).toEqual([[2, 0]]);
    await expect(previewSpotPage(25, 0)).rejects.toThrow("pagination");
    expect(queries).toHaveLength(1);
  });
});
