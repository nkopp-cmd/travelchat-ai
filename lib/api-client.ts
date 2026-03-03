/**
 * Unified API Client
 *
 * Provides typed, consistent API calls with:
 * - Automatic error handling
 * - Request/response typing
 * - Centralized configuration
 */

// ============================================
// Base API Types
// ============================================

export interface ApiError {
  error: string;
  message?: string;
  code?: string;
  status: number;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T> {
  data: T;
  status: number;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return "error" in result;
}

// ============================================
// Response Types
// ============================================

export interface SubscriptionStatus {
  tier: "free" | "pro" | "premium";
  status: "active" | "canceled" | "past_due" | "trialing";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  isEarlyAdopter?: boolean;
  isBetaMode?: boolean;
}

export interface UserTierResponse {
  tier: "free" | "pro" | "premium";
  isEarlyAdopter?: boolean;
  isBetaMode?: boolean;
}

export interface UsageInfo {
  current: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

export interface Itinerary {
  id: string;
  title: string;
  subtitle?: string;
  city: string;
  days: number;
  activities: unknown[];
  localScore?: number;
  highlights?: string[];
  estimatedCost?: string;
  shared?: boolean;
  shareCode?: string;
  createdAt?: string;
}

export interface SavedItinerary extends Itinerary {
  userId: string;
}

export interface Conversation {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
  linked_itinerary_id?: string;
  messages?: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

// ============================================
// API Client Class
// ============================================

class ApiClient {
  private baseUrl: string;

  constructor() {
    // Use relative URLs for same-origin requests
    this.baseUrl = "";
  }

