import type { TrustedAppSession } from "./app-session";
import { lunaReply } from "./luna";
import { reserveAIRequest, settleAIRequest } from "./ai-requests";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function placeName(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const english = record.en;
      if (typeof english === "string" && english.trim()) return english.trim();
      const first = Object.values(record).find((value): value is string => typeof value === "string" && !!value.trim());
      return first ? first.trim() : null;
    }
  } catch { /* Catalog names are JSON objects. */ }
  return null;
}

function placeText(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const english = record.en;
      if (typeof english === "string") return english;
      const first = Object.values(record).find((value): value is string => typeof value === "string");
      return first ?? "";
    }
  } catch { /* Descriptions are JSON objects. */ }
  return typeof raw === "string" ? raw : "";
}

export async function catalogChat(request: Request, env: Env, session: TrustedAppSession, data: Record<string, unknown>): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (url.search) return json({ error: "Unexpected query" }, 400);
  if (Object.keys(data).some((key) => key !== "message") || typeof data.message !== "string" || !data.message.trim() || data.message.length > 2000) {
    return json({ error: "Invalid chat fields" }, 400);
  }
  const query = data.message.trim().toLowerCase();
  const rows = (await env.DB.prepare("SELECT id, name, description, city, address, category FROM spots WHERE visible = 1 ORDER BY id LIMIT 24")
    .all<{ id: string; name: string; description: string; city: string | null; address: string | null; category: string }>()).results;
  const places = rows.flatMap((row) => {
    const name = placeName(row.name);
    if (!name) return [];
    const haystack = [name, placeText(row.description), row.city ?? "", row.address ?? "", row.category].join(" ").toLowerCase();
    return haystack.includes(query) || query.split(/\s+/).some((token) => token.length > 2 && haystack.includes(token))
      ? [{ id: row.id, name, city: row.city, category: row.category, address: row.address }]
      : [];
  }).slice(0, 3);
  const catalogPlaces = places.length ? places : rows.flatMap((row) => {
    const name = placeName(row.name);
    return name ? [{ id: row.id, name, city: row.city, category: row.category, address: row.address }] : [];
  }).slice(0, 8);
  const lines = catalogPlaces.map((place) => {
    const bits = [place.name, place.category, place.city, place.address].filter((value): value is string => !!value && !!value.trim());
    return bits.join(" · ");
  });
  const catalogReply = places.length
    ? `From the published catalog: ${lines.join(" ")} Check each public source before you visit.`
    : catalogPlaces.length
      ? `No catalog match for that question. Published places here: ${catalogPlaces.map((place) => place.name).join(", ")}.`
      : "No catalog places are published yet.";
  const key = "OPENAI_API_KEY" in env && typeof (env as { OPENAI_API_KEY?: unknown }).OPENAI_API_KEY === "string"
    ? (env as { OPENAI_API_KEY: string }).OPENAI_API_KEY.trim()
    : "";
  const model = "OPENAI_CHAT_MODEL" in env && typeof (env as { OPENAI_CHAT_MODEL?: unknown }).OPENAI_CHAT_MODEL === "string"
    && (env as { OPENAI_CHAT_MODEL: string }).OPENAI_CHAT_MODEL.trim()
    ? (env as { OPENAI_CHAT_MODEL: string }).OPENAI_CHAT_MODEL.trim()
    : "gpt-5.6-luna";
  let reply = catalogReply;
  let replyModel = "catalog";
  let aiStatus = "not_configured";
  if (key && catalogPlaces.length) {
    try {
      const reservation = await reserveAIRequest(env.DB, session.ownerId);
      if (!reservation) aiStatus = "daily_limit";
      else {
        const generated = await lunaReply(key, model, data.message.trim(), lines.join("\n"));
        if (generated) {
          reply = generated;
          replyModel = model;
        }
        aiStatus = generated ? "completed" : "unavailable";
        await settleAIRequest(env.DB, reservation, session.ownerId, generated !== null);
      }
    } catch { aiStatus = "accounting_unavailable"; /* A reserved slot stays charged if settlement fails. */ }
  }
  return json({
    reply,
    places: places.map((place) => ({ id: place.id, name: place.name })),
    model: replyModel,
    aiStatus,
  });
}
