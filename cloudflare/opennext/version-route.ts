/**
 * /api/version answered in the Worker entry, before the OpenNext handler.
 *
 * The Gravity release lane smokes and perf-checks this URL right after promote. Through Next.js it paid routing,
 * middleware and the route module on partly warm isolates (de11d33 lane: warm TTFB 285 ms, budget 200 ms). The
 * sha comes from the BUILD_SHA Worker var that scripts/release/production.mjs sets at upload, the same value the
 * Next route (app/api/version, kept for local dev) reads. Same body and headers as that route.
 */
export function versionResponse(request: Request, buildSha: string | undefined): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (new URL(request.url).pathname !== "/api/version") return null;
  const body = request.method === "HEAD" ? null : JSON.stringify({ sha: buildSha ?? null });
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
