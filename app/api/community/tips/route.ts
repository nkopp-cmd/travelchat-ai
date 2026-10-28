import { NextRequest, NextResponse } from "next/server";
import { appDataDb } from "@/lib/app-data/backend";
import { auth, currentUser } from "@/lib/auth/server";
import { canUseCommunity } from "@/lib/community/access";
import { PHOTO_MAX_BYTES } from "@/lib/community/photo-rules";
import { photoBucket, storeTipPhoto } from "@/lib/community/photos";
import type { CommunityDb } from "@/lib/community/qa";
import { authorName, checkTip } from "@/lib/community/rules";
import { createTip } from "@/lib/community/tips";

/**
 * Add a spot tip with an optional photo: a plain multipart form post (works without client JS) answered with a 303
 * back to the tips page. A route handler, not a server action, because server actions cap bodies at 1 MB.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth(request.headers);
  if (!userId || !canUseCommunity(userId)) return NextResponse.json({ error: "Not available" }, { status: 404 });
  if (Number(request.headers.get("content-length") ?? 0) > PHOTO_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Upload too large" }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const spotId = typeof form?.get("spotId") === "string" ? String(form.get("spotId")) : "";
  const back = (query = "") => NextResponse.redirect(new URL(`/spots/${encodeURIComponent(spotId)}/tips${query}`, request.url), 303);
  if (!form || !/^[0-9a-f-]{36}$/.test(spotId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const verdict = checkTip({ body: form.get("body"), visitedOn: form.get("visitedOn") });
  if (!verdict.ok) return back(`?error=${encodeURIComponent(verdict.error)}#tip`);

  const tipId = crypto.randomUUID();
  const photo = form.get("photo");
  let photoKey: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const stored = await storeTipPhoto(photo, tipId);
    if (!stored.ok) return back(`?error=${encodeURIComponent(stored.error)}#tip`);
    photoKey = stored.key;
  }
  const result = await createTip(appDataDb() as unknown as CommunityDb, { userId, name: authorName(await currentUser(request.headers)) },
    spotId, { ...verdict.value, photoKey, photoConsent: form.get("photoConsent") === "on" }, tipId);
  if (!result.ok) {
    if (photoKey) await photoBucket()?.delete(photoKey);
    return back(`?error=${encodeURIComponent(result.error)}#tip`);
  }
  return back(`#t-${result.id}`);
}
