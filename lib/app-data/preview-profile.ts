import "server-only";
import { currentUser } from "@/lib/auth/server";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewItineraryList } from "./preview-itinerary-list";
import { previewBillingSettings } from "./preview-billing-settings";

/** Fresh private profile only; historical progress and mutable profile actions stay gated. */
export async function previewProfile(userId: string) {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email))
    throw new Error("Preview profile owner unavailable");
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId))
    throw new Error("Preview profile owner unavailable");
  const [trips, billing] = await Promise.all([
    previewItineraryList(userId), previewBillingSettings(userId),
  ]);
  return { trips, billing };
}
