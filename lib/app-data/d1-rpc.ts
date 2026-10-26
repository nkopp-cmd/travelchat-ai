import "server-only";
import type { PreviewAppDataReader } from "./preview-db";
import { nowTimestamptz, usageCheck, type PostgrestResult } from "./d1-postgrest";
import { integer, journal, RaiseException, text, type Args } from "./d1-rpc-shared";
import { SOCIAL_MEDIA_RPCS } from "./d1-rpc-social";

/**
 * D1 versions of Postgres functions called through `supabase.rpc()` (Supabase exit step 3). Each returns what
 * PostgREST returns for the function: a set-returning function -> array of rows, a scalar -> the value.
 */

/** Postgres CURRENT_DATE (UTC on Supabase) truncated like the functions do: day, ISO week (Monday) or month. */
export function periodStart(periodType: unknown, now = new Date()): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (periodType === "daily") return day.toISOString().slice(0, 10);
  if (periodType === "weekly") {
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
  }
  return `${day.toISOString().slice(0, 7)}-01`;
}

/**
 * check_and_increment_usage_weighted: the limit check and the increment are ONE statement (D1 runs each statement
 * atomically), which replaces the pg_advisory_xact_lock. Denied -> no write, current count returned.
 */
async function checkAndIncrementUsageWeighted(db: PreviewAppDataReader, args: Args) {
  const owner = text(args, "p_clerk_user_id"), usageType = text(args, "p_usage_type"), periodType = text(args, "p_period_type");
  const limit = integer(args, "p_limit"), amount = integer(args, "p_amount", 1);
  const start = periodStart(periodType), now = nowTimestamptz();
  const [, upsert] = await db.batch([
    db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING").bind(owner),
    db.prepare(`INSERT INTO legacy_usage (id, ownerId, usageType, periodStart, periodType, count, createdAt, updatedAt)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ? <= ?
      ON CONFLICT (ownerId, usageType, periodStart, periodType) DO UPDATE SET count = legacy_usage.count + excluded.count, updatedAt = excluded.updatedAt
      WHERE legacy_usage.count + excluded.count <= ?
      RETURNING count`).bind(crypto.randomUUID(), owner, usageType, start, periodType, amount, now, now, amount, limit, limit),
    journal(db, "usage_tracking", "upsert", { clerk_user_id: owner, usage_type: usageType, period_start: start, period_type: periodType }),
  ]);
  const written = upsert.results?.[0] as { count?: number } | undefined;
  if (typeof written?.count === "number") return [{ allowed: true, new_count: written.count, was_at_limit: false }];
  const current = await db.prepare("SELECT count FROM legacy_usage WHERE ownerId = ? AND usageType = ? AND periodType = ? AND periodStart = ?")
    .bind(owner, usageType, periodType, start).first<{ count: number }>();
  const count = current?.count ?? 0;
  return [{ allowed: false, new_count: count, was_at_limit: count >= limit }];
}

/** increment_usage: unconditional +1 upsert, returns the new count. */
async function incrementUsage(db: PreviewAppDataReader, args: Args) {
  const owner = text(args, "p_clerk_user_id"), usageType = text(args, "p_usage_type");
  const periodType = typeof args.p_period_type === "string" ? args.p_period_type : "monthly";
  const now = nowTimestamptz();
  const [, upsert] = await db.batch([
    db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING").bind(owner),
    db.prepare(`INSERT INTO legacy_usage (id, ownerId, usageType, periodStart, periodType, count, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT (ownerId, usageType, periodStart, periodType) DO UPDATE SET count = legacy_usage.count + 1, updatedAt = excluded.updatedAt
      RETURNING count`).bind(crypto.randomUUID(), owner, usageType, periodStart(periodType), periodType, now, now),
    journal(db, "usage_tracking", "upsert", { clerk_user_id: owner, usage_type: usageType, period_start: periodStart(periodType), period_type: periodType }),
  ]);
  return (upsert.results?.[0] as { count: number }).count;
}

/** track_content_engagement: paid viewers only, no self-engagement, one row per viewer/content/day. */
async function trackContentEngagement(db: PreviewAppDataReader, args: Args) {
  const viewer = text(args, "p_viewer_clerk_user_id"), tier = text(args, "p_viewer_tier"), type = text(args, "p_content_type");
  if (!["pro", "premium"].includes(tier) || viewer === args.p_creator_clerk_user_id) return false;
  const points = ({ itinerary_view: 1, itinerary_save: 3, spot_view: 1, spot_save: 2 } as Record<string, number>)[type] ?? 1;
  const today = periodStart("daily");
  await db.batch([
    db.prepare(`INSERT INTO content_engagement (id, viewer_clerk_user_id, viewer_tier, content_type, content_id, creator_clerk_user_id,
        engagement_points, engagement_date, engagement_month, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (viewer_clerk_user_id, content_type, content_id, engagement_date) DO NOTHING`)
      .bind(crypto.randomUUID(), viewer, tier, type, text(args, "p_content_id"), (args.p_creator_clerk_user_id as string | null) ?? null,
        points, today, periodStart("monthly"), nowTimestamptz()),
    journal(db, "content_engagement", "upsert", { viewer_clerk_user_id: viewer, content_type: type, content_id: text(args, "p_content_id"), engagement_date: today }),
  ]);
  return true;
}

