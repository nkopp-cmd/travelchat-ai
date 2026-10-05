import "server-only";
import { currentUser } from "@/lib/auth/server";
import { authMailMode, createMailSender, type OutboxDatabase } from "@/lib/auth/mail";
import { previewItineraryPage } from "./preview-itinerary-page";

const host = "localley-next-preview.nkopp.workers.dev";

/** Reserved owner copy only. External sharing and actual transport remain gated. */
export async function queuePreviewItineraryMail(userId: string, id: string, recipientEmail: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new RangeError("Invalid itinerary ID");
  if (process.env.BETTER_AUTH_URL !== `https://${host}` || authMailMode() !== "outbox"
    || process.env.SUPABASE_READ_ONLY !== "true") throw new Error("Itinerary outbox unavailable");
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) {
    throw new Error("Itinerary recipient unavailable");
  }
  if (recipientEmail.toLowerCase() !== email) throw new RangeError("Invalid recipient");
  // Reuse the now-tested private detail policy, including history and content bounds.
  const row = await previewItineraryPage(id, userId);
  if (!row) return false;
  const context = (globalThis as Record<symbol, { env?: { AUTH_DB?: OutboxDatabase } } | undefined>)
    [Symbol.for("__cloudflare-context__")];
  // Omit provider bindings so this route cannot send to a real inbox.
  await createMailSender(context?.env?.AUTH_DB)({ kind: "itinerary-copy", to: email,
    url: `https://${host}/itineraries/${row.id}?data_candidate=d1` });
  return true;
}
