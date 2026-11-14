// Pure helpers for the newsletter list send (scripts/newsletter/send-issue.tsx --list).
import { appendFileSync, existsSync, readFileSync } from "node:fs";

export type SubscriberRow = {
  email?: unknown;
  status?: unknown;
  unsubscribe_token?: unknown;
  unsubscribed_at?: unknown;
};
export type Recipient = { email: string; token: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[0-9a-f]{64}$/;

/** Only confirmed, never-unsubscribed rows with a valid token; one entry per address (case-insensitive). */
export function recipientsFrom(rows: SubscriberRow[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const row of rows) {
    if (row.status !== "confirmed" || row.unsubscribed_at != null) continue;
    if (typeof row.email !== "string" || typeof row.unsubscribe_token !== "string") continue;
    const email = row.email.trim();
    if (!EMAIL.test(email) || !TOKEN.test(row.unsubscribe_token)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email, token: row.unsubscribe_token });
  }
  return out;
}

/** Accepts both a plain row array and the `wrangler d1 execute --json` shape ([{ results: [...] }]). */
export function parseSubscriberExport(json: string): SubscriberRow[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error("subscriber export must be a JSON array");
  if (data.length > 0 && typeof data[0] === "object" && data[0] !== null && "results" in data[0]) {
    return data.flatMap((part) => ((part as { results?: SubscriberRow[] }).results ?? []));
  }
  return data as SubscriberRow[];
}

/** The list send needs the exact Telegram approval tag that the issue file names. */
export function assertApproval(expected: string | undefined, given: string | undefined) {
  if (!expected) throw new Error("this issue has no approval tag; list send is not allowed");
  if (given !== expected) throw new Error(`list send needs --approval ${expected} (Nils' Telegram ok)`);
}

/** Resume-safe ledger: one sent address per line, written right after each successful send. */
export function readLedger(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, "utf8").split("\n").map((line) => line.trim().toLowerCase()).filter(Boolean));
}
export function recordSent(file: string, email: string) {
  appendFileSync(file, `${email.toLowerCase()}\n`);
}
export function pending(recipients: Recipient[], sent: Set<string>): Recipient[] {
  return recipients.filter((r) => !sent.has(r.email.toLowerCase()));
}
