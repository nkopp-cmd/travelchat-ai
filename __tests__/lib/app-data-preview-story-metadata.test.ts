import { afterEach, describe, expect, it } from "vitest";
import { previewStoryBackgrounds, updatePreviewStoryBackgrounds } from "@/lib/app-data/preview-story-metadata";

const contextSymbol = Symbol.for("__cloudflare-context__");
const env = process.env;
afterEach(() => { process.env = env; delete (globalThis as Record<symbol, unknown>)[contextSymbol]; });

describe("preview story metadata D1 adapter", () => {
  it("binds exact itinerary and owner IDs to both reads and writes", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    const queries: string[] = [];
    const values: unknown[][] = [];
    (globalThis as Record<symbol, unknown>)[contextSymbol] = { env: {
      AUTH_DB: { prepare: () => { throw new Error("wrong DB"); } },
      APP_DATA_PREVIEW_DB: { prepare: (query: string) => {
        queries.push(query);
        return { bind: (...args: unknown[]) => {
          values.push(args);
          return { first: async () => ({ backgrounds: '{"cover":"/images/a.png"}' }), run: async () => ({ meta: { changes: 1 } }) };
        } };
      } },
    } };
    expect(await updatePreviewStoryBackgrounds("trip-id", "owner-id", { cover: "/images/a.png" }))
      .toEqual({ cover: "/images/a.png" });
    expect(queries[0]).toContain("o.clerkUserId = ?");
    expect(queries[1]).toContain("o.clerkUserId = ?");
    expect(values).toEqual([[JSON.stringify({ cover: "/images/a.png" }), "trip-id", "owner-id"], ["trip-id", "owner-id"]]);
  });

  it("does not claim a missing or differently owned itinerary", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    (globalThis as Record<symbol, unknown>)[contextSymbol] = { env: {
      APP_DATA_PREVIEW_DB: { prepare: () => ({ bind: () => ({
        first: async () => null, run: async () => ({ meta: { changes: 0 } }),
      }) }) },
    } };
    expect(await previewStoryBackgrounds("trip-id", "other-owner")).toBeNull();
    expect(await updatePreviewStoryBackgrounds("trip-id", "other-owner", { cover: "/images/a.png" })).toBeNull();
  });
});
