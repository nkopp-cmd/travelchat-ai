/**
 * Auth email delivery.
 *
 * AUTH_MAIL_MODE=outbox (preview Worker, local dev, tests): links are stored in the
 * D1 table auth_mail_outbox and never sent. Agents read them through
 * /api/test-auth/outbox (see docs/AUTH_BETTER_AUTH.md).
 * Production sends through the Cloudflare AUTH_EMAIL binding.
 */
import type { AuthMail } from "./config";

export interface OutboxDatabase {
  prepare(query: string): { bind(...values: unknown[]): { run(): Promise<unknown> | unknown } };
}

/** The send_email binding's structured message API, kept local to the auth adapter. */
export interface AuthEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name: string };
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId: string }>;
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

const INTRODUCTIONS: Record<AuthMail["kind"], string> = {
  "verify-email": "Confirm your email address for your Localley account.",
  "reset-password": "You asked to set a password for your Localley account.",
  "magic-link": "You asked for a link to sign in to Localley.",
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderAuthMail(mail: AuthMail): { subject: string; html: string; text: string } {
  const subject = SUBJECTS[mail.kind];
  const action = ACTIONS[mail.kind];
  const greeting = mail.name ? `Hi ${escapeHtml(mail.name)},` : "Hi,";
  const note = mail.kind === "magic-link"
    ? "This link works once and expires in 15 minutes. If you did not ask for it, ignore this email."
    : mail.kind === "reset-password"
      ? "This link expires in 1 hour. If you did not ask for it, ignore this email."
      : "This link expires in 24 hours. If you did not ask for it, ignore this email.";
  const introduction = INTRODUCTIONS[mail.kind];
  const url = escapeHtml(mail.url);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1f2937;max-width:520px;margin:0 auto;padding:24px">
<p>${greeting}</p><p>${introduction}</p>
<p><a href="${url}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${action}</a></p>
<p style="font-size:13px;color:#6b7280">${note}</p>
<p style="font-size:12px;color:#9ca3af;word-break:break-all">${url}</p></body></html>`;
  const text = `${mail.name ? `Hi ${mail.name},` : "Hi,"}\n\n${introduction}\n\n${action}: ${mail.url}\n\n${note}\n`;
  return { subject, html, text };
}

/** Reserved domain for agent test users; only these outbox entries are readable. */
export const TEST_EMAIL_DOMAIN = "preview.localley.test";

/** True for localley.io and its subdomains (production, staging). */
export function isProductionAuthHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)localley\.io$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Auth links sent from hello@localley.io must resolve on a Localley HTTPS host. */
export function isLocalleyAuthLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === ""
      && parsed.port === "" && isProductionAuthHost(url);
  } catch {
    return false;
  }
}

/**
 * "outbox" only when explicitly configured AND the auth base URL is not a production
 * host. A stray AUTH_MAIL_MODE=outbox on production therefore still sends real mail
 * and never exposes links through /api/test-auth/outbox.
 */
export function authMailMode(): "outbox" | "cloudflare" {
  if (process.env.AUTH_MAIL_MODE !== "outbox") return "cloudflare";
  if (isProductionAuthHost(process.env.BETTER_AUTH_URL)) {
    console.error("[auth] AUTH_MAIL_MODE=outbox ignored on a production host");
    return "cloudflare";
  }
  return "outbox";
}

export function createMailSender(database: OutboxDatabase | undefined, emailBinding?: AuthEmailBinding) {
  return async (mail: AuthMail) => {
    if (authMailMode() === "outbox") {
      if (!database) throw new Error("Auth outbox database is not configured");
      await database
        .prepare('insert into "auth_mail_outbox" ("kind", "email", "url", "createdAt") values (?, ?, ?, ?)')
        .bind(mail.kind, mail.to.toLowerCase(), mail.url, Date.now())
        .run();
      return;
    }
    if (!emailBinding) throw new Error("AUTH_EMAIL binding is not configured");
    if (process.env.FROM_EMAIL !== "Localley <hello@localley.io>" && process.env.FROM_EMAIL !== "hello@localley.io") {
      throw new Error("FROM_EMAIL must use hello@localley.io");
    }
    if (!isLocalleyAuthLink(mail.url)) throw new Error("Auth email link must use HTTPS on localley.io");
    const { subject, html, text } = renderAuthMail(mail);
    try {
      await emailBinding.send({
        from: { email: "hello@localley.io", name: "Localley" },
        to: mail.to,
        subject,
        html,
        text,
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
      // Cloudflare enforces account and sender-domain suppression lists. Never retry
      // a suppressed recipient or reveal the email or token in a log or response.
      console.error("[auth] Cloudflare email send failed:", /^E_[A-Z_]+$/.test(code) ? code : "unknown");
      throw new Error("Auth email could not be sent");
    }
  };
}
