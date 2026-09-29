import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), supabase: vi.fn(), read: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.supabase }));
vi.mock("@/lib/app-data/preview-conversations", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-conversations")>(),
  previewConversations: mocks.read, createPreviewConversation: mocks.create,
}));
import { GET, POST } from "@/app/api/conversations/route";

const environment = process.env;
const preview = "localley-next-preview.nkopp.workers.dev";
const request = (host: string, method: "GET" | "POST", flag = true) => new NextRequest(
  `https://${host}/api/conversations${flag ? "?data_candidate=d1" : ""}`,
  method === "POST" ? { method, body: JSON.stringify({ title: "New trip" }) } : { method },
);
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("conversation repository candidate route", () => {
  it("requires a signed-in user before D1", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request(preview, "GET"))).status).toBe(401);
    expect((await POST(request(preview, "POST"))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reads and creates only in preview D1 with the server-authenticated ID", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    mocks.read.mockResolvedValue({ conversations: [] });
    mocks.create.mockResolvedValue({ conversation: { id: "conv-a", title: "New trip" } });
    const read = await GET(request(preview, "GET"));
    const write = await POST(request(preview, "POST"));
    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(read.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(write.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.read).toHaveBeenCalledWith("user-a");
    expect(mocks.create).toHaveBeenCalledWith("user-a", "New trip");
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.supabase.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
    expect((await GET(request(preview, "GET", false))).status).toBe(200);
    expect((await GET(request("www.localley.io", "GET"))).status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
