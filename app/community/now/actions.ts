"use server";

import { redirect } from "next/navigation";
import { appDataDb } from "@/lib/app-data/backend";
import { auth, currentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/admin-auth";
import { canUseCommunity } from "@/lib/community/access";
import type { CommunityDb } from "@/lib/community/qa";
import { REPORT_REASONS, authorName, checkTrip, type ReportReason } from "@/lib/community/rules";
import { addTrip, hidePerson, removeTrip, reportTrip, setTripStatus } from "@/lib/community/trips";

const db = () => appDataDb() as unknown as CommunityDb;
const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
/** Back to the group the form was posted from (city + week are validated by the page). */
const back = (form: FormData, extra: Record<string, string> = {}) => {
  const query = new URLSearchParams({ city: field(form, "city"), week: field(form, "week"), ...extra });
  return `/community/now?${query}`;
};

async function member() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/community/now");
  if (!canUseCommunity(userId)) redirect("/");
  return userId;
}

export async function joinGroup(form: FormData) {
  const userId = await member();
  const verdict = checkTrip({ city: form.get("tripCity"), from: form.get("from"), to: form.get("to"), note: form.get("note") });
  if (!verdict.ok) redirect(back(form, { error: verdict.error }));
  const today = new Date().toISOString().slice(0, 10);
  const result = await addTrip(db(), { userId, name: authorName(await currentUser()) }, today, verdict.value);
  if (!result.ok) redirect(back(form, { error: result.error }));
  redirect(back(form));
}

export async function leaveGroup(form: FormData) {
  const userId = await member();
  await removeTrip(db(), userId, field(form, "tripId"));
  redirect(back(form));
}

export async function hideTraveller(form: FormData) {
  const userId = await member();
  await hidePerson(db(), userId, field(form, "personId"));
  redirect(back(form));
}

export async function reportTraveller(form: FormData) {
  const userId = await member();
  const reason = field(form, "reason");
  if ((REPORT_REASONS as readonly string[]).includes(reason)) await reportTrip(db(), userId, field(form, "tripId"), reason as ReportReason);
  redirect(back(form, { reported: "1" }));
}

export async function moderateTrip(form: FormData) {
  const userId = await member();
  if (isAdminUser(userId)) await setTripStatus(db(), field(form, "tripId"), field(form, "status") === "visible" ? "visible" : "hidden");
  redirect(back(form));
}
