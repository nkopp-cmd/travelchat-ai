import "server-only";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";

interface GuideBatch { id: string; sourceCount: number; sourceSha256: string }
interface GuideRow { id: string; clerkUserId: string; status: string; appliedAt: string; payload: string }

export function isPreviewAdminGuidesCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Read one counted source batch. Missing or partial imports fail closed. */
export async function previewAdminGuides(status: string | null): Promise<Record<string, unknown>[]> {
  if (status !== null && status.length > 64) throw new Error("Invalid guide filter");
  const db = previewAppDataReader();
  const batch = await db.prepare(
    "SELECT id, sourceCount, sourceSha256 FROM legacy_guide_profile_batches ORDER BY importedAt DESC, id DESC LIMIT 1",
  ).first<GuideBatch>();
  if (!batch || !Number.isSafeInteger(batch.sourceCount) || batch.sourceCount < 0 || batch.sourceCount > 100
    || !/^[a-f0-9]{64}$/.test(batch.sourceSha256)) throw new Error("Guide archive unavailable");

  const count = await db.prepare("SELECT count(*) AS n FROM legacy_guide_profiles WHERE batchId = ?")
    .bind(batch.id).first<{ n: number }>();
  if (!count || count.n !== batch.sourceCount) throw new Error("Guide archive count mismatch");

  const statement = status === null
    ? db.prepare("SELECT id, clerkUserId, status, appliedAt, payload FROM legacy_guide_profiles WHERE batchId = ? ORDER BY appliedAt DESC, id DESC LIMIT 101").bind(batch.id)
    : db.prepare("SELECT id, clerkUserId, status, appliedAt, payload FROM legacy_guide_profiles WHERE batchId = ? AND status = ? ORDER BY appliedAt DESC, id DESC LIMIT 101").bind(batch.id, status);
  const { results } = await statement.all<GuideRow>();
  if (!Array.isArray(results) || results.length > 100) throw new Error("Guide archive unavailable");
  return results.map(row => {
    if (typeof row.id !== "string" || typeof row.clerkUserId !== "string" || typeof row.appliedAt !== "string"
      || !["pending", "approved", "rejected", "suspended"].includes(row.status)
      || typeof row.payload !== "string") throw new Error("Invalid guide archive row");
    const value: unknown = JSON.parse(row.payload);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid guide archive payload");
    const guide = value as Record<string, unknown>;
    if (guide.id !== row.id || guide.clerk_user_id !== row.clerkUserId
      || guide.status !== row.status || guide.applied_at !== row.appliedAt) {
      throw new Error("Guide archive payload mismatch");
    }
    return guide;
  });
}
