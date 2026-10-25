// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
import { d1Client } from "@/lib/app-data/d1-postgrest";
import { completedChallengesWithDetails } from "@/lib/app-data/user-challenges";

afterEach(() => vi.unstubAllEnvs());
const uid = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("completedChallengesWithDetails", () => {
  it("Supabase: the original embedded query", async () => {
    vi.stubEnv("DATA_BACKEND", "");
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) };
    await completedChallengesWithDetails({ from: () => chain }, uid(1));
    expect(chain.select).toHaveBeenCalledWith("*, challenges(*)");
  });

  it("D1: completed rows of the profile with their challenge, null for a deleted challenge", async () => {
    vi.stubEnv("DATA_BACKEND", "d1");
    const db = new D1Sqlite();
    const dir = path.resolve(__dirname, "../../migrations/app-preview");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
    db.sqlite.exec("PRAGMA foreign_keys = OFF");
    db.sqlite.exec(`INSERT INTO challenges (id, name, description, xp_reward) VALUES ('${uid(11)}', 'Pathfinder', 'Visit 3 spots', 50);
      INSERT INTO user_challenges (user_id, challenge_id, completed) VALUES ('${uid(1)}', '${uid(11)}', 1), ('${uid(1)}', '${uid(12)}', 1),
        ('${uid(1)}', '${uid(13)}', 0), ('${uid(2)}', '${uid(11)}', 1);`);
    const { data, error } = await completedChallengesWithDetails(d1Client(db, { role: "service" }), uid(1));
    expect(error).toBeNull();
    expect(data!.map((r) => [r.challenge_id, r.challenges?.name ?? null]).sort()).toEqual([[uid(11), "Pathfinder"], [uid(12), null]]);
  });
});
