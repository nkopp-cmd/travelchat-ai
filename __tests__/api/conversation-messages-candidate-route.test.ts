import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), supabase: vi.fn(), read: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.supabase }));
vi.mock("@/lib/app-data/preview-conversations", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-conversations")>(),
  previewConversationMessages: mocks.read, createPreviewConversationMessage: mocks.create,
}));
import { GET, POST } from "@/app/api/conversations/messages/route";

const environment = process.env;
const preview = "localley-next-preview.nkopp.workers.dev";
const id = "11111111-1111-4111-8111-111111111111";
const request = (host: string, method: "GET" | "POST", flag = true) => new NextRequest(
  `https://${host}/api/conversations/messages?conversationId=${id}${flag ? "&data_candidate=d1" : ""}`,
  method === "POST" ? { method, body: JSON.stringify({ conversationId: id, role: "user", content: "Hello" }) } : { method },
);
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("conversation message candidate route", () => {
  it("requires auth and denies another user's conversation", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "user-b" });
    expect((await GET(request(preview, "GET"))).status).toBe(401);
    mocks.read.mockResolvedValue(null);
    mocks.create.mockResolvedValue(null);
    expect((await GET(request(preview, "GET"))).status).toBe(404);
    expect((await POST(request(preview, "POST"))).status).toBe(404);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("reads and writes D1 only on the exact preview candidate", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    mocks.read.mockResolvedValue({ messages: [] });
    mocks.create.mockResolvedValue({ message: { id: "message-a", conversation_id: id,
      role: "user", content: "Hello" } });
    const read = await GET(request(preview, "GET"));
    const write = await POST(request(preview, "POST"));
    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(read.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(write.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.read).toHaveBeenCalledWith("user-a", id);
    expect(mocks.create).toHaveBeenCalledWith("user-a", id, "user", "Hello");
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www GET on Supabase", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    const owned = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id }, error: null }) };
    const messages = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.supabase.mockResolvedValue({ from: (table: string) => table === "conversations" ? owned : messages });
    expect((await GET(request(preview, "GET", false))).status).toBe(200);
    expect((await GET(request("www.localley.io", "GET"))).status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
