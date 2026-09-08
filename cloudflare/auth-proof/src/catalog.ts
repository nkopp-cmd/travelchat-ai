import { appError } from "./app-error";

export async function catalog(url: URL, env: Env) {
  const params = url.searchParams;
  if ([...params.keys()].some((key) => key !== "limit" && key !== "offset")
    || params.getAll("limit").length > 1 || params.getAll("offset").length > 1) {
    return appError("validation_error", "Only limit and offset accepted", 400);
  }
  const limitText = params.get("limit") ?? "24";
  const offsetText = params.get("offset") ?? "0";
  const limit = Number(limitText);
  const offset = Number(offsetText);
  if (!/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText)
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    return appError("validation_error", "Limit must be 1 to 100; offset must be 0 to 10000", 400);
  }
  const rows = await env.DB.prepare(`SELECT id, name, description, category, localley_score, photos
    FROM spots WHERE visible = 1 ORDER BY id LIMIT ? OFFSET ?`).bind(limit + 1, offset).all<{
      id: string; name: string; description: string; category: string;
      localley_score: number | null; photos: string | null;
    }>();
  return Response.json({
    spots: rows.results.slice(0, limit).map((row) => ({
      id: row.id, name: JSON.parse(row.name) as unknown, description: JSON.parse(row.description) as unknown,
      category: row.category, localley_score: row.localley_score,
      photos: row.photos === null ? null : JSON.parse(row.photos) as unknown,
    })),
    nextOffset: rows.results.length > limit ? offset + limit : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
