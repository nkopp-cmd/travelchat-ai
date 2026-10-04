import "server-only";
import { currentUser } from "@/lib/auth/server";
import { authMailMode, createMailSender, type OutboxDatabase } from "@/lib/auth/mail";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";
import { previewStoryReady } from "./preview-story-readiness";

const previewHost = "localley-next-preview.nkopp.workers.dev";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** All recipient and link identity comes from the verified session and owned D1 row. */
export async function queuePreviewStoryMail(userId: string, id: string): Promise<boolean> {
  if (!uuid.test(id)) throw new RangeError("Invalid itinerary ID");
  if (process.env.BETTER_AUTH_URL !== `https://${previewHost}` || authMailMode() !== "outbox"
    || process.env.SUPABASE_READ_ONLY !== "true") throw new Error("Story outbox unavailable");
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email
    || email.length > 200 || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) {
    throw new Error("Story recipient unavailable");
  }
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId)) throw new Error("Historical story mail unavailable");
  const row = await previewAppDataReader().prepare(`SELECT i.id FROM itineraries i JOIN owners o ON o.id = i.ownerId
    WHERE i.id = ? AND i.ownerId = ? AND o.source = 'new'
      AND NOT EXISTS (SELECT 1 FROM legacy_owners l WHERE l.clerkUserId = ? OR l.ownerId = o.id)`)
    .bind(id.toLowerCase(), owners.fresh, userId).first<{ id: string }>();
  if (!row) return false;
  if (row.id !== id.toLowerCase()) throw new Error("Invalid story itinerary");
  if (!await previewStoryReady(row.id, userId)) return false;
  const context = (globalThis as Record<symbol, { env?: { AUTH_DB?: OutboxDatabase } } | undefined>)
    [Symbol.for("__cloudflare-context__")];
  // Never pass a provider binding: this increment records only reserved preview mail.
  await createMailSender(context?.env?.AUTH_DB)({ kind: "story-ready", to: email,
    url: `https://${previewHost}/itineraries/${row.id}/stories?data_candidate=d1` });
  return true;
}
