"use server";

import { redirect } from "next/navigation";
import { appDataDb } from "@/lib/app-data/backend";
import { auth } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/admin-auth";
import { canUseCommunity } from "@/lib/community/access";
import type { CommunityDb } from "@/lib/community/qa";
import { REPORT_REASONS, type ReportReason } from "@/lib/community/rules";
import { photoBucket } from "@/lib/community/photos";
import { promoteTipPhoto } from "@/lib/community/spot-photos";
import { reportTip, setTipStatus } from "@/lib/community/tips";

const db = () => appDataDb() as unknown as CommunityDb;
const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
const page = (spotId: string, query = "") => `/spots/${encodeURIComponent(spotId)}/tips${query}`;

async function member(spotId: string) {
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(page(spotId))}`);
  if (!canUseCommunity(userId)) redirect(`/spots/${encodeURIComponent(spotId)}`);
  return userId;
}

export async function reportSpotTip(form: FormData) {
  const spotId = field(form, "spotId");
  const userId = await member(spotId);
  const reason = field(form, "reason");
  if ((REPORT_REASONS as readonly string[]).includes(reason)) await reportTip(db(), userId, field(form, "tipId"), reason as ReportReason);
  redirect(page(spotId, "?reported=1"));
}

export async function moderateTip(form: FormData) {
  const spotId = field(form, "spotId");
  const userId = await member(spotId);
  if (isAdminUser(userId)) await setTipStatus(db(), field(form, "tipId"), field(form, "status") === "visible" ? "visible" : "hidden");
  redirect(page(spotId));
}

/** Admin: a consented tip photo becomes the spot's own photo (shared/plans/localley-spot-photo-library.md). */
export async function promoteSpotTipPhoto(form: FormData) {
  const spotId = field(form, "spotId");
  const userId = await member(spotId);
  const bucket = photoBucket();
  if (!isAdminUser(userId) || !bucket) redirect(page(spotId));
  const result = await promoteTipPhoto(db(), bucket, field(form, "tipId"), userId);
  redirect(page(spotId, result.ok ? "?spotPhoto=1" : `?error=${encodeURIComponent(result.error)}`));
}
