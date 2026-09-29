import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { parsePreviewStoryPatch, previewStoryBackgrounds, updatePreviewStoryBackgrounds } from "@/lib/app-data/preview-story-metadata";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const previewHost = "localley-next-preview.nkopp.workers.dev";
const response = (body: object, status: number) => NextResponse.json(body, { status, headers });
const allowed = (request: NextRequest) => request.nextUrl.hostname === previewHost
  && process.env.AUTH_MAIL_MODE === "outbox" && process.env.SUPABASE_READ_ONLY === "true";
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

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
  let patch: Record<string, string> | null;
  try {
    patch = parsePreviewStoryPatch(await request.json());
  } catch {
    return response({ error: "Invalid backgrounds" }, 400);
  }
  if (!patch) return response({ error: "Invalid backgrounds" }, 400);
  try {
    const backgrounds = await updatePreviewStoryBackgrounds(id, access.userId!, patch);
    return backgrounds ? response({ source: "D1 candidate", backgrounds }, 200) : response({ error: "Not found" }, 404);
  } catch {
    return response({ error: "Preview D1 not ready" }, 503);
  }
}
