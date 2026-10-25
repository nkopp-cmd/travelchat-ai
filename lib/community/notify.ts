import "server-only";
import type { CommunityDb } from "./qa";

type AuthDb = CommunityDb;

/** The Better Auth D1 (binding AUTH_DB) that holds the inbox; null outside the Worker. */
export function inboxDb(): AuthDb | null {
  const context = (globalThis as Record<symbol, { env?: { AUTH_DB?: AuthDb } } | undefined>)[Symbol.for("__cloudflare-context__")];
  return context?.env?.AUTH_DB ?? null;
}

/**
 * In-app inbox entry for the question's author when someone else answers (moderation item: "notifications for
 * answers"). Writes the inbox table the notification centre reads (AUTH_DB auth_notifications, type "system" with a
 * relative url). Only verified users; skipped when the author saved preferences with "social" off. Never throws:
 * a failed notification must not fail the answer.
 */
export async function notifyAnswer(appDb: CommunityDb, authDb: AuthDb, questionId: string, answer: { userId: string; name: string }): Promise<boolean> {
  try {
    const question = await appDb.prepare("SELECT user_id, title FROM community_questions WHERE id = ? AND status = 'visible'")
      .bind(questionId).first<{ user_id: string; title: string }>();
    if (!question || question.user_id === answer.userId) return false;
    const title = `${answer.name} answered your question`.slice(0, 200);
    const message = question.title.slice(0, 2000);
    const data = JSON.stringify({ url: `/community/${questionId}`, questionId });
    const inserted = await authDb.prepare(
      `INSERT INTO auth_notifications (id, userId, type, title, message, data)
       SELECT ?, u.id, 'system', ?, ?, ? FROM "user" u
       WHERE u.id = ? AND u.emailVerified = 1
         AND NOT EXISTS (SELECT 1 FROM auth_notification_preferences p WHERE p.userId = u.id AND p.social = 0)
       RETURNING id`,
    ).bind(crypto.randomUUID(), title, message, data, question.user_id).first<{ id: string }>();
    return Boolean(inserted);
  } catch (error) {
    console.error("[community] answer notification failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}
