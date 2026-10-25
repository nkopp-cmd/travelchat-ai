import "server-only";
import { DAILY_LIMITS, type CommunityTopic, type ReportReason } from "./rules";

/**
 * Community Q&A store on the application D1 (tables: migrations/app-preview/0041_community_qa.sql). The database is
 * a parameter so tests run on the node:sqlite shim; pages pass appDataDb(). Scores and answer counts are recomputed
 * from their source rows in the same batch as every change, so repeated clicks cannot drift them.
 */
type Statement = {
  bind(...values: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
export type CommunityDb = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };

export type QuestionRow = {
  id: string; user_id: string; author_name: string; city: string; topic: string; title: string; body: string;
  status: "visible" | "hidden"; score: number; answer_count: number; created_at: string; voted: number;
  ai_verdict?: string | null; ai_reason?: string | null;
};
export type AnswerRow = {
  id: string; question_id: string; user_id: string; author_name: string; body: string;
  status: "visible" | "hidden"; score: number; created_at: string; voted: number;
  ai_verdict?: string | null; ai_reason?: string | null;
};

const QUESTION_SCORE = "UPDATE community_questions SET score = (SELECT count(*) FROM community_votes v WHERE v.target_type = 'question' AND v.target_id = community_questions.id) WHERE id = ?";
const ANSWER_SCORE = "UPDATE community_answers SET score = (SELECT count(*) FROM community_votes v WHERE v.target_type = 'answer' AND v.target_id = community_answers.id) WHERE id = ?";
const ANSWER_COUNT = "UPDATE community_questions SET answer_count = (SELECT count(*) FROM community_answers a WHERE a.question_id = community_questions.id AND a.status = 'visible') WHERE id = ?";

export async function listQuestions(db: CommunityDb, viewerId: string, filter: { city?: string; topic?: string; limit?: number } = {}): Promise<QuestionRow[]> {
  const where = ["q.status = 'visible'"];
  const params: (string | number)[] = [viewerId];
  if (filter.city) { where.push("q.city = ?"); params.push(filter.city); }
  if (filter.topic) { where.push("q.topic = ?"); params.push(filter.topic); }
  params.push(Math.min(Math.max(filter.limit ?? 50, 1), 100));
  const { results } = await db.prepare(
    `SELECT q.*, EXISTS (SELECT 1 FROM community_votes v WHERE v.user_id = ? AND v.target_type = 'question' AND v.target_id = q.id) AS voted
     FROM community_questions q WHERE ${where.join(" AND ")} ORDER BY q.created_at DESC LIMIT ?`,
  ).bind(...params).all<QuestionRow>();
  return results;
}

/** One question with its answers. Hidden content is returned only to admins (to unhide). */
export async function getQuestion(db: CommunityDb, id: string, viewerId: string, admin = false):
  Promise<{ question: QuestionRow; answers: AnswerRow[] } | null> {
  const visible = admin ? "" : " AND status = 'visible'";
  const [question, answers] = await Promise.all([
    db.prepare(`SELECT q.*, EXISTS (SELECT 1 FROM community_votes v WHERE v.user_id = ? AND v.target_type = 'question' AND v.target_id = q.id) AS voted
      FROM community_questions q WHERE q.id = ?${visible.replace("status", "q.status")}`).bind(viewerId, id).first<QuestionRow>(),
    db.prepare(`SELECT a.*, EXISTS (SELECT 1 FROM community_votes v WHERE v.user_id = ? AND v.target_type = 'answer' AND v.target_id = a.id) AS voted
      FROM community_answers a WHERE a.question_id = ?${visible.replace("status", "a.status")} ORDER BY a.score DESC, a.created_at ASC`).bind(viewerId, id).all<AnswerRow>(),
  ]);
  return question ? { question, answers: answers.results } : null;
}

async function postedToday(db: CommunityDb, table: "community_questions" | "community_answers", userId: string): Promise<number> {
  const row = await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`)
    .bind(userId).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export type WriteResult = { ok: true; id: string } | { ok: false; error: string };

export async function createQuestion(db: CommunityDb, author: { userId: string; name: string },
  input: { title: string; body: string; city: string; topic: CommunityTopic }): Promise<WriteResult> {
  if (await postedToday(db, "community_questions", author.userId) >= DAILY_LIMITS.question) {
    return { ok: false, error: "You reached today's limit for questions. Try again tomorrow." };
  }
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO community_questions (id, user_id, author_name, city, topic, title, body) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, author.userId, author.name, input.city, input.topic, input.title, input.body).run();
  return { ok: true, id };
}

export async function createAnswer(db: CommunityDb, author: { userId: string; name: string }, questionId: string, body: string): Promise<WriteResult> {
  const question = await db.prepare("SELECT id FROM community_questions WHERE id = ? AND status = 'visible'").bind(questionId).first();
  if (!question) return { ok: false, error: "This question is not available." };
  if (await postedToday(db, "community_answers", author.userId) >= DAILY_LIMITS.answer) {
    return { ok: false, error: "You reached today's limit for answers. Try again tomorrow." };
  }
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO community_answers (id, question_id, user_id, author_name, body) VALUES (?, ?, ?, ?, ?)")
      .bind(id, questionId, author.userId, author.name, body),
    db.prepare(ANSWER_COUNT).bind(questionId),
  ]);
  return { ok: true, id };
}

/** Upvote on/off. Own posts cannot be upvoted. Returns false when the target is missing, hidden or own. */
export async function toggleVote(db: CommunityDb, userId: string, targetType: "question" | "answer", targetId: string): Promise<boolean> {
  const table = targetType === "question" ? "community_questions" : "community_answers";
  const target = await db.prepare(`SELECT user_id FROM ${table} WHERE id = ? AND status = 'visible'`).bind(targetId).first<{ user_id: string }>();
  if (!target || target.user_id === userId) return false;
  const existing = await db.prepare("SELECT 1 AS x FROM community_votes WHERE user_id = ? AND target_type = ? AND target_id = ?")
    .bind(userId, targetType, targetId).first();
  await db.batch([
    existing
      ? db.prepare("DELETE FROM community_votes WHERE user_id = ? AND target_type = ? AND target_id = ?").bind(userId, targetType, targetId)
      : db.prepare("INSERT OR IGNORE INTO community_votes (user_id, target_type, target_id) VALUES (?, ?, ?)").bind(userId, targetType, targetId),
    db.prepare(targetType === "question" ? QUESTION_SCORE : ANSWER_SCORE).bind(targetId),
  ]);
  return true;
}

export async function report(db: CommunityDb, userId: string, targetType: "question" | "answer", targetId: string, reason: ReportReason): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO community_reports (user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)")
    .bind(userId, targetType, targetId, reason).run();
}

/** Admin hide/unhide. Hiding resolves the target's open reports; an answer change recounts its question. */
export async function setStatus(db: CommunityDb, targetType: "question" | "answer", targetId: string, status: "visible" | "hidden"): Promise<void> {
  const table = targetType === "question" ? "community_questions" : "community_answers";
  const statements = [
    db.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).bind(status, targetId),
    db.prepare("UPDATE community_reports SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL")
      .bind(targetType, targetId),
  ];
  if (targetType === "answer") {
    statements.push(db.prepare(ANSWER_COUNT.replace("WHERE id = ?", "WHERE id = (SELECT question_id FROM community_answers WHERE id = ?)")).bind(targetId));
  }
  await db.batch(statements);
}

export async function openReportCounts(db: CommunityDb, targetIds: string[]): Promise<Map<string, number>> {
  if (!targetIds.length) return new Map();
  const { results } = await db.prepare("SELECT target_id, count(*) AS n FROM community_reports WHERE resolved_at IS NULL AND target_id IN (SELECT value FROM json_each(?)) GROUP BY target_id")
    .bind(JSON.stringify(targetIds)).all<{ target_id: string; n: number }>();
  return new Map(results.map((r) => [r.target_id, Number(r.n)]));
}
