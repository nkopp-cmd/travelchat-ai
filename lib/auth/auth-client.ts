"use client";

/** The full Better Auth client. Import it only from auth pages or lazily. */
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
