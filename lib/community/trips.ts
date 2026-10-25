import "server-only";
import type { CommunityDb, QuestionRow } from "./qa";
import { ACTIVE_TRIP_LIMIT, type ReportReason } from "./rules";

/** "Travelling now" on the application D1 (migrations/app-preview/0043_community_trips.sql). Same conventions as ./qa.ts. */
export type TripRow = {
  id: string; user_id: string; author_name: string; city: string; from_day: string; to_day: string; note: string;
  status: "visible" | "hidden"; created_at: string; open_reports: number;
  ai_verdict?: string | null; ai_reason?: string | null;
};

/**
 * Travellers in a city whose stay overlaps [from, to], minus people the viewer hid. The viewer's own trips stay in
 * the list so they see themselves in the group. Hidden trips and report counts only for admins.
 */
export async function listTravellers(db: CommunityDb, viewerId: string, city: string, range: { from: string; to: string }, admin = false): Promise<TripRow[]> {
  const { results } = await db.prepare(
    `SELECT t.*, ${admin ? "(SELECT count(*) FROM community_trip_reports r WHERE r.trip_id = t.id AND r.resolved_at IS NULL)" : "0"} AS open_reports
     FROM community_trips t
     WHERE t.city = ? AND t.from_day <= ? AND t.to_day >= ?${admin ? "" : " AND t.status = 'visible'"}
       AND NOT EXISTS (SELECT 1 FROM community_hidden_people h WHERE h.viewer_id = ? AND h.hidden_user_id = t.user_id)
     ORDER BY t.from_day, t.created_at LIMIT 200`,
  ).bind(city, range.to, range.from, viewerId).all<TripRow>();
  return results;
}

/** Meetup posts (Q&A topic "meetup") in the city, asked during the week. */
export async function listMeetups(db: CommunityDb, viewerId: string, city: string, range: { from: string; to: string }): Promise<QuestionRow[]> {
  const { results } = await db.prepare(
    `SELECT q.*, EXISTS (SELECT 1 FROM community_votes v WHERE v.user_id = ? AND v.target_type = 'question' AND v.target_id = q.id) AS voted
     FROM community_questions q
     WHERE q.status = 'visible' AND q.topic = 'meetup' AND q.city = ? AND substr(q.created_at, 1, 10) BETWEEN ? AND ?
       AND NOT EXISTS (SELECT 1 FROM community_hidden_people h WHERE h.viewer_id = ? AND h.hidden_user_id = q.user_id)
     ORDER BY q.created_at DESC LIMIT 50`,
  ).bind(viewerId, city, range.from, range.to, viewerId).all<QuestionRow>();
  return results;
}

export async function myTrips(db: CommunityDb, userId: string, today: string): Promise<TripRow[]> {
  const { results } = await db.prepare("SELECT t.*, 0 AS open_reports FROM community_trips t WHERE t.user_id = ? AND t.to_day >= ? ORDER BY t.from_day")
    .bind(userId, today).all<TripRow>();
  return results;
}

export async function addTrip(db: CommunityDb, author: { userId: string; name: string }, today: string,
  input: { city: string; from: string; to: string; note: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const active = await db.prepare("SELECT count(*) AS n FROM community_trips WHERE user_id = ? AND to_day >= ?").bind(author.userId, today).first<{ n: number }>();
  if (Number(active?.n ?? 0) >= ACTIVE_TRIP_LIMIT) return { ok: false, error: `You can list up to ${ACTIVE_TRIP_LIMIT} upcoming trips. Remove one first.` };
  const id = crypto.randomUUID();
  const inserted = await db.prepare(
    "INSERT OR IGNORE INTO community_trips (id, user_id, author_name, city, from_day, to_day, note) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
  ).bind(id, author.userId, author.name, input.city, input.from, input.to, input.note).first<{ id: string }>();
  return inserted ? { ok: true, id } : { ok: false, error: "You already listed a trip to this city starting that day." };
}

/** Leaving a group = deleting one's own trip. */
export async function removeTrip(db: CommunityDb, userId: string, tripId: string): Promise<void> {
  await db.prepare("DELETE FROM community_trips WHERE id = ? AND user_id = ?").bind(tripId, userId).run();
}

export async function hidePerson(db: CommunityDb, viewerId: string, userId: string): Promise<void> {
  if (viewerId === userId) return;
  await db.prepare("INSERT OR IGNORE INTO community_hidden_people (viewer_id, hidden_user_id) VALUES (?, ?)").bind(viewerId, userId).run();
}

export async function reportTrip(db: CommunityDb, userId: string, tripId: string, reason: ReportReason): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO community_trip_reports (trip_id, user_id, reason) SELECT id, ?, ? FROM community_trips WHERE id = ? AND user_id <> ?")
    .bind(userId, reason, tripId, userId).run();
}

export async function setTripStatus(db: CommunityDb, tripId: string, status: "visible" | "hidden"): Promise<void> {
  await db.batch([
    db.prepare("UPDATE community_trips SET status = ? WHERE id = ?").bind(status, tripId),
    db.prepare("UPDATE community_trip_reports SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE trip_id = ? AND resolved_at IS NULL").bind(tripId),
  ]);
}
