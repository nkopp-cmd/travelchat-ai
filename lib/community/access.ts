import "server-only";
import { notFound, redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-auth";

/**
 * Community stays admin-only until moderation (report review, AI pre-filter, notifications) is live:
 * shared/plans/localley-helper-community.md rule "moderation before public launch". COMMUNITY_PUBLIC=true opens it.
 */
export function communityPublic(): boolean {
  return process.env.COMMUNITY_PUBLIC === "true";
}

export function canUseCommunity(userId: string | null): boolean {
  return Boolean(userId) && (communityPublic() || isAdminUser(userId));
}

/**
 * Page gate: when the community is public, a signed-out visitor signs in and comes back to `path`;
 * every other denied case stays a 404 (the community is invisible while it is admin-only). Returns the user id.
 */
export async function requireCommunityPage(userId: string | null, path: string | (() => Promise<string>)): Promise<string> {
  if (!userId && communityPublic()) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(typeof path === "string" ? path : await path())}`);
  }
  if (!userId || !canUseCommunity(userId)) notFound();
  return userId;
}
