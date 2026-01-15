"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, isApiError } from "@/lib/api-client";

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

// ============================================
// Subscription Queries
// ============================================

/**
 * Hook to fetch subscription status with caching.
 *
 * - Stale time: 2 minutes (subscription rarely changes)
 * - Automatically refetches on mount if stale
 */
export function useSubscriptionStatus() {
  return useQuery({
    queryKey: queryKeys.subscription,
    queryFn: async () => {
      const result = await apiClient.getSubscriptionStatus();
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch just the user tier.
 * Lighter weight than full subscription status.
 */
export function useUserTier() {
  return useQuery({
    queryKey: queryKeys.userTier,
    queryFn: async () => {
      const result = await apiClient.getUserTier();
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to invalidate subscription data (call after checkout return)
 */
export function useInvalidateSubscription() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
    queryClient.invalidateQueries({ queryKey: queryKeys.userTier });
  };
}

// ============================================
// Checkout Mutations
// ============================================

export function useCreateCheckout() {
  return useMutation({
    mutationFn: async (params: { tier: "pro" | "premium"; interval: "month" | "year" }) => {
      const result = await apiClient.createCheckoutSession(params);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.createPortalSession();
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}

// ============================================
// Itinerary Queries
// ============================================

/**
 * Hook to fetch saved itineraries with caching.
 */
export function useSavedItineraries() {
  return useQuery({
    queryKey: queryKeys.savedItineraries,
    queryFn: async () => {
      const result = await apiClient.getSavedItineraries();
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.itineraries;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single itinerary.
 */
export function useItinerary(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.itinerary(id),
    queryFn: async () => {
      const result = await apiClient.getItinerary(id);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.itinerary;
    },
    enabled: options?.enabled ?? true,
  });
}

/**
 * Hook to delete an itinerary.
 */
export function useDeleteItinerary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.deleteItinerary(id);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItineraries });
      queryClient.removeQueries({ queryKey: queryKeys.itinerary(id) });
    },
  });
}

/**
 * Hook to duplicate an itinerary.
 */
export function useDuplicateItinerary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.duplicateItinerary(id);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.itinerary;
    },
    onSuccess: () => {
      // Refresh saved itineraries list
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItineraries });
    },
  });
}

// ============================================
// Conversation Queries
// ============================================

/**
 * Hook to fetch conversations.
 */
export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => {
      const result = await apiClient.getConversations();
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.conversations;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to create a new conversation.
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title?: string) => {
      const result = await apiClient.createConversation(title);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

/**
 * Hook to fetch messages for a conversation.
 */
export function useMessages(conversationId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: async () => {
      const result = await apiClient.getMessages(conversationId);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.messages;
    },
    enabled: options?.enabled ?? !!conversationId,
  });
}

// ============================================
// Chat Mutation
// ============================================

/**
 * Hook to send a chat message.
 */
export function useSendChatMessage() {
  return useMutation({
    mutationFn: async (messages: Array<{ role: string; content: string }>) => {
      const result = await apiClient.sendChatMessage(messages);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

/**
 * Hook to save a message to a conversation.
 */
export function useSaveMessage() {
  return useMutation({
    mutationFn: async (params: { conversationId: string; role: string; content: string }) => {
      const result = await apiClient.saveMessage(params.conversationId, params.role, params.content);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

/**
 * Hook to revise an itinerary.
 */
export function useReviseItinerary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; revisionRequest: string }) => {
      const result = await apiClient.reviseItinerary(params.id, params.revisionRequest);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.itinerary;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItineraries });
    },
  });
}

// ============================================
// Itinerary Mutations
// ============================================

/**
 * Hook to update an itinerary.
 */
export function useUpdateItinerary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; data: { title?: string; days?: unknown } }) => {
      const result = await apiClient.updateItinerary(params.id, params.data);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itinerary(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItineraries });
    },
  });
}

/**
 * Hook to share an itinerary.
 */
export function useShareItinerary() {
  return useMutation({
    mutationFn: async (params: { id: string; action: "create" | "revoke" }) => {
      const result = await apiClient.shareItinerary(params.id, params.action);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

/**
 * Hook to email an itinerary.
 */
export function useEmailItinerary() {
  return useMutation({
    mutationFn: async (params: { id: string; email: string }) => {
      const result = await apiClient.emailItinerary(params.id, params.email);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

/**
 * Hook to get like status.
 */
export function useLikeStatus(itineraryId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.itineraryLike(itineraryId),
    queryFn: async () => {
      const result = await apiClient.getLikeStatus(itineraryId);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    enabled: options?.enabled ?? true,
  });
}

/**
 * Hook to toggle like on an itinerary.
 */
export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itineraryId: string) => {
      const result = await apiClient.likeItinerary(itineraryId);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (data, itineraryId) => {
      queryClient.setQueryData(queryKeys.itineraryLike(itineraryId), data);
    },
  });
}

/**
 * Hook to save an itinerary.
 */
export function useSaveItinerary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      city: string;
      days: number;
      activities: unknown;
      highlights?: string[];
      localScore?: number;
      estimatedCost?: string;
    }) => {
      const result = await apiClient.saveItinerary(data);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.itinerary;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItineraries });
    },
  });
}

