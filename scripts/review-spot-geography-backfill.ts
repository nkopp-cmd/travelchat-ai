/**
 * Read-only spot geography assignment report. This script has no apply mode.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { assignSpotGeography } from "../lib/geography/spot-assignment";
import { SPOT_REVIEW_DISPOSITION_BY_ID } from "../lib/geography/spot-review-dispositions";
import { parseSpotCoordinates } from "../lib/spots/coordinates";
import { applyPublicSpotVisibilityFilters, shouldShowPublicSpot } from "../lib/spots/public-quality";

const PAGE_SIZE = 500;

type ReportSpotRow = {
  id: string;
  name: string | Record<string, string> | null;
  address: string | Record<string, string> | null;
  location: unknown;
  photos: string[] | null;
  category: string | null;
  verified: boolean | null;
  localley_score: number | null;
  google_place_id: string | null;
};

function argValue(name: string): string | undefined {
  const value = process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`));
  return value?.slice(name.length + 1);
}

function localizedText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const preferred = record.en || record.ko || record.ja || Object.values(record)[0];
  return typeof preferred === "string" ? preferred.trim() : "";
}

async function main(): Promise<void> {
  if (process.argv.includes("--apply")) {
    throw new Error("This command is intentionally read-only; --apply is not supported.");
  }
  const envFile = argValue("--env-file") || ".env.local";
  const outPath = argValue("--out") || "reports/spot-geography-backfill-review.json";
  dotenv.config({ path: path.resolve(process.cwd(), envFile), quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase read credentials are required.");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const spots: ReportSpotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("spots")
      .select("id,name,address,location,photos,category,verified,localley_score,google_place_id")
      .range(from, from + PAGE_SIZE - 1);
    query = applyPublicSpotVisibilityFilters(query);
    const { data, error } = await query;
    if (error) throw new Error(`Could not read public spots: ${error.message}`);
    spots.push(...((data || []) as ReportSpotRow[]));
    if ((data || []).length < PAGE_SIZE) break;
  }

  const assignments = spots
    .filter((spot) => shouldShowPublicSpot(spot))
    .map((spot) => {
      const coordinate = parseSpotCoordinates(spot.location);
      const assignment = assignSpotGeography({
        address: localizedText(spot.address),
        coordinate: coordinate ? { lat: coordinate.lat, lng: coordinate.lng } : null,
      });
      return {
        spotId: spot.id,
        name: localizedText(spot.name),
        address: localizedText(spot.address),
        ...assignment,
      };
    });
  const assigned = assignments.filter((row) => row.destinationSlug !== null);
  const needsReview = assignments.filter((row) => row.needsReview);
  const reviewedQuarantines = needsReview.flatMap((row) => {
    const disposition = SPOT_REVIEW_DISPOSITION_BY_ID.get(row.spotId);
    return disposition ? [{ ...row, disposition }] : [];
  });
  const unresolvedReviewQueue = needsReview.filter(
    (row) => !SPOT_REVIEW_DISPOSITION_BY_ID.has(row.spotId),
  );
  const localAreaAssigned = assignments.filter((row) => row.localAreaSlug !== null);
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "read-only-dry-run",
    totalPublicSpots: assignments.length,
    assignedDestinations: assigned.length,
    assignedPercent: assignments.length === 0
      ? 0
      : Number((assigned.length / assignments.length * 100).toFixed(2)),
    assignedLocalAreas: localAreaAssigned.length,
    reviewCount: needsReview.length,
    reviewedQuarantineCount: reviewedQuarantines.length,
    unresolvedReviewCount: unresolvedReviewQueue.length,
    reviewPercent: assignments.length === 0
      ? 0
      : Number((needsReview.length / assignments.length * 100).toFixed(2)),
  };
  const report = {
    summary,
    unresolvedReviewQueue,
    reviewedQuarantines,
    assignments,
  };
  const absoluteOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
  fs.writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, outPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Geography backfill review failed.");
  process.exitCode = 1;
});
