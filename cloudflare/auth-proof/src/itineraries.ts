import type { TrustedAppSession } from "./app-session";
import { isBoundedJSON as validJSON, isEditableItineraryPlan, mergeItineraryPlanPayload } from "../../../lib/itineraries/plan-contract";

export const itineraryDetailPath = /^\/api\/itineraries\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
export const itineraryUpdatePath = /^\/api\/itineraries\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/update$/i;
export const itineraryDuplicatePath = /^\/api\/itineraries\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/duplicate$/i;
export const itineraryBodyLimit = 512 * 1024;
export const itineraryCollectionLimit = 25;
export const itineraryCollectionByteLimit = 1024 * 1024;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const fields = ["title", "city", "activities", "highlights", "estimated_cost"] as const;
export interface ItineraryRow {
  id: string; ownerId: string; title: string | null; city: string | null; days: number;
  activities: string; highlights: string | null; estimated_cost: string | null;
  subtitle: string | null; local_score: number | null; created_at: string; status: string | null; is_favorite: number;
}

function equivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every((key) => Object.hasOwn(right, key) && equivalent(left[key], right[key]));
}
export function itineraryDTO(row: ItineraryRow) {
  const activities: unknown = JSON.parse(row.activities);
  const highlights: unknown = row.highlights === null ? null : JSON.parse(row.highlights);
  if (!validJSON(activities) || !validJSON(highlights)) throw new Error("Unsupported stored JSON");
  return { ...row, activities, highlights, is_favorite: row.is_favorite === 1 };
}

export type ItinerarySummaryDTO = Omit<ReturnType<typeof itineraryDTO>, "activities">;

