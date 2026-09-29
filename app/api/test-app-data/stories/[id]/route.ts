import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { previewStoryBackgrounds, updatePreviewStoryBackgrounds } from "@/lib/app-data/preview-story-metadata";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const previewHost = "localley-next-preview.nkopp.workers.dev";
const response = (body: object, status: number) => NextResponse.json(body, { status, headers });
const allowed = (request: NextRequest) => request.nextUrl.hostname === previewHost
  && process.env.AUTH_MAIL_MODE === "outbox" && process.env.SUPABASE_READ_ONLY === "true";
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const imageHosts = ["unsplash.com", "pexels.com", "supabase.co", "tripadvisor.com", "fal.media",
  "fal.run", "googleusercontent.com", "googleapis.com"];
function validImage(value: string) {
  if (value.startsWith("/images/")) return !value.split("/").includes("..");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && imageHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

async function caller(request: NextRequest, id: string) {
  if (!allowed(request)) return { failure: response({ error: "Not found" }, 404) };
  const { userId } = await auth();
  if (!userId) return { failure: response({ error: "Unauthorized" }, 401) };
  if (!validId(id)) return { failure: response({ error: "Invalid id" }, 400) };
  return { userId };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await caller(request, id);
  if (access.failure) return access.failure;
  try {
    const backgrounds = await previewStoryBackgrounds(id, access.userId!);
    return backgrounds ? response({ source: "D1 candidate", backgrounds }, 200) : response({ error: "Not found" }, 404);
  } catch {
    return response({ error: "Preview D1 not ready" }, 503);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await caller(request, id);
  if (access.failure) return access.failure;
  let patch: Record<string, string>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("body");
    patch = body as Record<string, string>;
    const entries = Object.entries(patch);
    if (!entries.length || entries.length > 32 || entries.some(([key, value]) => {
      if (!/^(cover|summary|day(?:[1-9]|[12]\d|30))$/.test(key) || typeof value !== "string" || value.length > 2048) return true;
      return !validImage(value);
    })) throw new Error("fields");
  } catch {
    return response({ error: "Invalid backgrounds" }, 400);
  }
  try {
    const backgrounds = await updatePreviewStoryBackgrounds(id, access.userId!, patch);
    return backgrounds ? response({ source: "D1 candidate", backgrounds }, 200) : response({ error: "Not found" }, 404);
  } catch {
    return response({ error: "Preview D1 not ready" }, 503);
  }
}
