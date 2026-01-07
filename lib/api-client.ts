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
  createdAt: string;
  updatedAt: string;
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

  // ============================================
  // Chat Endpoint
  // ============================================

  async sendChatMessage(
    messages: Array<{ role: string; content: string }>
  ): Promise<ApiResult<{ message: string }>> {
    return this.request<{ message: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export { ApiClient };
