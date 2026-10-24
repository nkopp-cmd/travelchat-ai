import "server-only";
import { appDataDb, dataBackend } from "./backend";

type Client = { from: (table: string) => unknown };
type SavedSpotRow = { id: string; spot_id: string; created_at: string | null; spots: Record<string, unknown> | null };

/**
 * The caller's saved spots with an embedded `spots` object (the PostgREST many-to-one embed). Supabase: the original
 * single embedded query. D1: saved rows through the owner-scoped facade, spot fields from the exact imported source row
 * (legacy_spot_source.payload), so both backends return the same shape.
 */
export async function savedSpotsWithSpots(client: Client, userId: string, spotColumns: string[], limit?: number):
  Promise<{ data: SavedSpotRow[] | null; error: { message: string } | null }> {
  if (spotColumns.some((c) => !/^[a-z_]+$/.test(c))) throw new Error("Invalid spot column");
  if (dataBackend() !== "d1") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (client.from("saved_spots") as any).select(`id, spot_id, created_at, spots (${spotColumns.join(", ")})`)
      .eq("clerk_user_id", userId).order("created_at", { ascending: false });
    if (limit !== undefined) query = query.limit(limit);
    return query;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (client.from("saved_spots") as any).select("id, spot_id, created_at")
    .eq("clerk_user_id", userId).order("created_at", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query as { data: Omit<SavedSpotRow, "spots">[] | null; error: { message: string } | null };
  if (error || !data) return { data: null, error };
  const ids = [...new Set(data.map((row) => row.spot_id))];
  const { results } = ids.length
    ? await appDataDb().prepare("SELECT spotId, payload FROM legacy_spot_source WHERE spotId IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(ids)).all<{ spotId: string; payload: string }>()
    : { results: [] };
  const spots = new Map(results.map((row) => {
    const source = JSON.parse(row.payload) as Record<string, unknown>;
    return [row.spotId, Object.fromEntries(spotColumns.map((c) => [c, source[c] ?? null]))];
  }));
  return { data: data.map((row) => ({ ...row, spots: spots.get(row.spot_id) ?? null })), error: null };
}
