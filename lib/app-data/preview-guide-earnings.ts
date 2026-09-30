import "server-only";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";
import { previewAdminGuides } from "./preview-admin-guides";

interface RevenueBatch {
  id: string;
  earningsCount: number;
  engagementCount: number;
  earningsSha256: string;
  engagementSha256: string;
}
interface EarningRow {
  id: string;
  guideClerkUserId: string;
  earningMonth: string;
  status: string;
  grossAmount: string;
  payload: string;
}
interface EngagementRow {
  id: string;
  creatorClerkUserId: string;
  engagementMonth: string;
  contentType: string;
  engagementPoints: number;
  payload: string;
}

export class PreviewGuideNotApproved extends Error {}

export function isPreviewGuideEarningsCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

export function parseEarningsMonths(value: string | null): number | null {
  if (value === null) return 6;
  if (!/^(?:[1-9]|1\d|2[0-4])$/.test(value)) return null;
  return Number(value);
}

const statuses = new Set(["calculated", "approved", "processing", "paid", "failed", "below_minimum"]);
const kinds = new Set(["itinerary_view", "itinerary_save", "spot_view", "spot_save"]);
const sha256 = /^[a-f0-9]{64}$/;
const money = /^-?\d{1,8}(?:\.\d{1,2})?$/;
const month = /^\d{4}-(?:0[1-9]|1[0-2])-01$/;

function earningPayload(row: EarningRow): Record<string, unknown> {
  if (typeof row.id !== "string" || !row.id || typeof row.guideClerkUserId !== "string"
    || !month.test(row.earningMonth) || !statuses.has(row.status)
    || typeof row.grossAmount !== "string" || !money.test(row.grossAmount)
    || typeof row.payload !== "string") throw new Error("Invalid guide earning archive row");
  const value: unknown = JSON.parse(row.payload);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid guide earning payload");
  const earning = value as Record<string, unknown>;
  const payloadAmount = Number(earning.gross_amount);
  if (!Number.isFinite(payloadAmount) || !money.test(String(earning.gross_amount))
    || Math.round(payloadAmount * 100) !== Math.round(Number(row.grossAmount) * 100)
    || earning.id !== row.id || earning.guide_clerk_user_id !== row.guideClerkUserId
    || earning.earning_month !== row.earningMonth || earning.status !== row.status
    ) throw new Error("Guide earning payload mismatch");
  return earning;
}

function engagementPayload(row: EngagementRow): void {
  if (typeof row.id !== "string" || !row.id || typeof row.creatorClerkUserId !== "string"
    || !month.test(row.engagementMonth) || !kinds.has(row.contentType)
    || !Number.isSafeInteger(row.engagementPoints) || row.engagementPoints < 0
    || row.engagementPoints > 1000 || typeof row.payload !== "string") {
    throw new Error("Invalid guide engagement archive row");
  }
  const value: unknown = JSON.parse(row.payload);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid guide engagement payload");
  const engagement = value as Record<string, unknown>;
  if (engagement.id !== row.id || engagement.creator_clerk_user_id !== row.creatorClerkUserId
    || engagement.engagement_month !== row.engagementMonth
    || engagement.content_type !== row.contentType
    || engagement.engagement_points !== row.engagementPoints) {
    throw new Error("Guide engagement payload mismatch");
  }
}

/** Exact-owner read from two counted source pages. No provider or Supabase calls. */
export async function previewGuideEarnings(userId: string, months: number, now = new Date()) {
  if (!userId || userId.length > 256 || !Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error("Invalid guide earnings request");
  }
  const guides = await previewAdminGuides(null);
  const guide = guides.find(row => row.clerk_user_id === userId);
  if (!guide || guide.status !== "approved") throw new PreviewGuideNotApproved("Guide account is not active");

  const db = previewAppDataReader();
  const batch = await db.prepare(`SELECT id, earningsCount, engagementCount, earningsSha256,
    engagementSha256 FROM legacy_guide_revenue_batches ORDER BY importedAt DESC, id DESC LIMIT 1`)
    .first<RevenueBatch>();
  if (!batch || !Number.isSafeInteger(batch.earningsCount) || batch.earningsCount < 0
    || batch.earningsCount > 1000000 || !Number.isSafeInteger(batch.engagementCount)
    || batch.engagementCount < 0 || batch.engagementCount > 1000000
    || !sha256.test(batch.earningsSha256) || !sha256.test(batch.engagementSha256)) {
    throw new Error("Guide revenue archive unavailable");
  }
  const earningCount = await db.prepare("SELECT count(*) AS n FROM legacy_guide_earnings WHERE batchId = ?")
    .bind(batch.id).first<{ n: number }>();
  const engagementCount = await db.prepare("SELECT count(*) AS n FROM legacy_content_engagement WHERE batchId = ?")
    .bind(batch.id).first<{ n: number }>();
  if (earningCount?.n !== batch.earningsCount || engagementCount?.n !== batch.engagementCount) {
    throw new Error("Guide revenue archive count mismatch");
  }

  const { results: earningRows } = await db.prepare(`SELECT id, guideClerkUserId, earningMonth,
    status, grossAmount, payload FROM legacy_guide_earnings
    WHERE batchId = ? AND guideClerkUserId = ? ORDER BY earningMonth DESC LIMIT 501`)
    .bind(batch.id, userId).all<EarningRow>();
  if (!Array.isArray(earningRows) || earningRows.length > 500) throw new Error("Guide earnings exceed preview limit");
  const allEarnings = earningRows.map(earningPayload);
  const summary = { totalEarned: 0, totalPaidOut: 0, pendingBalance: 0 };
  for (const earning of allEarnings) {
    const amount = Number(earning.gross_amount);
    if (earning.status !== "failed") summary.totalEarned += amount;
    if (earning.status === "paid") summary.totalPaidOut += amount;
    if (["calculated", "approved", "processing", "below_minimum"].includes(String(earning.status))) {
      summary.pendingBalance += amount;
    }
  }

  const currentMonth = `${now.toISOString().slice(0, 7)}-01`;
  const { results: engagementRows } = await db.prepare(`SELECT id, creatorClerkUserId,
    engagementMonth, contentType, engagementPoints, payload FROM legacy_content_engagement
    WHERE batchId = ? AND creatorClerkUserId = ? AND engagementMonth = ? LIMIT 10001`)
    .bind(batch.id, userId, currentMonth).all<EngagementRow>();
  if (!Array.isArray(engagementRows) || engagementRows.length > 10000) {
    throw new Error("Guide engagement exceeds preview limit");
  }
  const currentEngagement = { totalPoints: 0, itineraryViews: 0, itinerarySaves: 0, spotViews: 0, spotSaves: 0 };
  for (const row of engagementRows) {
    engagementPayload(row);
    currentEngagement.totalPoints += row.engagementPoints;
    if (row.contentType === "itinerary_view") currentEngagement.itineraryViews++;
    else if (row.contentType === "itinerary_save") currentEngagement.itinerarySaves++;
    else if (row.contentType === "spot_view") currentEngagement.spotViews++;
    else currentEngagement.spotSaves++;
  }
  return { summary, currentMonth: currentEngagement, earnings: allEarnings.slice(0, months) };
}