// ============================================
// Spot Queries & Mutations
// ============================================

/**
 * Hook to check if a spot is saved.
 */
export function useSpotSavedStatus(spotId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.spotSaved(spotId),
    queryFn: async () => {
      const result = await apiClient.getSavedSpotStatus(spotId);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    enabled: options?.enabled ?? !!spotId,
  });
}

/**
 * Hook to toggle save status on a spot.
 */
export function useToggleSaveSpot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { spotId: string; spotData?: { name: string; city: string } }) => {
      const result = await apiClient.toggleSaveSpot(params.spotId, params.spotData);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.spotSaved(variables.spotId), { isSaved: data.saved });
    },
  });
}

/**
 * Hook to get spot reviews.
 */
export function useSpotReviews(spotId: string, sort?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.spotReviews(spotId), sort],
    queryFn: async () => {
      const result = await apiClient.getSpotReviews(spotId, sort);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    enabled: options?.enabled ?? !!spotId,
  });
}

/**
 * Hook to submit a spot review.
 */
export function useSubmitSpotReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      spotId: string;
      data: { rating: number; text?: string; visitDate?: string };
    }) => {
      const result = await apiClient.submitSpotReview(params.spotId, params.data);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.spotReviews(variables.spotId) });
    },
  });
}

/**
 * Hook to delete a spot review.
 */
export function useDeleteSpotReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { spotId: string; reviewId: string }) => {
      const result = await apiClient.deleteSpotReview(params.spotId, params.reviewId);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.spotReviews(variables.spotId) });
    },
  });
}

/**
 * Hook to mark a review as helpful.
 */
export function useMarkReviewHelpful() {
  return useMutation({
    mutationFn: async (params: { spotId: string; reviewId: string }) => {
      const result = await apiClient.markReviewHelpful(params.spotId, params.reviewId);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

// ============================================
// User Preferences
// ============================================

/**
 * Hook to get email preferences.
 */
export function useEmailPreferences() {
  return useQuery({
    queryKey: queryKeys.emailPreferences,
    queryFn: async () => {
      const result = await apiClient.getEmailPreferences();
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.preferences;
    },
  });
}

/**
 * Hook to update email preferences.
 */
export function useUpdateEmailPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: Record<string, boolean>) => {
      const result = await apiClient.updateEmailPreferences(preferences);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emailPreferences });
    },
  });
}

// ============================================
// Recommendations
// ============================================

/**
 * Hook to get recommendations.
 */
export function useRecommendations(limit?: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.recommendations, limit],
    queryFn: async () => {
      const result = await apiClient.getRecommendations(limit);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.recommendations;
    },
    enabled: options?.enabled ?? true,
  });
}

// ============================================
// Viator Activities
// ============================================

/**
 * Hook to search Viator activities.
 */
export function useViatorActivities(
  params: { city: string; query?: string; limit?: number },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.viatorActivities(params.city, params.query),
    queryFn: async () => {
      const result = await apiClient.searchViatorActivities(params);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.activities;
    },
    enabled: options?.enabled ?? !!params.city,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to track affiliate clicks.
 */
export function useTrackAffiliateClick() {
  return useMutation({
    mutationFn: async (data: {
      provider: string;
      productId: string;
      productName: string;
      city?: string;
    }) => {
      const result = await apiClient.trackAffiliateClick(data);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

// ============================================
// Gamification
// ============================================

/**
 * Hook to award points.
 */
export function useAwardPoints() {
  return useMutation({
    mutationFn: async (data: { action: string; amount: number; metadata?: Record<string, unknown> }) => {
      const result = await apiClient.awardPoints(data);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

// ============================================
// Story Images
// ============================================

/**
 * Hook to get story backgrounds.
 */
export function useStoryBackgrounds(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.storyBackgrounds,
    queryFn: async () => {
      const result = await apiClient.getStoryBackgrounds();
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data.backgrounds;
    },
    enabled: options?.enabled ?? true,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to generate a story background.
 */
export function useGenerateStoryBackground() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prompt: string) => {
      const result = await apiClient.generateStoryBackground(prompt);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storyBackgrounds });
    },
  });
}

/**
 * Hook to save AI backgrounds.
 */
export function useSaveAiBackgrounds() {
  return useMutation({
    mutationFn: async (params: { itineraryId: string; backgrounds: string[] }) => {
      const result = await apiClient.saveAiBackgrounds(params.itineraryId, params.backgrounds);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}

// ============================================
// Geocoding
// ============================================

/**
 * Hook to geocode an address.
 */
export function useGeocode() {
  return useMutation({
    mutationFn: async (address: string) => {
      const result = await apiClient.geocodeAddress(address);
      if (isApiError(result)) {
        throw new Error(result.message || result.error);
      }
      return result.data;
    },
  });
}
