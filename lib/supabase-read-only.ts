/**
 * Optional read-only guard for Supabase clients.
 *
 * When SUPABASE_READ_ONLY=true (set only on non-production Cloudflare preview
 * Workers that point at production Supabase with the public anon key), every
 * non-GET/HEAD request is refused before it leaves the runtime. This includes
 * PostgREST writes, RPC calls and Storage uploads/deletes.
 */
type SupabaseFetch = typeof fetch;

export const SUPABASE_READ_ONLY_ERROR = "Supabase writes are disabled in this read-only preview";

export function isSupabaseReadOnly(): boolean {
  return process.env.SUPABASE_READ_ONLY === "true";
}

export const readOnlyFetch: SupabaseFetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return fetch(input, init);
  }
  return new Response(
    JSON.stringify({ message: SUPABASE_READ_ONLY_ERROR, code: "READ_ONLY_PREVIEW" }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
};

export function withReadOnlyGuard<T extends { global?: Record<string, unknown> }>(options: T): T {
  if (!isSupabaseReadOnly()) return options;
  return { ...options, global: { ...(options.global ?? {}), fetch: readOnlyFetch } };
}
