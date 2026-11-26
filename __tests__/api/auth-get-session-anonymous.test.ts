import { describe, expect, it, vi } from "vitest";

const handler = vi.fn(async () => new Response('{"session":{}}', { status: 200 }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ handler }) }));

import { GET, POST } from "@/app/api/auth/[...all]/route";

describe("auth route: anonymous get-session fast path (Push DM1)", () => {
    it("answers null without Better Auth when no session cookie is sent", async () => {
        handler.mockClear();
        const res = await GET(new Request("https://www.localley.io/api/auth/get-session"));
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("null");
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(handler).not.toHaveBeenCalled();
    });

    it("ignores unrelated cookies", async () => {
        handler.mockClear();
        const res = await GET(new Request("https://www.localley.io/api/auth/get-session", { headers: { cookie: "ll_account=1; theme=dark" } }));
        expect(await res.text()).toBe("null");
        expect(handler).not.toHaveBeenCalled();
    });

    it.each(["__Secure-better-auth.session_token", "better-auth.session_token"])("passes %s to Better Auth", async (name) => {
        handler.mockClear();
        const res = await GET(new Request("https://www.localley.io/api/auth/get-session", { headers: { cookie: `${name}=abc.def` } }));
        expect(await res.text()).toBe('{"session":{}}');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("leaves other auth paths and POST to Better Auth", async () => {
        handler.mockClear();
        await GET(new Request("https://www.localley.io/api/auth/callback/google?code=x"));
        await POST(new Request("https://www.localley.io/api/auth/get-session", { method: "POST" }));
        expect(handler).toHaveBeenCalledTimes(2);
    });
});
