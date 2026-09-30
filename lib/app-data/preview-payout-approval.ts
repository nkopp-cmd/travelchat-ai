import "server-only";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";
import { previewAdminGuides } from "./preview-admin-guides";
import { currentPreviewRevenueBatch, earningPayload, type EarningRow } from "./preview-guide-earnings";

export class PreviewPayoutMissing extends Error {}

export function isPreviewPayoutApprovalCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

type Scope = { month: string; earningIds?: never } | { earningIds: string[]; month?: never };

export function parsePayoutApproval(value: unknown): Scope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["month", "earningIds"].includes(key))) return null;
  if (typeof body.month === "string" && body.earningIds === undefined
    && /^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(body.month)) return { month: body.month };
  if (body.month === undefined && Array.isArray(body.earningIds)
    && body.earningIds.length > 0 && body.earningIds.length <= 100
    && body.earningIds.every(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id))
    && new Set(body.earningIds).size === body.earningIds.length) {
    return { earningIds: body.earningIds as string[] };
  }
  return null;
}

/** Approve only the latest counted source batch, preserving its immutable payloads. */
export async function approvePreviewPayouts(scope: Scope, adminId: string): Promise<number> {
  if (!adminId || adminId.length > 256) throw new Error("Invalid payout admin");
  const batch = await currentPreviewRevenueBatch();
  const db = previewAppDataReader();
  const byMonth = scope.month !== undefined;
  const filter = byMonth ? "e.earningMonth = ?"
    : `e.id IN (${scope.earningIds!.map(() => "?").join(",")})`;
  const values = byMonth ? [scope.month!] : scope.earningIds!;
  const { results } = await db.prepare(`SELECT e.id, e.guideClerkUserId, e.earningMonth,
    e.status, e.grossAmount, e.payload, a.approvedAt, a.approvedBy
    FROM legacy_guide_earnings e LEFT JOIN preview_earning_approvals a
    ON a.batchId = e.batchId AND a.earningId = e.id
    WHERE e.batchId = ? AND ${filter} LIMIT 101`).bind(batch.id, ...values).all<EarningRow>();
  if (!Array.isArray(results) || results.length > 100) throw new Error("Payout selection unavailable");
  if (!byMonth && results.length !== scope.earningIds!.length) {
    throw new PreviewPayoutMissing("Earning not found");
  }
  const guides = await previewAdminGuides(null);
  const approvedOwners = new Set(guides.filter(row => row.status === "approved").map(row => row.clerk_user_id));
  for (const row of results) {
    earningPayload(row);
    if (!approvedOwners.has(row.guideClerkUserId)) throw new Error("Payout guide unavailable");
  }
  const approvedAt = new Date().toISOString();
  const insert = db.prepare(`INSERT OR IGNORE INTO preview_earning_approvals
    (batchId, earningId, approvedAt, approvedBy)
    SELECT e.batchId, e.id, ?, ? FROM legacy_guide_earnings e
    WHERE e.batchId = ? AND e.status = 'calculated' AND ${filter}
    AND e.batchId = (SELECT id FROM legacy_guide_revenue_batches ORDER BY importedAt DESC, id DESC LIMIT 1)`)
    .bind(approvedAt, adminId, batch.id, ...values);
  const result = await insert.run();
  const latest = await db.prepare("SELECT id FROM legacy_guide_revenue_batches ORDER BY importedAt DESC, id DESC LIMIT 1")
    .first<{ id: string }>();
  if (latest?.id !== batch.id) throw new Error("Payout source changed during approval");
  if (!Number.isSafeInteger(result.meta.changes) || result.meta.changes < 0
    || result.meta.changes > results.length) throw new Error("Payout approval unavailable");
  return result.meta.changes;
}
