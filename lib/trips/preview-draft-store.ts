import "server-only";
import { checkGeneratedPreview, parseGeneratedPreview, type GeneratedPreview } from "./generated-preview";

/**
 * Server copy of the anonymous/free trip preview (shared/plans/localley-preview-server-draft.md).
 * KV `PREVIEW_DRAFTS`, 24 h TTL, keyed by the random draft id in the HttpOnly cookie `lly_draft`. The preview page
 * renders the trip in its server HTML when the cookie names a live draft. No binding, no cookie or a miss -> the page
 * falls back to the browser copy, as before. The id is a v4 UUID only this browser holds; the draft has no personal data.
 */
export const DRAFT_COOKIE = "lly_draft";
export const DRAFT_TTL_SECONDS = 86_400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const key = (id: string) => `draft:${id}`;

export interface DraftKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const contextSymbol = Symbol.for("__cloudflare-context__");
export function previewDraftKv(): DraftKv | null {
  const kv = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[contextSymbol]?.env?.PREVIEW_DRAFTS;
  return kv && typeof kv === "object" && "get" in kv && "put" in kv && typeof kv.put === "function" ? (kv as DraftKv) : null;
}

export const isDraftId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export const draftCookieOptions = (maxAge = DRAFT_TTL_SECONDS) => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge,
});

/** -> the checked preview (also when KV is missing or fails: the browser copy still works), or null for a bad plan. */
export async function keepServerDraft(itinerary: unknown, kv: DraftKv | null = previewDraftKv(), now = Date.now()): Promise<GeneratedPreview | null> {
  const preview = checkGeneratedPreview({ version: 1, id: crypto.randomUUID(), createdAt: now, itinerary });
  if (!preview) return null;
  if (kv) {
    try { await kv.put(key(preview.id), JSON.stringify(preview), { expirationTtl: DRAFT_TTL_SECONDS }); }
    catch { console.error("[preview-draft] KV write failed"); }
  }
  return preview;
}

export async function readServerDraft(id: unknown, kv: DraftKv | null = previewDraftKv(), now = Date.now()): Promise<GeneratedPreview | null> {
  if (!kv || !isDraftId(id)) return null;
  try {
    const preview = parseGeneratedPreview(await kv.get(key(id)), now);
    return preview?.id === id ? preview : null;
  } catch { return null; }
}

export async function dropServerDraft(id: unknown, kv: DraftKv | null = previewDraftKv()): Promise<void> {
  if (!kv || !isDraftId(id)) return;
  try { await kv.delete(key(id)); } catch { /* the TTL removes it */ }
}
