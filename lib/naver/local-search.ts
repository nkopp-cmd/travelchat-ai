import "server-only";

/** Visitor-triggered references. Never marks a production place as verified. */
interface Statement {
  bind(...params: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface ReferenceDatabase {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface LocalReference {
  name: string;
  address: string;
  roadAddress: string;
  category: string;
  sourceUrl: string;
}
interface CacheRow { status: "pending" | "ok" | "error"; payload: string | null; expires_at: number }
export interface LocalSearchResult {
  query: string;
  items: LocalReference[];
  referenceOnly: true;
  source: "Naver local search";
  checkedAt: string;
}
export class ReferenceUnavailable extends Error {
  constructor(public reason: "unavailable" | "daily_limit" | "invalid_query") { super(reason); }
}
const TTL = 7 * 86400;
const cities: Record<string, string> = { seoul: "서울", busan: "부산", jeju: "제주", gyeongju: "경주" };
export function localQuery(city: string, name: string): string {
  const slug = city.toLowerCase();
  const prefix = Object.hasOwn(cities, slug) ? cities[slug] : undefined;
  if (name.length > 400) throw new ReferenceUnavailable("invalid_query");
  const normalized = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!prefix || normalized.length < 2 || normalized.length > 100 || /[\u0000-\u001f\u007f<>]/.test(normalized)) {
    throw new ReferenceUnavailable("invalid_query");
  }
  return `${prefix} ${normalized}`.toLowerCase();
}
function clean(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max * 4) throw new Error("invalid_reference");
  return value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, max).trim();
}
function normalizeItems(raw: unknown, query: string): LocalReference[] {
  if (!raw || typeof raw !== "object" || !("items" in raw) || !Array.isArray(raw.items) || raw.items.length > 5) {
    throw new Error("invalid_reference_response");
  }
  return raw.items.map((item: Record<string, unknown>) => {
    if (!item || typeof item !== "object") throw new Error("invalid_reference");
    const name = clean(item.title, 200), address = clean(item.address ?? "", 300);
    const roadAddress = clean(item.roadAddress ?? "", 300);
    if (!name || (!address && !roadAddress)) throw new Error("invalid_reference");
    let sourceUrl = `https://map.naver.com/p/search/${encodeURIComponent(`${query} ${name}`)}`;
    try {
      const url = new URL(typeof item.link === "string" ? item.link : "");
      if (url.protocol === "https:" && !url.username && !url.password) sourceUrl = url.href;
    } catch { /* Naver can return an empty business URL; link to its named map search. */ }
    return { name, address, roadAddress, category: clean(item.category ?? "", 150), sourceUrl };
  });
}
async function boundedBody(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("missing_reference_response");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65536) throw new Error("reference_response_too_large");
      chunks.push(value);
    }
    const joined = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(joined));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function cached(row: CacheRow, query: string): LocalSearchResult {
  if (row.status !== "ok" || !row.payload || row.payload.length > 65536) throw new ReferenceUnavailable("unavailable");
  const result = JSON.parse(row.payload) as LocalSearchResult;
  if (result.query !== query || result.referenceOnly !== true || !Array.isArray(result.items) || result.items.length > 5) {
    throw new ReferenceUnavailable("unavailable");
  }
  return result;
}
export async function searchLocalReferences(options: {
  db: ReferenceDatabase; keyId: string; key: string; city: string; name: string;
  now?: number; request?: typeof fetch;
}): Promise<LocalSearchResult & { cacheHit: boolean }> {
  const query = localQuery(options.city, options.name);
  if (!options.db || !options.keyId || !options.key) throw new ReferenceUnavailable("unavailable");
  const now = Math.floor((options.now ?? Date.now()) / 1000), day = new Date(now * 1000).toISOString().slice(0, 10);
  const row = await options.db.prepare("SELECT status,payload,expires_at FROM naver_local_cache WHERE query=? AND expires_at>?")
    .bind(query, now).first<CacheRow>();
  if (row) return { ...cached(row, query), cacheHit: true };
  const token = crypto.randomUUID();
  // D1 batch executes as one transaction. One claim and budget reservation admit one call.
  await options.db.batch([
    options.db.prepare("DELETE FROM naver_local_cache WHERE query IN (SELECT query FROM naver_local_cache WHERE expires_at<=? LIMIT 50)").bind(now),
    options.db.prepare("DELETE FROM naver_daily_budget WHERE day<?").bind(new Date((now - 32 * 86400) * 1000).toISOString().slice(0, 10)),
    options.db.prepare(`INSERT INTO naver_local_cache(query,token,expires_at,status,payload)
      SELECT ?,?,?,'pending',NULL WHERE COALESCE((SELECT calls FROM naver_daily_budget WHERE day=?),0)<2000
      ON CONFLICT(query) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at,status='pending',payload=NULL
      WHERE naver_local_cache.expires_at<=?`).bind(query, token, now + TTL, day, now),
    options.db.prepare(`INSERT INTO naver_daily_budget(day,calls)
      SELECT ?,1 WHERE EXISTS(SELECT 1 FROM naver_local_cache WHERE query=? AND token=?)
      ON CONFLICT(day) DO UPDATE SET calls=calls+1 WHERE calls<2000`).bind(day, query, token),
  ]);
  const claim = await options.db.prepare("SELECT token,status,payload,expires_at FROM naver_local_cache WHERE query=?")
    .bind(query).first<CacheRow & { token: string }>();
  if (!claim || claim.token !== token) {
    if (claim && claim.expires_at > now) return { ...cached(claim, query), cacheHit: true };
    throw new ReferenceUnavailable("daily_limit");
  }
  try {
    const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
    url.search = new URLSearchParams({ query, display: "5", start: "1", sort: "random", format: "json" }).toString();
    const response = await (options.request ?? fetch)(url, {
      headers: { "X-NCP-APIGW-API-KEY-ID": options.keyId, "X-NCP-APIGW-API-KEY": options.key },
      signal: AbortSignal.timeout(10000), redirect: "error",
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("reference_provider_unavailable"); }
    const result: LocalSearchResult = { query, items: normalizeItems(await boundedBody(response), query),
      referenceOnly: true, source: "Naver local search", checkedAt: new Date(now * 1000).toISOString() };
    await options.db.prepare("UPDATE naver_local_cache SET status='ok',payload=? WHERE query=? AND token=?")
      .bind(JSON.stringify(result), query, token).run();
    return { ...result, cacheHit: false };
  } catch {
    // Keep pending/error holds after unknown outcomes. Never repeat a possibly billed request.
    await options.db.prepare("UPDATE naver_local_cache SET status='error',payload=NULL WHERE query=? AND token=?")
      .bind(query, token).run().catch(() => {});
    throw new ReferenceUnavailable("unavailable");
  }
}
export function referenceRuntime(): { db: ReferenceDatabase; keyId: string; key: string } {
  const context = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[Symbol.for("__cloudflare-context__")];
  const env = context?.env;
  const db = env?.NAVER_REFERENCE_DB as ReferenceDatabase | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") throw new ReferenceUnavailable("unavailable");
  return { db, keyId: String(env?.NCP_APIHUB_KEY_ID ?? process.env.NCP_APIHUB_KEY_ID ?? ""),
    key: String(env?.NCP_APIHUB_KEY ?? process.env.NCP_APIHUB_KEY ?? "") };
}
