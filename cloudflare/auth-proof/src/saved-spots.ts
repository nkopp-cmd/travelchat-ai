import type { TrustedAppSession } from "./app-session";
import { appError } from "./app-error";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function savedSpots(request: Request, env: Env, session: TrustedAppSession, data: Record<string, unknown>) {
  const params = new URL(request.url).searchParams;
  const read = request.method === "GET";
  if (!["GET", "POST", "DELETE"].includes(request.method)) return appError("invalid_request", "Method not allowed", 405);
  if ([...params.keys()].some((key) => key !== "spotId") || params.getAll("spotId").length > 1
    || (!read && params.size > 0) || (read && Object.keys(data).length > 0)
    || (!read && (Object.keys(data).length !== 1 || !("spotId" in data)))) return appError("validation_error", "Only spotId accepted", 400);
  const input = read ? params.get("spotId") : data.spotId;
  if ((!read || input !== null) && (typeof input !== "string" || !uuid.test(input))) return appError("validation_error", "Spot ID must be a valid UUID", 400);
  const spotId = typeof input === "string" ? input.toLowerCase() : null;
  const { ownerId } = session;
  if (read && spotId === null) {
    const rows = await env.DB.prepare(`SELECT s.id, s.spotId AS spot_id, s.createdAtMs,
      p.id AS catalogId, p.name, p.description, p.category, p.localley_score, p.photos
      FROM saved_spots s LEFT JOIN spots p ON p.id = s.spotId AND p.visible = 1
      WHERE s.ownerId = ? ORDER BY s.createdAtMs DESC, s.id DESC LIMIT 1001`).bind(ownerId).all<{
        id: string; spot_id: string; createdAtMs: number; catalogId: string | null;
        name: string; description: string; category: string; localley_score: number | null; photos: string | null;
      }>();
    if (rows.results.length > 1000) return appError("conflict", "Saved spot list exceeds absolute limit of 1000", 409);
    return json({ success: true, spots: rows.results.map((row) => ({
      id: row.id, spot_id: row.spot_id, created_at: new Date(row.createdAtMs).toISOString(),
      spots: row.catalogId === null ? null : { id: row.catalogId, name: JSON.parse(row.name) as unknown,
        description: JSON.parse(row.description) as unknown, category: row.category,
        localley_score: row.localley_score, photos: row.photos === null ? null : JSON.parse(row.photos) as unknown },
    })) });
  }
  if (read) return json({ saved: !!await env.DB.prepare("SELECT id FROM saved_spots WHERE ownerId = ? AND spotId = ?").bind(ownerId, spotId).first() });
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM saved_spots WHERE ownerId = ? AND spotId = ?").bind(ownerId, spotId).run();
    return json({ success: true, saved: false, message: "Spot removed from saved" });
  }
  const saveId = crypto.randomUUID();
  const now = Date.now();
  // The write, event, and decision snapshot share one native D1 transaction.
  const result = await env.DB.batch<Record<string, string | number>>([
    env.DB.prepare(`INSERT INTO saved_spots (id, ownerId, spotId, createdAtMs)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM spots WHERE id = ? AND visible = 1)
      AND (SELECT count(*) FROM saved_spots WHERE ownerId = ?) < (SELECT savedSpotLimit FROM owner_limits WHERE ownerId = ?)
      AND NOT EXISTS (SELECT 1 FROM saved_spots WHERE ownerId = ? AND spotId = ?)
      ON CONFLICT(ownerId,spotId) DO NOTHING`).bind(saveId, ownerId, spotId, now, spotId, ownerId, ownerId, ownerId, spotId),
    env.DB.prepare(`INSERT INTO application_outbox (eventKey, saveId, action, ownerId, spotId, createdAt)
      SELECT ?, ?, 'save', ?, ?, ? WHERE changes() = 1`).bind(saveId + ":save", saveId, ownerId, spotId, now),
    env.DB.prepare("SELECT id FROM saved_spots WHERE ownerId = ? AND spotId = ?").bind(ownerId, spotId),
    env.DB.prepare("SELECT id FROM spots WHERE id = ? AND visible = 1").bind(spotId),
    env.DB.prepare("SELECT savedSpotLimit FROM owner_limits WHERE ownerId = ?").bind(ownerId),
    env.DB.prepare("SELECT count(*) AS current FROM saved_spots WHERE ownerId = ?").bind(ownerId),
  ]);
  if (result[2].results.length) return json({ success: true, saved: true,
    message: result[0].meta.changes ? "Spot saved successfully" : "Spot already saved" });
  if (!result[3].results.length) return appError("not_found", "Spot not found.", 404);
  if (!result[4].results.length) return appError("database_error", "Database operation failed. Please try again.", 503);
  return appError("limit_exceeded", "You've reached your saved spots limit.", 429,
    { limitType: "saved spots", current: result[5].results[0].current, limit: result[4].results[0].savedSpotLimit });
}
