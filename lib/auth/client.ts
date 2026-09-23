"use client";

/**
 * Client-side auth adapter (Better Auth). Client components import from here.
 *
 * - `useUser()` -> { isLoaded, isSignedIn, user }   (drop-in for Clerk's useUser)
 * - `useAuth()` -> { isLoaded, isSignedIn, userId, signOut }   (drop-in for Clerk's useAuth)
 * - `authClient` for sign-in / sign-up / reset pages.
 */
import { useMemo } from "react";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // The browser uses its own origin (www, apex, staging, preview). The SSR value is never fetched.
  baseURL: typeof window === "undefined" ? "https://localley.io" : window.location.origin,
  basePath: "/api/auth",
  plugins: [
    magicLinkClient(),
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        bio: { type: "string", required: false },
      },
    }),
  ],
});

type SessionData = NonNullable<ReturnType<typeof authClient.useSession>["data"]>;

export interface ClientUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: Array<{ emailAddress: string }>;
  unsafeMetadata: { bio?: string };
  /** Clerk-compatible profile update: { firstName, lastName, unsafeMetadata: { bio } }. */
  update(input: { firstName?: string; lastName?: string; unsafeMetadata?: Record<string, unknown> }): Promise<void>;
}

export function toClientUser(user: SessionData["user"]): ClientUser {
  const [first, ...rest] = (user.name || "").trim().split(/\s+/);
  const firstName = user.firstName ?? (first || null);
  const lastName = user.lastName ?? (rest.join(" ") || null);
  const email = { emailAddress: user.email };
  return {
    id: user.id,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ") || user.name || null,
    imageUrl: user.image || "",
    primaryEmailAddress: email,
    emailAddresses: [email],
    unsafeMetadata: user.bio ? { bio: user.bio } : {},
    async update(input) {
      const nextFirst = input.firstName ?? firstName ?? "";
      const nextLast = input.lastName ?? lastName ?? "";
      const bio = input.unsafeMetadata && typeof input.unsafeMetadata.bio === "string" ? input.unsafeMetadata.bio : undefined;
      const { error } = await authClient.updateUser({
        firstName: nextFirst,
        lastName: nextLast,
        name: [nextFirst, nextLast].filter(Boolean).join(" ") || user.name,
        ...(bio !== undefined ? { bio } : {}),
      });
      if (error) throw new Error(error.message || "Profile update failed");
    },
  };
}

export function useUser(): { isLoaded: boolean; isSignedIn: boolean; user: ClientUser | null } {
  const { data, isPending } = authClient.useSession();
  const sessionUser = data?.user;
  const user = useMemo(() => (sessionUser ? toClientUser(sessionUser) : null), [sessionUser]);
  return { isLoaded: !isPending, isSignedIn: Boolean(user), user };
}

export function useAuth(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  signOut: (redirectTo?: string) => Promise<void>;
} {
  const { data, isPending } = authClient.useSession();
  return {
    isLoaded: !isPending,
    isSignedIn: Boolean(data?.user),
    userId: data?.user?.id ?? null,
    signOut,
  };
}

export async function signOut(redirectTo = "/"): Promise<void> {
  await authClient.signOut();
  window.location.assign(safeRedirect(redirectTo));
}

/** Only same-site paths; blocks //evil.com and backslash tricks. */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  if (!target) return fallback;
  return target.startsWith("/") && !target.startsWith("//") && !/[\\\r\n\t]/.test(target) ? target : fallback;
}
