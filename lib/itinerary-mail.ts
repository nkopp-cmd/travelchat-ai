import "server-only";
import { render } from "@react-email/components";
import { ItineraryEmail } from "@/emails/itinerary-email";
import { authMailMode, createMailSender, sendCloudflareMail,
  type AuthEmailBinding, type OutboxDatabase } from "@/lib/auth/mail";

/** Explicit owned copies only. Preview never calls the external sender. */
export async function sendItineraryEmail(to: string, props: Parameters<typeof ItineraryEmail>[0]) {
  const url = props.shareUrl;
  if (!url) throw new Error("Itinerary email link is required");
  const context = (globalThis as Record<symbol, {
    env?: { AUTH_DB?: OutboxDatabase; AUTH_EMAIL?: AuthEmailBinding }
  } | undefined>)[Symbol.for("__cloudflare-context__")];
  if (authMailMode() === "outbox") {
    await createMailSender(context?.env?.AUTH_DB)({ kind: "itinerary-copy", to, url });
    return { sent: false, queued: true, reason: "preview_outbox" } as const;
  }
  const content = ItineraryEmail(props);
  const html = await render(content);
  const text = await render(content, { plainText: true });
  const { messageId } = await sendCloudflareMail(context?.env?.AUTH_EMAIL, {
    to, url, subject: "Your Localley itinerary", html, text,
  });
  return { sent: true, emailId: messageId } as const;
}
