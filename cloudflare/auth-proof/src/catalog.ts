import { appError } from "./app-error";

function plainText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/&[^;\s]+;/g, " ").replace(/[<>\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || /[\s<>"'\\]/.test(value)) return null;
  if (/^\/pilot\/[a-z0-9-]+\.(jpg|png)$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    if (!url.search) return url.href;
    // These public identifiers are required by the reviewed source and reuse-policy pages.
    if (url.hostname === "archive.visitseoul.net" && url.pathname === "/en/page/copyright"
      && url.search === "?_ID=200100") return url.href;
    const heritageKeys = ["ccimId", "ccbaKdcd", "ccbaAsno", "ccbaCtcd"];
    if (url.hostname === "www.heritage.go.kr" && url.pathname === "/heri/cul/imgHeritage.do"
      && [...url.searchParams.keys()].length === heritageKeys.length
      && heritageKeys.every((key) => url.searchParams.getAll(key).length === 1 && /^\d{1,12}$/.test(url.searchParams.get(key)!))) return url.href;
    return null;
  } catch { return null; }
}

function jsonArray(value: string | null): unknown[] {
  try {
    const parsed: unknown = value === null ? [] : JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

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
  const rows = await env.DB.prepare(`SELECT id, name, description, category, localley_score, photos,
    city, address, latitude, longitude, photo_credits, source_urls
    FROM spots WHERE visible = 1 ORDER BY id LIMIT ? OFFSET ?`).bind(limit + 1, offset).all<{
      id: string; name: string; description: string; category: string;
      localley_score: number | null; photos: string | null;
      city: string | null; address: string | null; latitude: number | null; longitude: number | null;
      photo_credits: string | null; source_urls: string | null;
    }>();
  return Response.json({
    spots: rows.results.slice(0, limit).map((row) => ({
      id: row.id, name: JSON.parse(row.name) as unknown, description: JSON.parse(row.description) as unknown,
      category: row.category, localley_score: row.localley_score,
      photos: row.photos === null ? null : JSON.parse(row.photos) as unknown,
      city: row.city === null ? null : plainText(row.city),
      address: row.address === null ? null : plainText(row.address),
      latitude: row.latitude, longitude: row.longitude,
      photoCredits: jsonArray(row.photo_credits).flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const credit = value as Record<string, unknown>;
        const url = safeUrl(credit.url), licenseUrl = safeUrl(credit.licenseUrl), sourceUrl = safeUrl(credit.sourceUrl);
        const author = plainText(credit.author), license = plainText(credit.license);
        return url && licenseUrl?.startsWith("https:") && sourceUrl?.startsWith("https:") && author && license
          ? [{ url, author, license, licenseUrl, sourceUrl }] : [];
      }),
      sourceUrls: jsonArray(row.source_urls).flatMap((value) => {
        const url = safeUrl(value);
        return url?.startsWith("https:") ? [url] : [];
      }),
    })),
    nextOffset: rows.results.length > limit ? offset + limit : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
