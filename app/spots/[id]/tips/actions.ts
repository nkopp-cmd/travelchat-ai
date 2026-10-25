"use server";

import { redirect } from "next/navigation";
import { appDataDb } from "@/lib/app-data/backend";
import { auth, currentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/admin-auth";
import { canUseCommunity } from "@/lib/community/access";
import type { CommunityDb } from "@/lib/community/qa";
import { REPORT_REASONS, authorName, checkTip, type ReportReason } from "@/lib/community/rules";
import { createTip, reportTip, setTipStatus } from "@/lib/community/tips";

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

export async function addTip(form: FormData) {
  const spotId = field(form, "spotId");
  const userId = await member(spotId);
  const verdict = checkTip({ body: form.get("body"), visitedOn: form.get("visitedOn") });
  if (!verdict.ok) redirect(page(spotId, `?error=${encodeURIComponent(verdict.error)}#tip`));
  const result = await createTip(db(), { userId, name: authorName(await currentUser()) }, spotId, verdict.value);
  if (!result.ok) redirect(page(spotId, `?error=${encodeURIComponent(result.error)}#tip`));
  redirect(page(spotId, `#t-${result.id}`));
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
