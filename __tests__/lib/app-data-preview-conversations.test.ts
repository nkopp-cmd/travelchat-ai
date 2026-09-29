// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { createPreviewConversation, isPreviewConversationCandidate,
  previewConversations } from "@/lib/app-data/preview-conversations";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

function setup(initialOwners: { id: string; source: string }[], conversations: unknown[] = [], messages: unknown[] = []) {
  let ownerRows = initialOwners;
  const binds: { sql: string; values: unknown[] }[] = [];
  const prepare = vi.fn((sql: string) => ({
    bind: (...values: unknown[]) => {
      binds.push({ sql, values });
      return {
        all: async () => ({ results: sql.includes("FROM owners o") ? ownerRows
          : sql.includes("FROM conversations WHERE") ? conversations : messages }),
        run: async () => {
          if (sql.includes("INSERT OR IGNORE INTO owners")) {
            ownerRows = [{ id: String(values[0]), source: "new" }];
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  }));
  mocks.reader.mockReturnValue({ prepare });
  return { binds, prepare };
}

describe("preview conversations", () => {
  it("gates the exact preview candidate host", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const req = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/conversations${flag ? "?data_candidate=d1" : ""}`,
    );
    expect(isPreviewConversationCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewConversationCandidate(req("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    expect(isPreviewConversationCandidate(req("www.localley.io"))).toBe(false);
  });

  it("reads imported and fresh owner conversations with nested messages", async () => {
    const { binds } = setup([{ id: "legacy-owner", source: "legacy-fixture" },
      { id: "auth:user-a", source: "new" }], [
      { id: "conv-a", title: "Trip", created_at: "2026-01-01", updated_at: "2026-01-02",
        linked_itinerary_id: null },
    ], [{ id: "msg-a", conversation_id: "conv-a", role: "user", content: "Hello",
      created_at: "2026-01-01" }]);
    expect(await previewConversations("user-a")).toEqual({ conversations: [{
      id: "conv-a", title: "Trip", created_at: "2026-01-01", updated_at: "2026-01-02",
      linked_itinerary_id: null, messages: [{ id: "msg-a", role: "user", content: "Hello",
        created_at: "2026-01-01" }],
    }] });
    expect(binds[0].values).toEqual(["user-a", "auth:user-a"]);
    expect(binds[1].values).toEqual(["legacy-owner", "auth:user-a"]);
    expect(binds[2].values).toEqual(["legacy-owner", "auth:user-a"]);
  });

  it("returns no history for a user with no mapped or fresh owner", async () => {
    const { binds } = setup([]);
    expect(await previewConversations("user-b")).toEqual({ conversations: [] });
    expect(binds).toHaveLength(1);
  });

  it("creates a deterministic new owner before its first conversation", async () => {
    const { binds } = setup([]);
    const created = await createPreviewConversation("user-b", "New trip");
    expect(created.conversation.clerk_user_id).toBe("user-b");
    expect(created.conversation.title).toBe("New trip");
    expect(created.conversation.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(binds.find(call => call.sql.includes("INSERT OR IGNORE INTO owners"))?.values)
      .toEqual(["auth:user-b", "user-b"]);
    expect(binds.find(call => call.sql.includes("INSERT INTO conversations"))?.values[1])
      .toBe("auth:user-b");
  });

  it("uses the imported owner when present and rejects invalid titles", async () => {
    const { binds } = setup([{ id: "legacy-owner", source: "legacy-fixture" }]);
    expect((await createPreviewConversation("user-a", "")).conversation.title).toBe("New Conversation");
    expect(binds.some(call => call.sql.includes("INSERT OR IGNORE INTO owners"))).toBe(false);
    expect(binds.find(call => call.sql.includes("INSERT INTO conversations"))?.values[1])
      .toBe("legacy-owner");
    await expect(createPreviewConversation("user-a", "x".repeat(201))).rejects.toThrow(RangeError);
  });

  it("rejects a conflicting deterministic owner instead of claiming it", async () => {
    setup([{ id: "auth:user-a", source: "legacy-fixture" }]);
    await expect(previewConversations("user-a")).rejects.toThrow("Conflicting preview owner mapping");
  });
});
