import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { appDataDb } from "@/lib/app-data/backend";
import { auth } from "@/lib/auth/server";
import { canUseCommunity } from "@/lib/community/access";
import { PHOTO_KEY } from "@/lib/community/photo-rules";
import { photoBucket } from "@/lib/community/photos";
import type { CommunityDb } from "@/lib/community/qa";
import { tipByPhoto } from "@/lib/community/tips";

/** Tip photos from R2, only for community members; photos of hidden tips only for admins. Never public-cached. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { userId } = await auth(request.headers);
  if (!userId || !canUseCommunity(userId)) return new NextResponse(null, { status: 404 });
  const key = (await params).key.join("/");
  if (!PHOTO_KEY.test(key)) return new NextResponse(null, { status: 404 });
  const tip = await tipByPhoto(appDataDb() as unknown as CommunityDb, key);
  if (!tip || (tip.status !== "visible" && !isAdminUser(userId))) return new NextResponse(null, { status: 404 });
  const object = await photoBucket()?.get(key);
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(object.body, {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
  });
}