/** replace_weekly_city_spot_rankings: delete the week/city set and insert the new one in one transaction. */
async function replaceWeeklyCitySpotRankings(db: PreviewAppDataReader, args: Args) {
  const week = text(args, "p_week_start"), city = text(args, "p_city_slug");
  const rankings = Array.isArray(args.p_rankings) ? args.p_rankings as Record<string, unknown>[] : [];
  const now = nowTimestamptz();
  await db.batch([
    db.prepare("DELETE FROM weekly_city_spot_rankings WHERE week_start = ? AND city_slug = ?").bind(week, city),
    // The whole week/city set is replaced: replay syncs every Supabase row of that key to D1.
    journal(db, "weekly_city_spot_rankings", "upsert", { week_start: week, city_slug: city }),
    ...rankings.map((r) => db.prepare(`INSERT INTO weekly_city_spot_rankings (id, week_start, city_slug, spot_id, rank, score, post_count,
        platform_count, signal_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), week, city, (r.spot_id as string | null) ?? null, (r.rank as number | null) ?? null, (r.score as number | null) ?? null,
        (r.post_count as number | null) ?? null, (r.platform_count as number | null) ?? null,
        r.signal_summary === undefined || r.signal_summary === null ? null : JSON.stringify(r.signal_summary), now, now)),
  ]);
  return rankings.length;
}

/**
 * award_social_submission_tokens_v1: one ledger row per submission (unique submission_id+reason). The ledger row gets a
 * fresh id; the contributor and submission updates run in the same batch only if that row was inserted.
 */
async function awardSocialSubmissionTokens(db: PreviewAppDataReader, args: Args) {
  const submission = text(args, "p_submission_id"), contributor = text(args, "p_contributor_id"), delta = integer(args, "p_delta");
  if (delta <= 0) throw new RaiseException("Token award must be positive");
  const match = await db.prepare("SELECT 1 AS ok FROM social_spot_submissions WHERE id = ? AND contributor_id = ?").bind(submission, contributor).first();
  if (!match) throw new RaiseException("Submission and contributor do not match");
  const ledgerId = crypto.randomUUID(), now = nowTimestamptz(), inserted = "EXISTS (SELECT 1 FROM contribution_token_ledger WHERE id = ?)";
  await db.batch([
    db.prepare(`INSERT INTO contribution_token_ledger (id, contributor_id, submission_id, delta, reason, metadata, created_at)
      VALUES (?, ?, ?, ?, 'social_spot_submission', ?, ?) ON CONFLICT (submission_id, reason) DO NOTHING`)
      .bind(ledgerId, contributor, submission, delta, JSON.stringify(args.p_metadata ?? {}), now),
    // spot_contributors_updated_at trigger: updated_at = now().
    db.prepare(`UPDATE spot_contributors SET total_tokens = total_tokens + ?, last_submitted_at = ?, updated_at = ? WHERE id = ? AND ${inserted}`)
      .bind(delta, now, now, contributor, ledgerId),
    db.prepare(`UPDATE social_spot_submissions SET token_awarded = ?, updated_at = ? WHERE id = ? AND ${inserted}`).bind(delta, now, submission, ledgerId),
    journal(db, "contribution_token_ledger", "upsert", { submission_id: submission, reason: "social_spot_submission" }),
    journal(db, "spot_contributors", "upsert", { id: contributor }),
    journal(db, "social_spot_submissions", "upsert", { id: submission }),
  ]);
  const awarded = await db.prepare("SELECT 1 AS ok FROM contribution_token_ledger WHERE id = ?").bind(ledgerId).first();
  const total = await db.prepare("SELECT total_tokens FROM spot_contributors WHERE id = ?").bind(contributor).first<{ total_tokens: number }>();
  return [{ awarded: awarded ? delta : 0, total_tokens: total?.total_tokens ?? 0 }];
}

export const D1_RPCS: Record<string, (db: PreviewAppDataReader, args: Args) => Promise<unknown>> = {
  check_and_increment_usage_weighted: checkAndIncrementUsageWeighted,
  increment_usage: incrementUsage,
  track_content_engagement: trackContentEngagement,
  replace_weekly_city_spot_rankings: replaceWeeklyCitySpotRankings,
  award_social_submission_tokens_v1: awardSocialSubmissionTokens,
  ...SOCIAL_MEDIA_RPCS,
};

const USAGE_RPCS = { check_and_increment_usage_weighted: true, increment_usage: true };

/** PostgREST-shaped rpc() result. Only the service role calls these functions today. */
export async function d1Rpc(db: PreviewAppDataReader, name: string, args: Args = {}): Promise<PostgrestResult<unknown>> {
  const fn = D1_RPCS[name];
  if (!fn) throw new Error(`D1 rpc: function ${name} is not migrated`);
  const violated = name in USAGE_RPCS ? usageCheck(args.p_usage_type, args.p_period_type ?? "monthly") : null;
  if (violated) {
    return { data: null, error: { code: "23514", message: `new row for relation "usage_tracking" violates check constraint "${violated}"`, details: null, hint: null }, count: null, status: 400 };
  }
  try {
    return { data: await fn(db, args), error: null, count: null, status: 200 };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (cause instanceof RaiseException) return { data: null, error: { code: cause.code, message, details: null, hint: null }, count: null, status: 400 };
    if (/CHECK constraint failed/i.test(message)) return { data: null, error: { code: "23514", message, details: null, hint: null }, count: null, status: 400 };
    if (/UNIQUE constraint failed/i.test(message)) return { data: null, error: { code: "23505", message, details: null, hint: null }, count: null, status: 409 };
    throw cause;
  }
}
