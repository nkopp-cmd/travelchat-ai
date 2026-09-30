import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), reader: vi.fn(), batch: vi.fn() }));
vi.mock("@/lib/app-data/preview-itinerary-detail", () => ({ previewItineraryDetail: mocks.read }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { deletePreviewItinerary } from "@/lib/app-data/preview-itinerary-delete";

const id = "550e8400-e29b-41d4-a716-446655440000";
const owned = { state: "found", itinerary: { id, clerk_user_id: "user_one" } };
const statements: { sql: string; args: unknown[] }[] = [];
beforeEach(() => {
  mocks.read.mockResolvedValue(owned);
  mocks.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  mocks.reader.mockReturnValue({
    prepare: (sql: string) => ({ bind: (...args: unknown[]) => {
      const statement = { sql, args };
      statements.push(statement);
      return statement;
    } }),
    batch: mocks.batch,
  });
});
afterEach(() => { vi.clearAllMocks(); statements.length = 0; });

describe("preview itinerary delete", () => {
  it("clears links and metadata before one owner-guarded delete batch", async () => {
    expect(await deletePreviewItinerary(id.toUpperCase(), "user_one")).toBe("deleted");
    expect(statements).toHaveLength(3);
    expect(statements.map(statement => statement.sql.trim().split(" ")[0])).toEqual(["UPDATE", "DELETE", "DELETE"]);
    expect(statements[0].sql).toContain("linkedItineraryId = NULL");
    expect(statements[1].sql).toContain("legacy_itinerary_media");
    expect(statements[2].sql).toContain("DELETE FROM itineraries");
    for (const statement of statements) {
      expect(statement.sql).toContain("ownerId IN");
      expect(statement.args).toEqual([id, "user_one", "auth:user_one"]);
    }
    expect(mocks.batch).toHaveBeenCalledOnce();
    expect(mocks.batch.mock.calls[0][0]).toEqual(statements);
  });

  it("denies public foreign and missing itineraries before preparing writes", async () => {
    mocks.read.mockResolvedValueOnce({ state: "found", itinerary: { id, clerk_user_id: "user_two", is_public: true } })
      .mockResolvedValueOnce({ state: "missing" }).mockResolvedValueOnce({ state: "forbidden" });
    expect(await deletePreviewItinerary(id, "user_one")).toBe("forbidden");
    expect(await deletePreviewItinerary(id, "user_one")).toBe("missing");
    expect(await deletePreviewItinerary(id, "user_one")).toBe("forbidden");
    expect(mocks.reader).not.toHaveBeenCalled();
  });

  it("propagates pre-read and atomic batch failures without a fallback write", async () => {
    mocks.read.mockRejectedValueOnce(new Error("malformed history"));
    await expect(deletePreviewItinerary(id, "user_one")).rejects.toThrow("malformed history");
    expect(mocks.reader).not.toHaveBeenCalled();
    mocks.batch.mockRejectedValueOnce(new Error("D1 batch rolled back"));
    await expect(deletePreviewItinerary(id, "user_one")).rejects.toThrow("D1 batch rolled back");
    expect(mocks.batch).toHaveBeenCalledOnce();
  });

  it("fails closed when the final delete does not affect one row", async () => {
    mocks.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } }]);
    await expect(deletePreviewItinerary(id, "user_one")).rejects.toThrow("Preview itinerary delete failed");
  });
});
