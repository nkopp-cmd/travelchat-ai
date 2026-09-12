import type { TrustedAppSession } from "./app-session";
import { appError } from "./app-error";

const fields = ["marketing", "weekly_digest", "product_updates", "itinerary_shared"] as const;
type PreferencesRow = Record<typeof fields[number], number>;
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });

export async function emailPreferences(request: Request, env: Env, session: TrustedAppSession, data: Record<string, unknown>) {
  if (!["GET", "PUT"].includes(request.method)) return appError("method_not_allowed", "Method not allowed", 405);
  if (new URL(request.url).search) return appError("validation_error", "Unexpected query", 400);
  let preferences: Record<string, unknown> = {};
  if (request.method === "PUT") {
    const input = data.preferences;
    if (Object.keys(data).length !== 1 || !input || typeof input !== "object" || Array.isArray(input)) {
      return appError("validation_error", "Only preferences are accepted", 400);
    }
    preferences = input as Record<string, unknown>;
    if (!Object.keys(preferences).length || Object.entries(preferences).some(([key, value]) =>
      !fields.some(field => field === key) || typeof value !== "boolean")) {
      return appError("validation_error", "Use supported boolean preferences", 400);
    }
  }
  // Recheck the exact session and identity in the same statement as the private operation.
  const identity = `SELECT o.id, o.source FROM owners o
    JOIN profiles p ON p.ownerId = o.id JOIN identity_links l ON l.ownerId = o.id
    JOIN user u ON u.id = l.authUserId JOIN session s ON s.userId = u.id
    WHERE o.id = ? AND p.id = ? AND u.id = ? AND u.emailVerified = 1
      AND s.id = ? AND s.expiresAt > CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER)`;
  const bindings = [session.ownerId, session.userRecordId, session.authUserId, session.sessionId];
  let row: PreferencesRow | null;
  if (request.method === "GET") {
    row = await env.DB.prepare(`WITH identity AS (${identity})
      SELECT ${fields.map(field => `coalesce(e.${field}, 0) AS ${field}`).join(", ")}
      FROM identity i LEFT JOIN email_preferences e ON e.ownerId = i.id
      WHERE e.ownerId IS NOT NULL OR i.source = 'new'`).bind(...bindings).first<PreferencesRow>();
  } else {
    // Only supplied fields change. One UPSERT avoids lost updates between independent toggles.
    row = await env.DB.prepare(`WITH identity AS (${identity})
      INSERT INTO email_preferences (ownerId, ${fields.join(", ")})
      SELECT i.id, ${fields.map(() => "?").join(", ")} FROM identity i
      WHERE i.source = 'new' OR EXISTS (SELECT 1 FROM email_preferences e WHERE e.ownerId = i.id)
      ON CONFLICT(ownerId) DO UPDATE SET ${fields.map(field => `${field} = CASE WHEN ? THEN excluded.${field} ELSE email_preferences.${field} END`).join(", ")}
      RETURNING ${fields.join(", ")}`)
      .bind(...bindings, ...fields.map(field => preferences[field] === true ? 1 : 0),
        ...fields.map(field => Object.hasOwn(preferences, field) ? 1 : 0)).first<PreferencesRow>();
  }
  if (!row) return appError("preferences_unavailable", "Preferences are unavailable. Refresh your session or complete account migration.", 409);
  return json({ ...(request.method === "PUT" ? { success: true } : {}),
    preferences: Object.fromEntries(fields.map(field => [field, row[field] === 1])) });
}
