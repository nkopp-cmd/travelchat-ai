export type AppSessionStatus =
  | "loading" | "signedout" | "unverified" | "unlinked"
  | "incomplete" | "ready" | "blocked" | "error";

export interface AppSessionValue {
  status: AppSessionStatus;
  provider: "clerk" | "better-auth";
  accountKey: string | null;
  sessionId: string | null;
  authUserId: string | null;
  ownerId: string | null;
  userRecordId: string | null;
  canBookmark: boolean;
  requestSignIn(returnTo: string): void;
  refresh(): Promise<void>;
}

export function localReturnTo(returnTo: string): string {
  return returnTo.startsWith("/") && !returnTo.startsWith("//")
    && !/[\\\r\n\t]/.test(returnTo) ? returnTo : "/";
}
