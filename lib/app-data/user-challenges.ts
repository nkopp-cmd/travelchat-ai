import "server-only";
import { dataBackend } from "./backend";

type Client = { from: (table: string) => unknown };
export type CompletedChallenge = { challenge_id: string; challenges: { name: string; description: string; xp_reward: number } | null };

/**
 * A profile's completed challenges with the embedded `challenges` row (PostgREST many-to-one embed). Supabase: the
 * original single embedded query. D1: two reads through the facade (completed rows, then their challenges), same shape.
 */
export async function completedChallengesWithDetails(client: Client, profileId: string):
  Promise<{ data: CompletedChallenge[] | null; error: { message: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string) => client.from(table) as any;
  if (dataBackend() !== "d1") {
    return from("user_challenges").select("*, challenges(*)").eq("user_id", profileId).eq("completed", true);
  }
  const { data, error } = await from("user_challenges").select("*").eq("user_id", profileId).eq("completed", true) as
    { data: { challenge_id: string }[] | null; error: { message: string } | null };
  if (error || !data) return { data: null, error };
  const ids = [...new Set(data.map((row) => row.challenge_id))];
  const { data: challenges, error: challengeError } = ids.length
    ? await from("challenges").select("*").in("id", ids) as { data: Record<string, unknown>[] | null; error: { message: string } | null }
    : { data: [], error: null };
  if (challengeError) return { data: null, error: challengeError };
  const byId = new Map((challenges ?? []).map((c) => [c.id, c as CompletedChallenge["challenges"]]));
  return { data: data.map((row) => ({ ...row, challenges: byId.get(row.challenge_id) ?? null })), error: null };
}

export type ProfileProgressRow = { discoveries: number | null; spots_visited: number | null; current_streak: number | null };

/**
 * D1 only: a profile's progress and completed challenges in one round trip, keyed by the signed-in owner id
 * (profiles.ownerId) instead of first reading the internal profile id. Same shapes as the facade reads above
 * (completed challenges carry the embedded `challenges` row). Used by /profile (perf-speed-of-light.md).
 */
export async function profileProgressByOwner(db: { batch(statements: unknown[]): Promise<{ results?: Record<string, unknown>[] }[]>; prepare(sql: string): { bind(...values: string[]): unknown } }, ownerId: string):
  Promise<{ progress: ProfileProgressRow | null; challenges: CompletedChallenge[] }> {
  const profile = "(SELECT id FROM profiles WHERE ownerId = ?)";
  const [progress, challenges] = await db.batch([
    db.prepare(`SELECT discoveries, spots_visited, current_streak FROM user_progress WHERE user_id = ${profile}`).bind(ownerId),
    db.prepare(`SELECT uc.challenge_id, c.name, c.description, c.xp_reward FROM user_challenges uc
      LEFT JOIN challenges c ON c.id = uc.challenge_id WHERE uc.user_id = ${profile} AND uc.completed = 1`).bind(ownerId),
  ]);
  return {
    progress: (progress.results?.[0] as ProfileProgressRow | undefined) ?? null,
    challenges: (challenges.results ?? []).map((row) => ({
      challenge_id: String(row.challenge_id),
      challenges: row.name == null ? null : { name: String(row.name), description: String(row.description ?? ""), xp_reward: Number(row.xp_reward ?? 0) },
    })),
  };
}
