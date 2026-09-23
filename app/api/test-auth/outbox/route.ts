import { NextRequest, NextResponse } from "next/server";
import { authMailMode, isProductionAuthHost, TEST_EMAIL_DOMAIN } from "@/lib/auth/mail";

/**
 * Test mailbox for agents (preview Worker and local dev only).
 *
 * GET /api/test-auth/outbox?email=<addr>@preview.localley.test
 * -> { messages: [{ kind, url, createdAt }] } newest first.
 *
 * Exists only when AUTH_MAIL_MODE=outbox. Production sends through Resend and
 * this route returns 404. Only the reserved test domain is readable, so a real
 * address typed into the preview never exposes its link here.
 */
export const dynamic = "force-dynamic";


const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

interface OutboxRow { kind: string; url: string; createdAt: number }
interface D1Like {
    prepare(query: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> } };
}

export async function GET(request: NextRequest) {
    // Two independent gates: mail mode (which already refuses production BETTER_AUTH_URL)
    // and the host this request arrived on.
    if (authMailMode() !== "outbox" || isProductionAuthHost(request.url)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const email = (request.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
    if (!email.endsWith(`@${TEST_EMAIL_DOMAIN}`) || email.length > 200) {
        return NextResponse.json({ error: `Only @${TEST_EMAIL_DOMAIN} addresses are readable` }, { status: 400 });
    }
    const context = (globalThis as Record<symbol, { env?: { AUTH_DB?: D1Like } } | undefined>)[cloudflareContextSymbol];
    const db = context?.env?.AUTH_DB;
    if (!db) return NextResponse.json({ error: "AUTH_DB binding is not configured" }, { status: 503 });
    const { results } = await db
        .prepare('select "kind", "url", "createdAt" from "auth_mail_outbox" where "email" = ? order by "id" desc limit 20')
        .bind(email)
        .all<OutboxRow>();
    return NextResponse.json({ messages: results }, { headers: { "Cache-Control": "no-store" } });
}
