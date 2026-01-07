"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

/**
 * Client component that handles post-checkout success.
 * Invalidates subscription cache when returning from Stripe checkout.
 */
export function SubscriptionSuccessHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const subscriptionParam = searchParams.get("subscription");

    if (subscriptionParam === "success") {
      // Invalidate subscription cache to fetch fresh data
      queryClient.invalidateQueries({ queryKey: ["subscription"] });

      // Show success toast
      toast({
        title: "Subscription activated!",
        description: "Your subscription has been successfully activated. Enjoy your new features!",
      });

      // Clean up URL by removing the query parameter
      const url = new URL(window.location.href);
      url.searchParams.delete("subscription");
      router.replace(url.pathname, { scroll: false });
    }
  }, [searchParams, router, queryClient, toast]);

  // This component doesn't render anything
  return null;
}
