import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { Errors } from "@/lib/api-errors";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { previewStoryGallery } from "@/lib/app-data/preview-story-gallery";
import { previewStorySlides } from "@/lib/app-data/preview-story-slides";
import { previewStoryBucket, previewStoryMediaKey, previewStoryMediaUrl } from "@/lib/app-data/preview-story-media";

/** Serve only the current, unexpired preview story through its owner/public policy. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; generation: string; slide: string }> },
) {
  if (!isPreviewStoryCandidate(req)) return Errors.notFound("Story media");
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