  /**
   * Make a typed API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          error: data.error || "Request failed",
          message: data.message,
          code: data.code,
          status: response.status,
          details: data,
        };
      }

      return {
        data: data as T,
        status: response.status,
      };
    } catch (error) {
      return {
        error: "Network error",
        message: error instanceof Error ? error.message : "Unknown error",
        status: 0,
      };
    }
  }

  // ============================================
  // Subscription Endpoints
  // ============================================

  async getSubscriptionStatus(): Promise<ApiResult<SubscriptionStatus>> {
    return this.request<SubscriptionStatus>("/api/subscription/status");
  }

  async getUserTier(): Promise<ApiResult<UserTierResponse>> {
    return this.request<UserTierResponse>("/api/user/tier");
  }

  async createCheckoutSession(params: {
    tier: "pro" | "premium";
    interval: "month" | "year";
  }): Promise<ApiResult<{ url: string }>> {
    return this.request<{ url: string }>("/api/subscription/checkout", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async createPortalSession(): Promise<ApiResult<{ url: string }>> {
    return this.request<{ url: string }>("/api/subscription/portal", {
      method: "POST",
    });
  }

  // ============================================
  // Itinerary Endpoints
  // ============================================

  async getSavedItineraries(): Promise<ApiResult<{ itineraries: SavedItinerary[] }>> {
    return this.request<{ itineraries: SavedItinerary[] }>("/api/user/saved-itineraries");
  }

  async getItinerary(id: string): Promise<ApiResult<{ itinerary: Itinerary }>> {
    return this.request<{ itinerary: Itinerary }>(`/api/itineraries/${id}`);
  }

  async deleteItinerary(id: string): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/itineraries/${id}`, {
      method: "DELETE",
    });
  }

  async duplicateItinerary(id: string): Promise<ApiResult<{ itinerary: Itinerary }>> {
    return this.request<{ itinerary: Itinerary }>(`/api/itineraries/${id}/duplicate`, {
      method: "POST",
    });
  }

  // ============================================
  // Conversation Endpoints
  // ============================================

  async getConversations(): Promise<ApiResult<{ conversations: Conversation[] }>> {
    return this.request<{ conversations: Conversation[] }>("/api/conversations");
  }

  async createConversation(title?: string): Promise<ApiResult<{ conversation: Conversation }>> {
    return this.request<{ conversation: Conversation }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async getMessages(conversationId: string): Promise<ApiResult<{ messages: Message[] }>> {
    return this.request<{ messages: Message[] }>(
      `/api/conversations/messages?conversationId=${conversationId}`
    );
  }

  async linkConversationToItinerary(
    conversationId: string,
    itineraryId: string
  ): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>("/api/conversations", {
      method: "PATCH",
      body: JSON.stringify({ conversationId, linked_itinerary_id: itineraryId }),
    });
  }

  // ============================================
  // Chat Endpoint
  // ============================================

  async sendChatMessage(
    messages: Array<{ role: string; content: string }>,
    city?: string
  ): Promise<ApiResult<{ message: string }>> {
    return this.request<{ message: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages, ...(city && { city }) }),
    });
  }

  // ============================================
  // Itinerary Mutations
  // ============================================

  async updateItinerary(
    id: string,
    data: { title?: string; days?: unknown }
  ): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/itineraries/${id}/update`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async shareItinerary(
    id: string,
    action: "create" | "revoke"
  ): Promise<ApiResult<{ shareCode?: string; shareUrl?: string; success?: boolean }>> {
    return this.request<{ shareCode?: string; shareUrl?: string; success?: boolean }>(
      `/api/itineraries/${id}/share`,
      {
        method: "POST",
        body: JSON.stringify({ action }),
      }
    );
  }

  async emailItinerary(
    id: string,
    email: string
  ): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/itineraries/${id}/email`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async likeItinerary(id: string): Promise<ApiResult<{ liked: boolean; likeCount: number }>> {
    return this.request<{ liked: boolean; likeCount: number }>(`/api/itineraries/${id}/like`, {
      method: "POST",
    });
  }

  async getLikeStatus(id: string): Promise<ApiResult<{ liked: boolean; likeCount: number }>> {
    return this.request<{ liked: boolean; likeCount: number }>(`/api/itineraries/${id}/like`);
  }

  async saveItinerary(data: {
    title: string;
    city: string;
    days: number;
    activities: unknown;
    highlights?: string[];
    localScore?: number;
    estimatedCost?: string;
  }): Promise<ApiResult<{ itinerary: Itinerary }>> {
    return this.request<{ itinerary: Itinerary }>("/api/itineraries/save", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async reviseItinerary(
    id: string,
    revisionRequest: string
  ): Promise<ApiResult<{ itinerary: Itinerary }>> {
    return this.request<{ itinerary: Itinerary }>(`/api/itineraries/${id}/revise`, {
      method: "POST",
      body: JSON.stringify({ revisionRequest }),
    });
  }

  // ============================================
  // Spots Endpoints
  // ============================================

  async getSavedSpotStatus(spotId: string): Promise<ApiResult<{ isSaved: boolean }>> {
    return this.request<{ isSaved: boolean }>(`/api/spots/save?spotId=${spotId}`);
  }

  async toggleSaveSpot(
    spotId: string,
    spotData?: { name: string; city: string }
  ): Promise<ApiResult<{ saved: boolean }>> {
    return this.request<{ saved: boolean }>("/api/spots/save", {
      method: "POST",
      body: JSON.stringify({ spotId, ...spotData }),
    });
  }

  async getSpotReviews(
    spotId: string,
    sort?: string
  ): Promise<ApiResult<{ reviews: unknown[]; averageRating: number; totalReviews: number }>> {
    const url = sort ? `/api/spots/${spotId}/reviews?sort=${sort}` : `/api/spots/${spotId}/reviews`;
    return this.request<{ reviews: unknown[]; averageRating: number; totalReviews: number }>(url);
  }

  async submitSpotReview(
    spotId: string,
    data: { rating: number; text?: string; visitDate?: string }
  ): Promise<ApiResult<{ review: unknown }>> {
    return this.request<{ review: unknown }>(`/api/spots/${spotId}/reviews`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteSpotReview(
    spotId: string,
    reviewId: string
  ): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/spots/${spotId}/reviews/${reviewId}`, {
      method: "DELETE",
    });
  }

  async markReviewHelpful(
    spotId: string,
    reviewId: string
  ): Promise<ApiResult<{ helpfulCount: number }>> {
    return this.request<{ helpfulCount: number }>(
      `/api/spots/${spotId}/reviews/${reviewId}/helpful`,
      { method: "POST" }
    );
  }

  // ============================================
  // User Preferences
  // ============================================

  async getEmailPreferences(): Promise<ApiResult<{ preferences: Record<string, boolean> }>> {
    return this.request<{ preferences: Record<string, boolean> }>("/api/user/email-preferences");
  }

  async updateEmailPreferences(
    preferences: Record<string, boolean>
  ): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>("/api/user/email-preferences", {
      method: "POST",
      body: JSON.stringify(preferences),
    });
  }

  // ============================================
  // Recommendations
  // ============================================

  async getRecommendations(limit?: number): Promise<ApiResult<{ recommendations: unknown[] }>> {
    const url = limit ? `/api/recommendations?limit=${limit}` : "/api/recommendations";
    return this.request<{ recommendations: unknown[] }>(url);
  }

  // ============================================
  // Viator Activities
  // ============================================

  async searchViatorActivities(params: {
    city: string;
    query?: string;
    limit?: number;
  }): Promise<ApiResult<{ activities: unknown[] }>> {
    const searchParams = new URLSearchParams({ city: params.city });
    if (params.query) searchParams.set("query", params.query);
    if (params.limit) searchParams.set("limit", params.limit.toString());
    return this.request<{ activities: unknown[] }>(`/api/viator/search?${searchParams}`);
  }

  async trackAffiliateClick(data: {
    provider: string;
    productId: string;
    productName: string;
    city?: string;
  }): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>("/api/affiliates/track", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Gamification
  // ============================================

  async awardPoints(data: {
    action: string;
    amount: number;
    metadata?: Record<string, unknown>;
  }): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>("/api/gamification/award", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Geocoding
  // ============================================

  async geocodeAddress(address: string): Promise<ApiResult<{ lat: number; lng: number }>> {
    return this.request<{ lat: number; lng: number }>(
      `/api/geocode?address=${encodeURIComponent(address)}`
    );
  }

  // ============================================
  // Story Images
  // ============================================

  async getStoryBackgrounds(): Promise<ApiResult<{ backgrounds: string[] }>> {
    return this.request<{ backgrounds: string[] }>("/api/images/story-background");
  }

  async generateStoryBackground(prompt: string): Promise<ApiResult<{ url: string }>> {
    return this.request<{ url: string }>("/api/images/story-background", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  }

  async saveAiBackgrounds(
    itineraryId: string,
    backgrounds: string[]
  ): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(`/api/itineraries/${itineraryId}/ai-backgrounds`, {
      method: "POST",
      body: JSON.stringify({ backgrounds }),
    });
  }

  // ============================================
  // Conversations - Save Messages
  // ============================================

  async saveMessage(
    conversationId: string,
    role: string,
    content: string
  ): Promise<ApiResult<{ message: Message }>> {
    return this.request<{ message: Message }>("/api/conversations/messages", {
      method: "POST",
      body: JSON.stringify({ conversationId, role, content }),
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export { ApiClient };
