import "server-only";
import { currentUser } from "@/lib/auth/server";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewAdminGuides } from "./preview-admin-guides";
import { readPreviewGuideApplication } from "./preview-guide-application";

export type PreviewGuideApplicationState =
  | { kind: "unavailable" }
  | { kind: "new" }
  | { kind: "pending"; bio: string; cities: string[]; specialties: string[] };

/** Fresh reserved accounts only. No owner/default rows are created by a page read. */
export async function previewGuideApplicationPage(): Promise<PreviewGuideApplicationState> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!user || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email))
    throw new Error("Guide preview unavailable");
  const owners = await ownerIds(user.id);
  if (owners.legacy || (owners.fresh !== null && owners.fresh !== newOwnerId(user.id)))
    throw new Error("Guide preview unavailable");
  const guides = await previewAdminGuides(null);
  if (guides.some(guide => guide.clerk_user_id === user.id)) throw new Error("Guide preview unavailable");
  const application = await readPreviewGuideApplication(user.id);
  if (!application) return { kind: "new" };
  if (application.clerkUserId !== user.id || application.status !== "pending" || !application.bio)
    throw new Error("Guide preview unavailable");
  return { kind: "pending", bio: application.bio, cities: application.cities, specialties: application.specialties };
}
