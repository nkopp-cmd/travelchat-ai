// The normal itinerary API and story renderer already use owner-or-published access.
// Unlisted share links keep their separate share-code route and explicit shared check.
export function canReadSourceItinerary(
  itinerary: { clerk_user_id?: unknown; is_public?: unknown },
  viewerId: string | null | undefined,
): boolean {
  return itinerary.is_public === true ||
    (typeof viewerId === 'string' && viewerId.length > 0 && itinerary.clerk_user_id === viewerId);
}
