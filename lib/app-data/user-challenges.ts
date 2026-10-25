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
