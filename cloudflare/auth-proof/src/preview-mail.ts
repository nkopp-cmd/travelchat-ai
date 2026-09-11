import { allowedEmail, PREVIEW_ORIGIN } from "./runtime";
import type { AccessIdentity } from "./access";

export async function sendPreviewMail(env: PreviewEnv, identity: AccessIdentity | undefined,
  purpose: string, userId: string, email: string, url: string) {
  if (identity?.kind !== "human" || allowedEmail(env, email) !== identity.email
    || !["verify", "reset"].includes(purpose) || !userId || userId.length > 128
    || url.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(url)) throw new Error("Preview mail forbidden");
  const link = new URL(url);
  if (link.protocol !== "https:" || link.origin !== PREVIEW_ORIGIN || link.username || link.password
    || url.includes("#")) throw new Error("Preview mail forbidden");
  const params = link.searchParams;
  const token = params.get("token");
  if (purpose === "verify"
    ? link.pathname !== "/api/auth/verify-email" || params.getAll("token").length !== 1 || !token?.trim()
      || [...params.keys()].some(key => key !== "token" && key !== "callbackURL")
    : !/^\/api\/auth\/reset-password\/[A-Za-z0-9_-]{1,512}$/.test(link.pathname)
      || params.getAll("callbackURL").length !== 1 || [...params.keys()].some(key => key !== "callbackURL")) {
    throw new Error("Preview mail forbidden");
  }
  if (params.getAll("callbackURL").length > 1) throw new Error("Preview mail forbidden");
  const callback = params.get("callbackURL");
  if (callback !== null) {
    const target = new URL(callback, `${PREVIEW_ORIGIN}/`);
    if (/[\u0000-\u0020\u007f\\]/.test(callback) || callback.startsWith("//") || callback.includes("#")
      || target.protocol !== "https:" || target.origin !== PREVIEW_ORIGIN || target.username || target.password) {
      throw new Error("Preview mail forbidden");
    }
  }
  const htmlURL = url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url))))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID();
  const reserved = await env.DB.prepare(`INSERT INTO preview_mail_jobs (id, urlHash, purpose, userId, state)
    SELECT ?, ?, ?, ?, 'reserved' WHERE (SELECT COUNT(*) FROM preview_mail_jobs WHERE day = strftime('%Y-%m-%d', 'now')) < 5
    ON CONFLICT(urlHash) DO NOTHING`).bind(id, hash, purpose, userId).run();
  if (!reserved.meta.changes) {
    const prior = await env.DB.prepare("SELECT state FROM preview_mail_jobs WHERE urlHash = ? AND userId = ? AND purpose = ?")
      .bind(hash, userId, purpose).first<{ state: string }>();
    if (prior?.state === "accepted") return;
    throw new Error("Preview mail unavailable");
  }
  const sending = await env.DB.prepare("UPDATE preview_mail_jobs SET state = 'sending' WHERE id = ? AND state = 'reserved'").bind(id).run();
  if (sending.meta.changes !== 1) throw new Error("Preview mail unavailable");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      env.NATIVE_EMAIL.send({ from: { email: "auth@localley.io", name: "Localley" }, to: identity.email,
        subject: purpose === "verify" ? "Verify your Localley preview email" : "Reset your Localley preview password",
        text: `Localley restricted preview\n\n${url}\n\nIf you did not request this, ignore this email.`,
        html: `<p>Localley restricted preview</p><p><a href="${htmlURL}">${purpose === "verify" ? "Verify your email" : "Reset your password"}</a></p><p>If you did not request this, ignore this email.</p>` }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Mail timeout")), 10000); }),
    ]);
    if (typeof result?.messageId !== "string" || !result.messageId.trim() || result.messageId.length > 512
      || /[\u0000-\u001f\u007f]/.test(result.messageId)) throw new Error("No acceptance receipt");
    const accepted = await env.DB.prepare("UPDATE preview_mail_jobs SET state = 'accepted', messageId = ? WHERE id = ? AND state = 'sending'")
      .bind(result.messageId, id).run();
    if (accepted.meta.changes !== 1) throw new Error("Acceptance persistence failed");
  } catch {
    await env.DB.prepare("UPDATE preview_mail_jobs SET state = 'unknown' WHERE id = ? AND state = 'sending'").bind(id).run();
    throw new Error("Preview mail unavailable");
  } finally { clearTimeout(timer); }
}
