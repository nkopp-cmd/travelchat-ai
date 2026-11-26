import { getAuth } from "@/lib/auth/server";
import { anonymousGetSession } from "@/lib/auth/anonymous-session";

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
    const anonymous = anonymousGetSession(request);
    if (anonymous) return anonymous;
    try {
        return await getAuth().handler(request);
    } catch (error) {
        console.error("[auth] handler failed:", error instanceof Error ? error.message : "unknown");
        return Response.json({ error: "Auth is unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}

export const GET = handle;
export const POST = handle;
