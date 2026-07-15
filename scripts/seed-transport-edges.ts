/**
 * Validate or seed reviewed transport edges. Dry-run by default.
 * Branch-only apply requires both an explicit target and write guard.
 */

import { createHash } from "node:crypto";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { directedTransportEdges } from "../lib/trips/transport-manifest";

function argValue(name: string): string | undefined {
  const value = process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`));
  return value?.slice(name.length + 1);
}

function fingerprint(): string {
  return createHash("sha256")
    .update(JSON.stringify(directedTransportEdges))
    .digest("hex");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const target = argValue("--target") || "dry-run";
  const summary = {
    corridor: "kr-jp",
    directedEdges: directedTransportEdges.length,
    fingerprint: fingerprint(),
  };
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...summary }, null, 2));
    return;
  }
  if (target !== "branch" || process.env.MULTI_CITY_SEED_ALLOW_BRANCH_WRITE !== "true") {
    throw new Error(
      "Refusing transport writes. Use --target=branch with MULTI_CITY_SEED_ALLOW_BRANCH_WRITE=true on an isolated branch database.",
    );
  }
  dotenv.config({ path: path.resolve(process.cwd(), argValue("--env-file") || ".env.local"), quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Branch Supabase URL/service-role credentials are required.");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: destinations, error: destinationError } = await supabase
    .from("geo_destinations")
    .select("id,slug");
  if (destinationError) throw new Error(`Could not load branch destinations: ${destinationError.message}`);
  const ids = new Map((destinations || []).map((row) => [row.slug as string, row.id as string]));
  const rows = directedTransportEdges.map((edge) => {
    const fromId = ids.get(edge.from);
    const toId = ids.get(edge.to);
    if (!fromId || !toId) throw new Error(`Missing seeded endpoints for ${edge.id}.`);
    return {
      slug: edge.id,
      from_destination_id: fromId,
      to_destination_id: toId,
      mode: edge.mode,
      duration_min_minutes: edge.durationMinutes.min,
      duration_max_minutes: edge.durationMinutes.max,
      departure_buffer_minutes: edge.departureBufferMinutes,
      arrival_buffer_minutes: edge.arrivalBufferMinutes,
      hotel_change_minutes: edge.hotelChangeMinutes,
      cost_band: edge.costBand,
      booking_hint: { summary: edge.bookingHint },
      schedule_notes: { liveScheduleRequired: true, recheckAfter: edge.recheckAfter },
      source_type: "curated",
      source_meta: { sources: edge.sources, manifestVersion: 1 },
      confidence: edge.confidence,
      review_status: edge.reviewStatus,
      reviewed_at: edge.reviewedAt,
      valid_from: null,
      valid_until: edge.recheckAfter,
    };
  });
  const { error } = await supabase.from("transfer_edges").upsert(rows, { onConflict: "slug" });
  if (error) throw new Error(`Could not seed transport edges: ${error.message}`);
  console.log(JSON.stringify({ mode: "branch-apply", seeded: true, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Transport seed failed.");
  process.exitCode = 1;
});
