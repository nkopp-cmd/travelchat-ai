// Kept apart from use-queries.ts so importing the keys does not bundle lib/api-client
// (every endpoint) into the root SubscriptionProvider on public pages.

// ============================================
// Query Keys
// ============================================

export const queryKeys = {
  subscription: ["subscription", "status"] as const,
  userTier: ["user", "tier"] as const,
  savedItineraries: ["itineraries", "saved"] as const,
  itinerary: (id: string) => ["itineraries", id] as const,
  itineraryLike: (id: string) => ["itineraries", id, "like"] as const,
  conversations: ["conversations"] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  spotSaved: (spotId: string) => ["spots", spotId, "saved"] as const,
  spotReviews: (spotId: string) => ["spots", spotId, "reviews"] as const,
  emailPreferences: ["user", "emailPreferences"] as const,
  recommendations: ["recommendations"] as const,
  viatorActivities: (city: string, query?: string) => ["viator", city, query] as const,
  storyBackgrounds: ["story", "backgrounds"] as const,
} as const;
