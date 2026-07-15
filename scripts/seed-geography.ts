/**
 * Validate or seed the additive geography foundation.
 *
 * Dry run (default, no network/database write):
 *   npm run geo:seed
 *
 * Branch database only:
 *   GEOGRAPHY_SEED_ALLOW_BRANCH_WRITE=true npm run geo:seed -- --apply --target=branch
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { geographySeedManifest } from "../lib/geography/seed-manifest";
import {
  buildCountrySeedRows,
  buildDestinationSeedRows,
  buildVibeTaxonomySeedRows,
  destinationAliasRows,
  getGeographySeedSummary,
  localAreaAliasRows,
} from "../lib/geography/seed-tools";

type IdRow = { id: string; slug: string };

function argValue(name: string): string | undefined {
  const value = process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`));
  return value?.slice(name.length + 1);
}

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function seedBranchDatabase(supabase: SupabaseClient): Promise<void> {
  const manifest = geographySeedManifest;
  const now = new Date().toISOString();

  assertNoError(
    (await supabase.from("geo_countries").upsert(
      buildCountrySeedRows(manifest),
      { onConflict: "code" },
    )).error,
    "Could not seed geography countries",
  );
  assertNoError(
    (await supabase.from("geo_vibe_taxonomy").upsert(
      buildVibeTaxonomySeedRows(manifest),
      { onConflict: "slug,version" },
    )).error,
    "Could not seed vibe taxonomy",
  );
  assertNoError(
    (await supabase.from("geo_destinations").upsert(
      buildDestinationSeedRows(manifest),
      { onConflict: "slug" },
    )).error,
    "Could not seed destinations",
  );

  const { data: destinationRows, error: destinationError } = await supabase
    .from("geo_destinations")
    .select("id, slug");
  assertNoError(destinationError, "Could not reload destination IDs");
  const destinationIds = new Map(
    ((destinationRows || []) as IdRow[]).map((row) => [row.slug, row.id]),
  );

  for (const destination of manifest.destinations) {
    const destinationId = destinationIds.get(destination.slug);
    if (!destinationId) throw new Error(`Seeded destination is missing: ${destination.slug}`);
    if (destination.localAreas.length > 0) {
      const localAreaRows = destination.localAreas.map((area) => ({
        destination_id: destinationId,
        parent_id: null,
        kind: area.kind,
        slug: area.slug,
        name: area.name,
        characterization: area.characterization,
        traveler_types: area.travelerTypes,
        practical_notes: area.practicalNotes,
        center: area.center ? `POINT(${area.center.lng} ${area.center.lat})` : null,
        source_meta: area.sourceMeta,
        confidence: area.confidence,
        review_status: area.reviewStatus,
        reviewed_at: area.reviewedAt,
        updated_at: now,
      }));
      assertNoError(
        (await supabase.from("geo_local_areas").upsert(localAreaRows, {
          onConflict: "destination_id,slug",
        })).error,
        `Could not seed local areas for ${destination.slug}`,
      );
    }
  }

  const { data: localAreaRows, error: localAreaError } = await supabase
    .from("geo_local_areas")
    .select("id, slug, destination_id");
  assertNoError(localAreaError, "Could not reload local-area IDs");
  const localAreaIds = new Map(
    (localAreaRows || []).map((row) => [`${row.destination_id}:${row.slug}`, row.id as string]),
  );

  const { data: vibeRows, error: vibeError } = await supabase
    .from("geo_vibe_taxonomy")
    .select("id, slug")
    .eq("version", 1);
  assertNoError(vibeError, "Could not reload vibe IDs");
  const vibeIds = new Map(
    (vibeRows || []).map((row) => [row.slug as string, row.id as string]),
  );

  const aliases: Array<Record<string, unknown>> = [];
  const scores: Array<Record<string, unknown>> = [];
  for (const destination of manifest.destinations) {
    const destinationId = destinationIds.get(destination.slug)!;
    aliases.push(...destinationAliasRows({
      destinationId,
      aliases: destination.aliases,
      source: destination.sourceMeta.source,
    }));
    for (const area of destination.localAreas) {
      const localAreaId = localAreaIds.get(`${destinationId}:${area.slug}`);
      if (!localAreaId) throw new Error(`Seeded local area is missing: ${destination.slug}/${area.slug}`);
      aliases.push(...localAreaAliasRows({
        localAreaId,
        canonicalName: area.name.en,
        aliases: area.aliases,
        source: area.sourceMeta.source,
      }));
      for (const vibe of area.vibes) {
        const vibeId = vibeIds.get(vibe.slug);
        if (!vibeId) throw new Error(`Seeded vibe axis is missing: ${vibe.slug}`);
        scores.push({
          local_area_id: localAreaId,
          vibe_id: vibeId,
          score: vibe.score,
          confidence: vibe.confidence,
          evidence: { summary: vibe.evidence, manifestVersion: manifest.version },
          source_type: "curated",
          scored_at: area.reviewedAt,
          expires_at: null,
        });
      }
    }
  }

  if (aliases.length > 0) {
    assertNoError(
      (await supabase.from("geo_aliases").upsert(aliases, {
        onConflict: "entity_type,entity_id,normalized_alias",
      })).error,
      "Could not seed geography aliases",
    );
  }
  if (scores.length > 0) {
    assertNoError(
      (await supabase.from("geo_local_area_vibe_scores").upsert(scores, {
        onConflict: "local_area_id,vibe_id",
      })).error,
      "Could not seed local-area vibe scores",
    );
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const target = argValue("--target") || "dry-run";
  const envFile = argValue("--env-file") || ".env.local";
  dotenv.config({ path: path.resolve(process.cwd(), envFile), quiet: true });

  const summary = getGeographySeedSummary(geographySeedManifest);
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...summary }, null, 2));
    return;
  }
  if (target !== "branch" || process.env.GEOGRAPHY_SEED_ALLOW_BRANCH_WRITE !== "true") {
    throw new Error(
      "Refusing geography writes. Use --target=branch with GEOGRAPHY_SEED_ALLOW_BRANCH_WRITE=true on an isolated branch database.",
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Branch Supabase URL/service-role credentials are required.");

  await seedBranchDatabase(createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
  console.log(JSON.stringify({ mode: "branch-apply", seeded: true, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Geography seed failed.");
  process.exitCode = 1;
});
