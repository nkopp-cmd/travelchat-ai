import "server-only";

/** Optional binding for an admitted page's asynchronous requests. Existing candidate callers remain compatible. */
export function matchesPreviewActor(request: { headers: Headers }, userId: string): boolean {
  const expected = request.headers.get("X-Localley-Preview-Actor");
  return expected === null || expected === userId;
}
