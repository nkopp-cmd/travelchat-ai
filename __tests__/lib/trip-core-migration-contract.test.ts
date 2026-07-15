import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260715003000_multi_city_trip_core.sql"),
  "utf8",
);

describe("multi-city trip core migration contract", () => {
  it.each([
    "transfer_edges",
    "trips",
    "trip_stops",
    "trip_transfer_legs",
    "trip_days",
    "trip_activities",
  ])("creates and protects %s", (table) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}\\b`, "i"));
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
  });

  it("keeps ownership server-verifiable through the Clerk subject", () => {
    expect(sql).toContain("clerk_user_id = (SELECT auth.jwt() ->> 'sub')");
    expect(sql).not.toMatch(/ON public\.trips[^;]*TO anon/i);
    expect(sql).not.toMatch(/GRANT[^;]*public\.trips[^;]*TO anon/i);
  });

  it("enforces same-trip stop, day, and activity relationships", () => {
    expect(sql).toContain("FOREIGN KEY (from_stop_id, trip_id)");
    expect(sql).toContain("FOREIGN KEY (to_stop_id, trip_id)");
    expect(sql).toContain("FOREIGN KEY (stop_id, trip_id)");
    expect(sql).toContain("FOREIGN KEY (day_id, trip_id)");
  });

  it("preserves nullable spot ownership", () => {
    expect(sql).toMatch(/spot_id UUID REFERENCES public\.spots\(id\) ON DELETE SET NULL/i);
    expect(sql).toContain("Nullable by design");
  });

  it("links legacy itineraries without rewriting them", () => {
    expect(sql).toMatch(/legacy_itinerary_id UUID REFERENCES public\.itineraries\(id\) ON DELETE SET NULL/i);
    expect(sql).not.toMatch(/UPDATE public\.itineraries/i);
  });
});
