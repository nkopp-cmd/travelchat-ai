"use server";

import { redirect } from "next/navigation";
import { appDataDb } from "@/lib/app-data/backend";
import { auth, currentUser } from "@/lib/auth/server";
import { isAdminUser } from "@/lib/admin-auth";
import { canUseCommunity } from "@/lib/community/access";
import { createAnswer, createQuestion, report, setStatus, toggleVote, type CommunityDb } from "@/lib/community/qa";
import { REPORT_REASONS, authorName, checkAnswer, checkQuestion, type ReportReason } from "@/lib/community/rules";

const db = () => appDataDb() as unknown as CommunityDb;
const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
const target = (form: FormData) => (field(form, "targetType") === "answer" ? "answer" : "question") as "question" | "answer";
const back = (questionId: string, query = "") => `/community/${encodeURIComponent(questionId)}${query}`;

async function member() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/community");
  if (!canUseCommunity(userId)) redirect("/");
  return userId;
}

export async function askQuestion(form: FormData) {
  const userId = await member();
  const verdict = checkQuestion({ title: form.get("title"), body: form.get("body"), city: form.get("city"), topic: form.get("topic") });
  if (!verdict.ok) redirect(`/community/ask?error=${encodeURIComponent(verdict.error)}`);
  const result = await createQuestion(db(), { userId, name: authorName(await currentUser()) }, verdict.value);
  if (!result.ok) redirect(`/community/ask?error=${encodeURIComponent(result.error)}`);
  redirect(back(result.id));
}

export async function answerQuestion(form: FormData) {
  const userId = await member();
  const questionId = field(form, "questionId");
  const verdict = checkAnswer(form.get("body"));
  if (!verdict.ok) redirect(back(questionId, `?error=${encodeURIComponent(verdict.error)}#answer`));
  const result = await createAnswer(db(), { userId, name: authorName(await currentUser()) }, questionId, verdict.value);
  if (!result.ok) redirect(back(questionId, `?error=${encodeURIComponent(result.error)}#answer`));
  redirect(back(questionId, `#a-${result.id}`));
}

export async function vote(form: FormData) {
  const userId = await member();
  await toggleVote(db(), userId, target(form), field(form, "targetId"));
  redirect(back(field(form, "questionId"), field(form, "targetType") === "answer" ? `#a-${field(form, "targetId")}` : ""));
}

export async function reportContent(form: FormData) {
  const userId = await member();
  const reason = field(form, "reason");
  if ((REPORT_REASONS as readonly string[]).includes(reason)) {
    await report(db(), userId, target(form), field(form, "targetId"), reason as ReportReason);
  }
  redirect(back(field(form, "questionId"), "?reported=1"));
}

export async function moderate(form: FormData) {
  const userId = await member();
  if (!isAdminUser(userId)) redirect("/community");
  await setStatus(db(), target(form), field(form, "targetId"), field(form, "status") === "visible" ? "visible" : "hidden");
  redirect(back(field(form, "questionId")));
}
