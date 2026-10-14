import "server-only";
import { currentUser } from "@/lib/auth/server";
import { newOwnerId, ownerIds } from "./preview-conversations";

/** Only reserved, verified fresh users receive the candidate page's save control. No writes. */
export async function previewSavedSpotActor(): Promise<string | null> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!user?.id || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) return null;
  const ids = await ownerIds(user.id);
  if (ids.legacy || (ids.fresh !== null && ids.fresh !== newOwnerId(user.id))) return null;
  return user.id;
}
