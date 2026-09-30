// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), batch: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { savePreviewItinerary } from "@/lib/app-data/preview-itinerary-save";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const statements: { sql: string; args: unknown[] }[] = [];
const input = { title: "Seoul day", city: "Seoul", days: 1,
  activities: [{ day: 1, activities: [] }], localScore: 7 };
beforeEach(() => {
  mocks.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  mocks.reader.mockReturnValue({ prepare: (sql: string) => ({ bind: (...args: unknown[]) => {
    const statement = { sql, args };
    statements.push(statement);
    return statement;
  } }), batch: mocks.batch });
});
afterEach(() => { vi.clearAllMocks(); statements.length = 0; });

describe("preview itinerary save", () => {
  it("creates a fresh owner and itinerary in one D1 batch", async () => {
    const result = await savePreviewItinerary("user_one", input);
    expect(result).toMatchObject({ clerk_user_id: "user_one", title: input.title,
      city: input.city, days: 1, activities: input.activities, local_score: 7 });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain("NOT EXISTS (SELECT 1 FROM legacy_owners");
    expect(statements[0].args).toEqual(["auth:user_one", "user_one"]);
    expect(statements[1].sql).toContain("o.source = 'legacy-fixture'");
    expect(statements[1].sql).toContain("o.source = 'new'");
    expect(statements[1].args.slice(-3)).toEqual(["user_one", "auth:user_one", "user_one"]);
    expect(mocks.batch).toHaveBeenCalledOnce();
    expect(mocks.batch.mock.calls[0][0]).toEqual(statements);
  });

  it("accepts an existing imported owner without creating a fresh one", async () => {
    mocks.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    expect((await savePreviewItinerary("legacy_user", input)).clerk_user_id).toBe("legacy_user");
  });

  it("runs fresh and imported owner choices against SQLite", async () => {
    const db = new D1Sqlite();
    try {
      db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT NOT NULL);
        CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT NOT NULL UNIQUE);
        CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES owners(id),
          title TEXT, city TEXT, days INTEGER, activities TEXT, local_score REAL, created_at TEXT);
        INSERT INTO owners VALUES ('legacy_user','legacy-fixture');
        INSERT INTO legacy_owners VALUES ('legacy_user','legacy_user');`);
      mocks.reader.mockReturnValue(db);
      await savePreviewItinerary("fresh_user", input);
      await savePreviewItinerary("legacy_user", input);
      const rows = db.sqlite.prepare("SELECT ownerId FROM itineraries ORDER BY ownerId").all() as { ownerId: string }[];
      expect(rows).toEqual([{ ownerId: "auth:fresh_user" }, { ownerId: "legacy_user" }]);
      expect(db.sqlite.prepare("SELECT count(*) AS n FROM owners WHERE id='auth:legacy_user'").get())
        .toEqual({ n: 0 });
    } finally {
      db.sqlite.close();
    }
  });

  it("rejects excess payload and failed inserts without fallback", async () => {
    await expect(savePreviewItinerary("user_one", { ...input, activities: "x".repeat(65537) }))
      .rejects.toThrow(RangeError);
    expect(mocks.reader).not.toHaveBeenCalled();
    mocks.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    await expect(savePreviewItinerary("user_one", input)).rejects.toThrow("Preview itinerary save failed");
    mocks.batch.mockRejectedValueOnce(new Error("D1 transaction failed"));
    await expect(savePreviewItinerary("user_one", input)).rejects.toThrow("D1 transaction failed");
  });
});
