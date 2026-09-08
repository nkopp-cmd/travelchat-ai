export function appError(code: string, message: string, status: number, details?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}) } },
    { status, headers: { "Cache-Control": "no-store" } });
}
