import "server-only";
import { currentUser } from "@/lib/auth/server";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";
import { previewStoryMediaUrl } from "./preview-story-media";

interface GalleryRow { id: string; title: string; city: string; days: number; storySlides: string | null }
export interface PreviewStoryGallery {
  id: string; title: string; city: string; days: number;
  story_slides: { slides: Record<string, string> } | null;
  expired: boolean;
}

/** Fresh, verified preview owners only. Public flags never grant access to this private gallery. */
export async function previewStoryGallery(id: string, userId: string | null): Promise<PreviewStoryGallery | null> {
  if (!userId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) return null;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) return null;
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId)) return null;
  const row = await previewAppDataReader().prepare(`SELECT i.id, i.title, i.city, i.days, m.storySlides
    FROM itineraries i JOIN owners o ON o.id = i.ownerId
    LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id
    WHERE i.id = ? AND i.ownerId = ? AND o.source = 'new'
      AND NOT EXISTS (SELECT 1 FROM legacy_owners l WHERE l.clerkUserId = ? OR l.ownerId = o.id)`)
    .bind(id, owners.fresh, userId).first<GalleryRow>();
  if (!row) return null;
  if (row.id !== id || typeof row.title !== "string" || !row.title || row.title.length > 200
    || typeof row.city !== "string" || !row.city || row.city.length > 100
    || !Number.isSafeInteger(row.days) || row.days < 1 || row.days > 30) throw new Error("Invalid preview gallery");
  const result = { id, title: row.title, city: row.city, days: row.days, story_slides: null, expired: false };
  if (row.storySlides === null) return result;
  if (typeof row.storySlides !== "string" || row.storySlides.length > 16384) throw new Error("Invalid preview slides");
  const story = JSON.parse(row.storySlides) as Record<string, unknown>;
  if (!story || typeof story !== "object" || Array.isArray(story)
    || typeof story.generated_at !== "string" || !Number.isFinite(Date.parse(story.generated_at))
    || typeof story.expires_at !== "string" || !Number.isFinite(Date.parse(story.expires_at))
    || Date.parse(story.generated_at) > Date.parse(story.expires_at)
    || !["free", "pro", "premium"].includes(String(story.tier))
    || !story.slides || typeof story.slides !== "object" || Array.isArray(story.slides)) throw new Error("Invalid preview slides");
  const entries = Object.entries(story.slides);
  if (entries.length > 32 || entries.some(([key, source]) =>
    !/^(cover|summary|day(?:[1-9]|[12]\d|30))$/.test(key)
    || (key.startsWith("day") && Number(key.slice(3)) > row.days)
    || typeof source !== "string" || source.length > 256 || !source.startsWith("r2://")
    || !source.endsWith(`/${key}.png`))) throw new Error("Invalid preview slide reference");
  // Reject source URLs and foreign keys before publishing any metadata or media links.
  const slides = Object.fromEntries(entries.map(([key, source]) =>
    [key, `${previewStoryMediaUrl(id, source as string)}&gallery_candidate=fresh`]));
  const expired = Date.parse(story.expires_at) <= Date.now();
  return { ...result, expired, story_slides: expired || !entries.length ? null : { slides } };
}
