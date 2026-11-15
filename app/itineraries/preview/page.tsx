import { cookies } from "next/headers";
import PreviewClient from "./preview-client";
import { DRAFT_COOKIE, readServerDraft } from "@/lib/trips/preview-draft-store";

// Dynamic: the HttpOnly draft cookie names the server copy, so a cold return from sign-up or checkout paints the trip
// in the first HTML instead of after hydration (shared/plans/localley-preview-server-draft.md).
export default async function GeneratedItineraryPreview() {
  const initialDraft = await readServerDraft((await cookies()).get(DRAFT_COOKIE)?.value);
  return <PreviewClient initialDraft={initialDraft} />;
}
