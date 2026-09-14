import type { TrustedAppSession } from "./app-session";

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

export async function catalogChat(request: Request, env: Env, _session: TrustedAppSession, data: Record<string, unknown>): Promise<Response> {
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
  if (!places.length) {
    const available = rows.flatMap((row) => {
      const name = placeName(row.name);
      return name ? [name] : [];
    }).slice(0, 8);
    return json({
      reply: available.length
        ? `No catalog match for that question. Published places here: ${available.join(", ")}.`
        : "No catalog places are published yet.",
      places: [],
    });
  }
  const lines = places.map((place) => {
    const bits = [place.name, place.category, place.city, place.address].filter((value): value is string => !!value && !!value.trim());
    return bits.join(" · ");
  });
  return json({
    reply: `From the published catalog: ${lines.join(" ")} Check each public source before you visit.`,
    places: places.map((place) => ({ id: place.id, name: place.name })),
  });
}
