import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { Errors } from "@/lib/api-errors";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { previewStoryGallery } from "@/lib/app-data/preview-story-gallery";
import { previewStorySlides } from "@/lib/app-data/preview-story-slides";
import { previewStoryBucket, previewStoryMediaKey, previewStoryMediaUrl } from "@/lib/app-data/preview-story-media";
import { createSupabaseAdmin } from "@/lib/supabase";
import { storySlideKey, storySlidePath, storySlidesBucket } from "@/lib/story-slides-r2";

const mediaHeaders = { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" };
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Production story slides in R2: the owner, or anyone for a shared itinerary, while the story is current and unexpired. */
async function productionSlide(id: string, generation: string, slide: string): Promise<Response> {
  const key = storySlideKey(id, generation, slide);
  const bucket = storySlidesBucket();
  if (!key || !bucket) return missing();
  const { data: itinerary } = await createSupabaseAdmin().from("itineraries")
    .select("story_slides, shared, clerk_user_id").eq("id", id).maybeSingle();
  if (!itinerary) return missing();
  if (itinerary.shared !== true) {
    const { userId } = await auth();
    if (!userId || itinerary.clerk_user_id !== userId) return missing();
  }
  const story = itinerary.story_slides as { expires_at?: string; slides?: Record<string, unknown> } | null;
  const url = story?.slides?.[slide];
  if (typeof url !== "string" || !url.endsWith(storySlidePath(id, generation, slide))
    || !story?.expires_at || !(Date.parse(story.expires_at) > Date.now())) return missing();
  const object = await bucket.get(key);
  if (!object) return missing();
  return new Response(new Uint8Array(await object.arrayBuffer()), {
    headers: { ...mediaHeaders, "Cache-Control": itinerary.shared === true ? "public, max-age=3600" : "private, no-store" },
  });
}

/** Serve only the current, unexpired story through its owner/public policy (preview D1 candidate or production R2). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; generation: string; slide: string }> },
) {
  if (!isPreviewStoryCandidate(req)) {
    const { id, generation, slide } = await params;
    try {
      return await productionSlide(id, generation, slide);
    } catch {
      console.error("[STORY_MEDIA] Media read failed");
      return Errors.databaseError();
    }
  }
  const { id, generation, slide } = await params;
  const key = previewStoryMediaKey(id, generation, slide);
  if (!key) return Errors.notFound("Story media");
  try {
    const { userId } = await auth();
    const fresh = req.nextUrl.searchParams.get("gallery_candidate") === "fresh";
    const gallery = fresh ? await previewStoryGallery(id, userId) : null;
    const story = fresh ? gallery && { available: !!gallery.story_slides, slides: gallery.story_slides?.slides }
      : await previewStorySlides(id, userId);
    if (!story || !("slides" in story) || !story.available || !story.slides
      || story.slides[slide] !== `${previewStoryMediaUrl(id, `r2://${key}`)}${fresh ? "&gallery_candidate=fresh" : ""}`) {
      return Errors.notFound("Story media");
    }
    const object = await previewStoryBucket().get(key);
    if (!object) return Errors.notFound("Story media");
    return new Response(new Uint8Array(await object.arrayBuffer()), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store",
        "X-Localley-Data-Source": "r2-preview", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'" },
    });
  } catch {
    console.error("[STORY_PREVIEW] Media read failed");
    return Errors.databaseError();
  }
}
