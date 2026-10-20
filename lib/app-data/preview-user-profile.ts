import "server-only";
import { previewAppDataReader } from "./preview-db";

// Same allow-list as the Supabase profile lookup: a username or a user id, nothing else.
export const PROFILE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const SHARE_CODE = /^[a-z0-9]{8}$/;

interface ProfileRow {
  profileId: string; ownerId: string; clerkUserId: string; username: string | null; xp: number | null;
  level: number | null; title: string | null; createdAt: string | null;
}
interface ItineraryRow {
  id: string; title: string | null; city: string | null; days: number; local_score: number | null;
  share_code: string | null; created_at: string; view_count: number;
}

const profileSelect = `SELECT p.id AS profileId, p.ownerId AS ownerId, l.clerkUserId AS clerkUserId, s.username, s.xp,
  s.level, s.title, s.createdAt FROM legacy_profile_stats s JOIN profiles p ON p.id = s.profileId
  JOIN legacy_owners l ON l.ownerId = p.ownerId`;

/** D1 view of /users/[username]: exact username first, then exact user id; duplicates fail closed. */
export async function previewUserProfile(segment: string) {
  if (!PROFILE_SEGMENT.test(segment)) return null;
  const db = previewAppDataReader();
  const lookup = async (column: "s.username" | "l.clerkUserId") => {
    const { results } = await db.prepare(`${profileSelect} WHERE ${column} = ? LIMIT 2`).bind(segment).all<ProfileRow>();
    if (!Array.isArray(results)) throw new Error("Preview profile unavailable");
    return results;
  };
  const byUsername = await lookup("s.username");
  if (byUsername.length > 1) return null;
  const rows = byUsername.length ? byUsername : await lookup("l.clerkUserId");
  if (rows.length !== 1) return null;
  const row = rows[0];

  const [shared, totals] = await Promise.all([
    db.prepare(`SELECT i.id, i.title, i.city, i.days, i.local_score, i.share_code, i.created_at,
      coalesce(m.viewCount, 0) AS view_count FROM itineraries i LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id
      WHERE i.ownerId = ? AND i.shared = 1 AND i.share_code IS NOT NULL ORDER BY i.created_at DESC, i.id DESC LIMIT 12`)
      .bind(row.ownerId).all<ItineraryRow>(),
    db.prepare(`SELECT count(*) AS total, coalesce(sum(i.shared = 1), 0) AS shared,
      coalesce(sum(CASE WHEN i.shared = 1 THEN coalesce(m.viewCount, 0) ELSE 0 END), 0) AS views
      FROM itineraries i LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id WHERE i.ownerId = ?`)
      .bind(row.ownerId).first<{ total: number; shared: number; views: number }>(),
  ]);
  if (!Array.isArray(shared.results) || !totals) throw new Error("Preview profile itineraries unavailable");

  return {
    // The D1 archive holds no display name, avatar or bio; the page falls back to the username.
    profile: {
      id: row.profileId, clerkId: row.clerkUserId, name: null, username: row.username, avatarUrl: null, bio: null,
      level: row.level ?? 1, totalXp: row.xp ?? 0, title: row.title || "Tourist", joinedAt: row.createdAt ?? "",
    },
    itineraries: shared.results
      .filter((item) => typeof item.share_code === "string" && SHARE_CODE.test(item.share_code))
      .map((item) => ({
        id: item.id, title: item.title ?? "Untitled", city: item.city ?? "", days: item.days,
        localScore: item.local_score ?? 0, shareCode: item.share_code as string, viewCount: item.view_count,
        createdAt: item.created_at,
      })),
    stats: { totalItineraries: totals.total, sharedItineraries: totals.shared, totalViews: totals.views },
  };
}
