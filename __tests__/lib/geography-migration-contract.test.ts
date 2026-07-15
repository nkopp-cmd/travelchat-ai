import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260714235000_multi_city_geography_foundation.sql"),
  "utf8",
);

describe("multi-city geography migration contract", () => {
  it("is additive and leaves spot identities nullable during review", () => {
    expect(migration).toContain("ADD COLUMN destination_id UUID");
    expect(migration).toContain("ADD COLUMN local_area_id UUID");
    expect(migration).not.toMatch(/ADD COLUMN destination_id UUID NOT NULL/);
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/i);
  });

  it("enforces alias entity integrity with real foreign keys", () => {
    expect(migration).toContain("num_nonnulls(destination_id, local_area_id, spot_id) = 1");
    expect(migration).toContain("entity_type = 'destination' AND destination_id IS NOT NULL");
    expect(migration).toContain("UNIQUE (entity_type, entity_id, normalized_alias)");
  });

  it("enforces local-area membership in the assigned destination", () => {
    expect(migration).toContain("UNIQUE (id, destination_id)");
    expect(migration).toContain("FOREIGN KEY (local_area_id, destination_id)");
    expect(migration).toContain("REFERENCES public.geo_local_areas(id, destination_id)");
    expect(migration).toContain("ON DELETE SET NULL (local_area_id)");
  });

  it("enables RLS on every new table and reserves writes for service role", () => {
    const tables = [
      "geo_countries",
      "geo_destinations",
      "geo_local_areas",
      "geo_aliases",
      "geo_vibe_taxonomy",
      "geo_local_area_vibe_scores",
    ];
    for (const table of tables) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("TO anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+TO\s+anon/is);
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]+TO\s+authenticated/is);
  });
});
