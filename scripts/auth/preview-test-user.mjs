#!/usr/bin/env node
/**
 * Create a verified test user on the PREVIEW Worker and print a session cookie.
 *
 *   node scripts/auth/preview-test-user.mjs [--base https://localley-next-preview.nkopp.workers.dev] [--name bot]
 *
 * Output (JSON): { email, password, userId, cookie }. Use the cookie with curl:
 *   curl -H "cookie: <cookie>" https://localley-next-preview.nkopp.workers.dev/api/user/tier
 *
 * Works only where AUTH_MAIL_MODE=outbox (preview / local). Test users must use the
 * reserved domain @preview.localley.test. Agents may create as many as they need;
 * the preview auth store (D1 localley-auth-preview) holds no production data.
 */
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt("base", "https://localley-next-preview.nkopp.workers.dev").replace(/\/$/, "");
if (/(^|\.)localley\.io$/.test(new URL(base).hostname)) {
  console.error("refusing: production host");
  process.exit(1);
}
const email = `${opt("name", "agent")}-${Date.now()}@preview.localley.test`;
const password = `Agent-${crypto.randomUUID()}`;
const headers = { "content-type": "application/json", origin: base };
const cookiesOf = (r) => r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");

const signUp = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers, body: JSON.stringify({ email, password, name: "Agent Test" }) });
if (!signUp.ok) { console.error(`sign-up failed: ${signUp.status} ${await signUp.text()}`); process.exit(1); }
let link;
for (let i = 0; i < 10 && !link; i++) {
  const r = await fetch(`${base}/api/test-auth/outbox?email=${encodeURIComponent(email)}`);
  if (r.status === 404) { console.error("target has no test outbox"); process.exit(1); }
  link = (await r.json()).messages.find((m) => m.kind === "verify-email")?.url;
  if (!link) await new Promise((res) => setTimeout(res, 500));
}
if (!link) { console.error("no verification mail"); process.exit(1); }
const verified = await fetch(link, { redirect: "manual" });
const cookie = cookiesOf(verified);
const session = await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie } })).json();
console.log(JSON.stringify({ email, password, userId: session?.user?.id ?? null, cookie }, null, 2));