// Detail and PATCH return the full DTO. Collection returns summaries WITHOUT activities.
// Frontend contract: { itineraries: ItinerarySummaryDTO[], nextOffset: number|null }.
// Follow nextOffset until null. Defaults: limit=25, offset=0; maximum limit=25.
// UTF-8 response budget: 1 MiB including the envelope. Return only a contiguous prefix;
// nextOffset advances by its actual length. An oversized first summary returns 413.
// Ordering is created_at DESC, id DESC. Offset pages are not a cross-request snapshot.
// created_at passes through unchanged. Native fixtures use YYYY-MM-DDTHH:mm:ss.sssZ;
// this does not establish full historical import timestamp precision.
export async function itineraries(request: Request, env: Env, session: TrustedAppSession, data: Record<string, unknown>): Promise<Response> {
  const url = new URL(request.url);
  const update = itineraryUpdatePath.exec(url.pathname);
  const detail = itineraryDetailPath.exec(url.pathname);
  if (request.method === "GET" && url.pathname === "/api/itineraries") {
    const params = url.searchParams;
    if ([...params.keys()].some((key) => !["limit", "offset"].includes(key) || params.getAll(key).length !== 1)) return json({ error: "Invalid pagination" }, 400);
    const limit = Number(params.get("limit") ?? itineraryCollectionLimit), offset = Number(params.get("offset") ?? 0);
    if (["limit", "offset"].some((key) => params.has(key) && !/^\d+$/.test(params.get(key)!))
      || !Number.isSafeInteger(limit) || limit < 1 || limit > itineraryCollectionLimit || !Number.isSafeInteger(offset) || offset < 0 || offset > Number.MAX_SAFE_INTEGER - 26) return json({ error: "Invalid pagination" }, 400);
    // Reserve the larger envelope and one comma per row. D1 measures encoded summaries
    // before returning them, so oversized metadata never materializes in the Worker.
    // Activities are neither selected nor parsed. The lookahead is only a marker.
    const envelopeBytes = Math.max(JSON.stringify({ itineraries: [], nextOffset: offset + limit }).length,
      JSON.stringify({ itineraries: [], nextOffset: null }).length);
    const rows = (await env.DB.prepare(`WITH summaries AS (
      SELECT id, created_at, json_object('id', id, 'ownerId', ownerId, 'title', title, 'city', city,
        'days', days, 'highlights', json(highlights), 'estimated_cost', estimated_cost,
        'subtitle', subtitle, 'local_score', local_score, 'created_at', created_at, 'status', status,
        'is_favorite', json(CASE is_favorite WHEN 1 THEN 'true' ELSE 'false' END)) AS summary
      FROM itineraries WHERE ownerId = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    ), bounded AS (
      SELECT summary, id, created_at,
        row_number() OVER (ORDER BY created_at DESC, id DESC) AS position,
        sum(length(CAST(summary AS BLOB)) + 1) OVER (ORDER BY created_at DESC, id DESC) AS bytes
      FROM summaries
    ) SELECT CASE WHEN position <= ? AND bytes <= ? THEN summary ELSE NULL END AS summary
      FROM bounded ORDER BY created_at DESC, id DESC`)
      .bind(session.ownerId, limit + 1, offset, limit, itineraryCollectionByteLimit - envelopeBytes)
      .all<{ summary: string | null }>()).results;
    const summaries: string[] = [];
    for (const row of rows) {
      if (row.summary === null) break;
      summaries.push(row.summary);
    }
    if (rows.length && !summaries.length) return json({ error: "Itinerary summary exceeds response budget" }, 413);
    const nextOffset = rows.length > summaries.length ? offset + summaries.length : null;
    return new Response(`{"itineraries":[${summaries.join(",")}],"nextOffset":${nextOffset}}`, {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (request.method === "POST" && url.pathname === "/api/itineraries") {
    if (url.search) return json({ error: "Unexpected query" }, 400);
    if (!validJSON(data)) return json({ error: "Unsupported JSON" }, 400);
    if (Object.keys(data).some((key) => !["title", "city", "days", "insights", "highlights", "estimated_cost"].includes(key))
      || typeof data.title !== "string" || !data.title.trim() || typeof data.city !== "string" || !data.city.trim()
      || !Array.isArray(data.days)
      || !isEditableItineraryPlan(Object.hasOwn(data, "insights") ? { dailyPlans: data.days, insights: data.insights } : data.days)
      || (Object.hasOwn(data, "highlights") && (!Array.isArray(data.highlights) || data.highlights.some((item) => typeof item !== "string")))
      || (Object.hasOwn(data, "estimated_cost") && data.estimated_cost !== null && typeof data.estimated_cost !== "string")) return json({ error: "Invalid itinerary fields" }, 400);
    const activities = mergeItineraryPlanPayload([], data.days, Array.isArray(data.insights) ? data.insights : []);
    if (!isEditableItineraryPlan(activities)) return json({ error: "Invalid itinerary fields" }, 400);
    const dayCount = Array.isArray(activities) ? activities.length : activities.dailyPlans.length;
    if (!Number.isSafeInteger(dayCount) || dayCount < 1) return json({ error: "Invalid itinerary fields" }, 400);
    const saved = await env.DB.prepare(`INSERT INTO itineraries (id, ownerId, title, city, days, activities, highlights, estimated_cost, subtitle, local_score, status, is_favorite)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'draft', 0) RETURNING *`)
      .bind(crypto.randomUUID(), session.ownerId, data.title, data.city, dayCount, JSON.stringify(activities),
        JSON.stringify(data.highlights ?? []), data.estimated_cost || null).first<ItineraryRow>();
    return saved ? json({ itinerary: itineraryDTO(saved) }, 201) : json({ error: "Incomplete identity" }, 409);
  }
  const duplicate = itineraryDuplicatePath.exec(url.pathname);
  if (duplicate && request.method === "POST") {
    if (url.search) return json({ error: "Unexpected query" }, 400);
    if (Object.keys(data).length) return json({ error: "Unexpected body" }, 400);
    const sourceId = duplicate[1].toLowerCase();
    const observed = await env.DB.prepare("SELECT * FROM itineraries WHERE id = ? AND ownerId = ?").bind(sourceId, session.ownerId).first<ItineraryRow>();
    if (!observed) return json({ error: "Not found" }, 404);
    if (!Number.isSafeInteger(observed.days) || observed.days < 1) return json({ error: "Itinerary metadata requires repair" }, 400);
    itineraryDTO(observed);
    const title = observed.title && observed.title.trim() ? `${observed.title} (Copy)` : "Copy";
    const saved = await env.DB.prepare(`INSERT INTO itineraries (id, ownerId, title, city, days, activities, highlights, estimated_cost, subtitle, local_score, status, is_favorite)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0) RETURNING *`)
      .bind(crypto.randomUUID(), session.ownerId, title, observed.city, observed.days, observed.activities,
        observed.highlights, observed.estimated_cost, observed.subtitle, observed.local_score).first<ItineraryRow>();
    return saved ? json({ itinerary: itineraryDTO(saved) }, 201) : json({ error: "Incomplete identity" }, 409);
  }
  if (!(detail && ["GET", "DELETE"].includes(request.method)) && !(update && request.method === "PATCH")) return json({ error: "Method not allowed" }, 405);
  if (url.search) return json({ error: "Unexpected query" }, 400);
  const id = (update ?? detail)![1].toLowerCase();
  if (request.method === "DELETE") {
    // Delete the current owned resource, not a client revision. Missing and foreign IDs
    // have the same repeat-safe response. No pre-read, quota changes, or event effects.
    await env.DB.prepare("DELETE FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, session.ownerId).run();
    return json({ success: true });
  }
  const observed = await env.DB.prepare("SELECT * FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, session.ownerId).first<ItineraryRow>();
  if (!observed) return json({ error: "Not found" }, 404);
  const current = itineraryDTO(observed);
  if (request.method === "GET") return json(current);
  if (!Object.hasOwn(data, "expected")) return json({ error: "Expected snapshot required" }, 428);
  if (!Number.isSafeInteger(observed.days) || observed.days < 1) return json({ error: "Itinerary metadata requires repair" }, 400);
  if (!validJSON(data)) return json({ error: "Unsupported JSON" }, 400);
  const expected = data.expected;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)
    || Object.keys(expected).length !== 5 || fields.some((key) => !Object.hasOwn(expected, key))) return json({ error: "Invalid expected snapshot" }, 400);
  const snapshot = expected as Record<string, unknown>;
  if (["title", "city", "estimated_cost"].some((key) => snapshot[key] !== null && typeof snapshot[key] !== "string")
    || (snapshot.highlights !== null && (!Array.isArray(snapshot.highlights) || snapshot.highlights.some((item) => typeof item !== "string")))) return json({ error: "Invalid expected snapshot" }, 400);
  if (Object.keys(data).some((key) => !["title", "city", "days", "insights", "highlights", "estimated_cost", "expected"].includes(key))
    || typeof data.title !== "string" || !data.title.trim() || typeof data.city !== "string" || !data.city.trim()
    || !Array.isArray(data.days)
    || !isEditableItineraryPlan(Object.hasOwn(data, "insights") ? { dailyPlans: data.days, insights: data.insights } : data.days)
    || (Object.hasOwn(data, "highlights") && (!Array.isArray(data.highlights) || data.highlights.some((item) => typeof item !== "string")))
    || (Object.hasOwn(data, "estimated_cost") && data.estimated_cost !== null && typeof data.estimated_cost !== "string")) return json({ error: "Invalid itinerary fields" }, 400);
  if (fields.some((key) => !equivalent(snapshot[key], current[key]))) return json({ error: "Itinerary changed" }, 409);
  const activities = mergeItineraryPlanPayload(current.activities, data.days, Array.isArray(data.insights) ? data.insights : []);
  if (!isEditableItineraryPlan(activities)) return json({ error: "Invalid itinerary fields" }, 400);
  // Atomic raw-value CAS after semantic comparison with the CLIENT snapshot.
  // Concurrent raw key-order rewrites may conservatively conflict. ABA is snapshot-based:
  // a value changed and restored before this UPDATE is indistinguishable from no change.
  // Recheck immutable day validity at write time without adding it to the client's CAS fields.
  const saved = await env.DB.prepare(`UPDATE itineraries SET title = ?, city = ?, activities = ?, highlights = ?, estimated_cost = ?
    WHERE id = ? AND ownerId = ? AND title COLLATE BINARY IS ? AND city COLLATE BINARY IS ?
    AND activities COLLATE BINARY IS ? AND highlights COLLATE BINARY IS ? AND estimated_cost COLLATE BINARY IS ?
    AND days BETWEEN 1 AND 9007199254740991 RETURNING *`)
    .bind(data.title, data.city, JSON.stringify(activities), JSON.stringify(data.highlights ?? []),
      data.estimated_cost || null, id, session.ownerId,
      ...fields.map((key) => observed[key])).first<ItineraryRow>();
  if (saved) return json({ success: true, itinerary: itineraryDTO(saved) });
  const exists = await env.DB.prepare("SELECT id FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, session.ownerId).first();
  return json({ error: exists ? "Itinerary changed" : "Not found" }, exists ? 409 : 404);
}
