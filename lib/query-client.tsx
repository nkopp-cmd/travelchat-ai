"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Default configuration for React Query
 *
 * - staleTime: 60 seconds - data is considered fresh for this duration
 * - gcTime: 5 minutes - unused data is garbage collected after this
 * - retry: 1 attempt on failure (exponential backoff)
 * - refetchOnWindowFocus: disabled to prevent excessive fetching
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0, // Don't retry mutations
      },
    },
  });
}

// Singleton for server-side rendering
let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: reuse query client
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
  }
}

/**
 * QueryClientProvider wrapper for the app
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * Get query client for use in server components or outside React tree
 */
export { getQueryClient };
