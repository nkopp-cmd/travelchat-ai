/**
 * Localley newsletter list (shared/plans/localley-newsletter.md, APPROVALS.md 2026-11-14).
 *
 * Double opt-in in the application D1 table `newsletter_subscribers` (migrations/app-preview/0051):
 * - subscribe: one atomic upsert. A confirmed address never changes; a pending address gets a new link only after
 *   the old one expired (one mail per address per 24 h). Every caller sees the same answer (no enumeration).
 * - confirm: the raw token travels only in the mail; the table holds its SHA-256.
 * - unsubscribe: a random 64-hex token per row, no shared secret. Idempotent.
 */

export interface NewsletterStatement {
  bind(...values: unknown[]): NewsletterStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface NewsletterDb {
  prepare(query: string): NewsletterStatement;
}

export const CONFIRM_TTL_SECONDS = 24 * 60 * 60;
export const CONSENT_TEXT =
  "Localley newsletter v1: Asia travel picks and local guidance by email, about twice a month. Unsubscribe any time.";
export const OWNER_DEFAULT_EMAILS = ["nkopp@my-goodlife.com"] as const;

const TOKEN = /^[0-9a-f]{64}$/;
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const SOURCE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CITY = /^[a-z][a-z-]{0,39}$/;

const contextSymbol = Symbol.for("__cloudflare-context__");

/** Production binds APP_DB; the preview Worker binds APP_DATA_PREVIEW_DB. */
export function newsletterDb(): NewsletterDb | null {
  const env = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[contextSymbol]?.env;
  const db = env?.APP_DB ?? env?.APP_DATA_PREVIEW_DB;
  return db && typeof db === "object" && "prepare" in db && typeof db.prepare === "function" ? (db as NewsletterDb) : null;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length >= 3 && email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function cleanSource(raw: unknown): string {
  return typeof raw === "string" && SOURCE.test(raw) ? raw : "site";
}

export function cleanCity(raw: unknown): string | null {
  return typeof raw === "string" && CITY.test(raw) ? raw : null;
}

export function isToken(raw: unknown): raw is string {
  return typeof raw === "string" && TOKEN.test(raw);
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export type SubscribeResult = { send: true; email: string; confirmToken: string } | { send: false };

/**
 * New, expired-pending or unsubscribed rows (re)enter pending with a fresh link. Confirmed rows and pending rows with
 * a live link stay as they are, so a repeat request sends nothing.
 */
export async function subscribe(db: NewsletterDb, input: { email: string; source?: string; city?: string | null },
  now = nowSeconds()): Promise<SubscribeResult> {
  const confirmToken = randomToken();
  const row = await db.prepare(
    `INSERT INTO newsletter_subscribers
       (id, email, status, confirm_hash, confirm_expires, unsubscribe_token, source, city, consent_text, created_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       status = 'pending', confirm_hash = excluded.confirm_hash, confirm_expires = excluded.confirm_expires,
       source = excluded.source, city = excluded.city, consent_text = excluded.consent_text, unsubscribed_at = NULL
     WHERE newsletter_subscribers.status = 'unsubscribed'
        OR (newsletter_subscribers.status = 'pending' AND coalesce(newsletter_subscribers.confirm_expires, 0) <= ?)
     RETURNING email`,
  ).bind(crypto.randomUUID(), input.email, await sha256Hex(confirmToken), now + CONFIRM_TTL_SECONDS, randomToken(),
    cleanSource(input.source), cleanCity(input.city ?? null), CONSENT_TEXT, now, now).first<{ email: string }>();
  return row ? { send: true, email: row.email, confirmToken } : { send: false };
}

export async function confirm(db: NewsletterDb, token: unknown, now = nowSeconds()): Promise<boolean> {
  if (!isToken(token)) return false;
  const row = await db.prepare(
    `UPDATE newsletter_subscribers
     SET status = 'confirmed', confirmed_at = ?, confirm_hash = NULL, confirm_expires = NULL
     WHERE confirm_hash = ? AND status = 'pending' AND confirm_expires > ?
     RETURNING id`,
  ).bind(now, await sha256Hex(token), now).first<{ id: string }>();
  return Boolean(row);
}

/** True when the token names a row (already unsubscribed counts). Unknown tokens return false. */
export async function unsubscribe(db: NewsletterDb, token: unknown, now = nowSeconds()): Promise<boolean> {
  if (!isToken(token)) return false;
  const row = await db.prepare(
    `UPDATE newsletter_subscribers
     SET status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, ?), confirm_hash = NULL, confirm_expires = NULL
     WHERE unsubscribe_token = ?
     RETURNING id`,
  ).bind(now, token).first<{ id: string }>();
  return Boolean(row);
}

/** A failed confirmation send must not lock the address out for 24 h: expire the link so a retry can send again. */
export async function releaseConfirm(db: NewsletterDb, email: string): Promise<void> {
  await db.prepare(
    `UPDATE newsletter_subscribers SET confirm_expires = 0 WHERE email = ? AND status = 'pending'`,
  ).bind(email).run();
}
