import "server-only";
import { randomUUID } from "node:crypto";
import { newOwnerId } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

interface SaveInput {
  title: string;
  city: string;
  days: number;
  activities: unknown;
  localScore?: number;
}

/** Create the exact preview owner and itinerary in one transaction. */
export async function savePreviewItinerary(userId: string, input: SaveInput): Promise<Record<string, unknown>> {
  const ownerId = newOwnerId(userId);
  const activities = JSON.stringify(input.activities);
  if (!activities || Buffer.byteLength(activities, "utf8") > 65536) {
    throw new RangeError("Invalid preview itinerary activities");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const score = input.localScore || 50;
  const db = previewAppDataReader();
  const result = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO owners(id, source) SELECT ?, 'new'
      WHERE NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)`)
      .bind(ownerId, userId),
    db.prepare(`INSERT INTO itineraries(id, ownerId, title, city, days, activities, local_score, created_at)
      SELECT ?, o.id, ?, ?, ?, ?, ?, ? FROM owners o
      LEFT JOIN legacy_owners l ON l.ownerId = o.id
      WHERE (o.source = 'legacy-fixture' AND o.id = l.clerkUserId AND l.clerkUserId = ?)
        OR (o.source = 'new' AND o.id = ? AND l.ownerId IS NULL
          AND NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?))
      ORDER BY CASE WHEN o.source = 'legacy-fixture' THEN 0 ELSE 1 END LIMIT 1`)
      .bind(id, input.title, input.city, input.days, activities, score, now, userId, ownerId, userId),
  ]);
  if (!Array.isArray(result) || result.length !== 2 || result[1]?.meta?.changes !== 1) {
    throw new Error("Preview itinerary save failed");
  }
  return {
    id, user_id: null, clerk_user_id: userId, title: input.title, city: input.city,
    days: input.days, activities: input.activities, highlights: null, estimated_cost: null,
    subtitle: null, local_score: score, created_at: now, status: null,
    is_favorite: false, shared: false, share_code: null,
    is_public: false, like_count: 0, view_count: 0, source_profile_id: null,
    ai_backgrounds: null, story_slides: null,
  };
}
