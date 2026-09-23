/**
 * Auth email delivery.
 *
 * AUTH_MAIL_MODE=outbox (preview Worker, local dev, tests): links are stored in the
 * D1 table auth_mail_outbox and never sent. Agents read them through
 * /api/test-auth/outbox (see docs/AUTH_BETTER_AUTH.md).
 * Any other value: send through Resend with RESEND_API_KEY and FROM_EMAIL.
 */
import type { AuthMail } from "./config";

export interface OutboxDatabase {
  prepare(query: string): { bind(...values: unknown[]): { run(): Promise<unknown> | unknown } };
}

const SUBJECTS: Record<AuthMail["kind"], string> = {
  "verify-email": "Confirm your email for Localley",
  "reset-password": "Set your Localley password",
  "magic-link": "Your Localley sign-in link",
};

const ACTIONS: Record<AuthMail["kind"], string> = {
  "verify-email": "Confirm email",
  "reset-password": "Set password",
  "magic-link": "Sign in",
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderAuthMail(mail: AuthMail): { subject: string; html: string; text: string } {
  const subject = SUBJECTS[mail.kind];
  const action = ACTIONS[mail.kind];
  const greeting = mail.name ? `Hi ${escapeHtml(mail.name)},` : "Hi,";
  const note = mail.kind === "magic-link"
    ? "This link works once and expires in 15 minutes."
    : mail.kind === "reset-password"
      ? "This link expires in 1 hour. If you did not ask for it, ignore this email."
      : "This link expires in 24 hours.";
  const url = escapeHtml(mail.url);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1f2937;max-width:520px;margin:0 auto;padding:24px">
<p>${greeting}</p><p>Use the button below for your Localley account.</p>
<p><a href="${url}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${action}</a></p>
<p style="font-size:13px;color:#6b7280">${note}</p>
<p style="font-size:12px;color:#9ca3af;word-break:break-all">${url}</p></body></html>`;
  const text = `${mail.name ? `Hi ${mail.name},` : "Hi,"}\n\n${action}: ${mail.url}\n\n${note}\n`;
  return { subject, html, text };
}

/** Reserved domain for agent test users; only these outbox entries are readable. */
export const TEST_EMAIL_DOMAIN = "preview.localley.test";

export function authMailMode(): "outbox" | "resend" {
  return process.env.AUTH_MAIL_MODE === "outbox" ? "outbox" : "resend";
}

export function createMailSender(database: OutboxDatabase | undefined) {
  return async (mail: AuthMail) => {
    if (authMailMode() === "outbox") {
      if (!database) throw new Error("Auth outbox database is not configured");
      await database
        .prepare('insert into "auth_mail_outbox" ("kind", "email", "url", "createdAt") values (?, ?, ?, ?)')
        .bind(mail.kind, mail.to.toLowerCase(), mail.url, Date.now())
        .run();
      return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set; auth email cannot be sent");
    const { subject, html, text } = renderAuthMail(mail);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || "Localley <onboarding@resend.dev>",
        to: [mail.to],
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend rejected the auth email (status ${response.status})`);
    }
  };
}
