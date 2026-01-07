"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  isApiError,
  type SubscriptionStatus,
  type UserTierResponse,
  type SavedItinerary,
  type Conversation,
} from "@/lib/api-client";

// ============================================
// Query Keys
// ============================================

export const queryKeys = {
  subscription: ["subscription"] as const,
  userTier: ["user", "tier"] as const,
  savedItineraries: ["itineraries", "saved"] as const,
  itinerary: (id: string) => ["itineraries", id] as const,
  conversations: ["conversations"] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
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
