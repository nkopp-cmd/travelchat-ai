import "server-only";
import { authMailMode, createMailSender, renderStoryReadyMail, sendCloudflareMail,
  type AuthEmailBinding, type OutboxDatabase } from "@/lib/auth/mail";

/** Only an explicit owned story action reaches this transactional transport. */
export async function sendStoryReadyEmail(to: string, url: string) {
  const context = (globalThis as Record<symbol, {
    env?: { AUTH_DB?: OutboxDatabase; AUTH_EMAIL?: AuthEmailBinding }
  } | undefined>)[Symbol.for("__cloudflare-context__")];
  const mail = { kind: "story-ready" as const, to, url };
  if (authMailMode() === "outbox") {
    await createMailSender(context?.env?.AUTH_DB)(mail);
    return { sent: false, queued: true, reason: "preview_outbox" } as const;
  }
  const { messageId } = await sendCloudflareMail(context?.env?.AUTH_EMAIL,
    { to, url, ...renderStoryReadyMail(mail) });
  return { sent: true, emailId: messageId } as const;
}
