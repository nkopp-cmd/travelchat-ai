/**
 * Only the canonical host may be indexed. Every other host that reaches this Worker
 * (next.localley.io, *.workers.dev previews, the apex before its redirect) gets
 * `X-Robots-Tag: noindex` so Google does not index a duplicate copy of the site.
 */
export const CANONICAL_HOST = "www.localley.io";

export function withHostRobots(request: Request, response: Response): Response {
  if (new URL(request.url).hostname === CANONICAL_HOST) return response;
  const tagged = new Response(response.body, response);
  tagged.headers.set("X-Robots-Tag", "noindex");
  return tagged;
}
