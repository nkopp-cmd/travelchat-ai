import "server-only";
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
