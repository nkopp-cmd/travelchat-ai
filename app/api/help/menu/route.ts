import { NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/lib/app-data/backend";
import { auth } from "@/lib/auth/server";
import { MENU_MAX_IMAGE_BYTES, MENU_MODEL, menuRequestBody, parseMenuImage, parseMenuResponse, type MenuResult } from "@/lib/help/menu";
import { releaseMenuScan, reserveMenuScan } from "@/lib/help/menu-quota";
import { rateLimit, strictPlatformLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const developmentLimit = rateLimit({ windowMs: 60_000, maxRequests: 10 });
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MENU_MODEL}:generateContent`;

export type MenuApiResponse =
  | { status: "ok"; result: MenuResult; remaining: number }
  | { status: "signin" | "limit" | "busy" | "bad_image" | "unreadable" | "unavailable" };

const reply = (body: MenuApiResponse, status = 200) => NextResponse.json(body, { status, headers });

/** Menu photo -> dishes in English (helper 2). Signed-in only; per-IP, per-user and global daily caps. */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const verdict = await strictPlatformLimit(req, 10, "help_menu");
    if (verdict === "unavailable") return reply({ status: "unavailable" }, 503);
    if (verdict === "limited") return reply({ status: "busy" }, 429);
  } else {
    const limited = await developmentLimit(req);
    if (limited) return reply({ status: "busy" }, 429);
  }
  const { userId } = await auth();
  if (!userId) return reply({ status: "signin" }, 401);
  const key = process.env.GEMINI_API_KEY;
  if (!key || dataBackend() !== "d1") return reply({ status: "unavailable" }, 503);

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > Math.ceil(MENU_MAX_IMAGE_BYTES / 3) * 4 + 1024) return reply({ status: "bad_image" }, 413);
  let image;
  try {
    image = parseMenuImage(((await req.json()) as { image?: unknown })?.image);
  } catch {
    image = null;
  }
  if (!image) return reply({ status: "bad_image" }, 400);

  const quota = await reserveMenuScan(userId);
  if (quota.status === "unavailable") return reply({ status: "unavailable" }, 503);
  if (quota.status !== "ok") return reply({ status: "limit" }, 429);

  let result: MenuResult | null = null;
  try {
    const upstream = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(menuRequestBody(image)),
      signal: AbortSignal.timeout(30_000),
    });
    if (upstream.ok) result = parseMenuResponse(await upstream.json());
    else console.error("[help-menu] upstream status", upstream.status);
  } catch (error) {
    console.error("[help-menu] upstream failed:", error instanceof Error ? error.name : "unknown");
  }
  if (!result) {
    await releaseMenuScan(userId);
    return reply({ status: "unavailable" }, 502);
  }
  if (result.dishes.length === 0) return reply({ status: "unreadable" });
  return reply({ status: "ok", result, remaining: quota.remaining });
}
