"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/hooks/query-keys";

/** The Stripe webhook can land after the browser returns: re-read the plan this often, then stop. */
export const SUCCESS_REFETCH_MAX = 5;
export const SUCCESS_REFETCH_DELAY_MS = 2000;

/**
 * Re-reads the subscription until it shows a paid tier, at most SUCCESS_REFETCH_MAX times,
 * SUCCESS_REFETCH_DELAY_MS apart. Returns a stop function. Never loops past the cap.
 */
export function refetchUntilPaid(
  queryClient: QueryClient,
  schedule: (run: () => void, ms: number) => unknown = setTimeout,
  onDone: (paid: boolean) => void = () => undefined,
) {
  let stopped = false;
  let runs = 0;
  const tick = async () => {
    if (stopped) return;
    runs += 1;
    await queryClient.refetchQueries({ queryKey: queryKeys.subscription }).catch(() => undefined);
    const tier = queryClient.getQueryData<{ tier?: string }>(queryKeys.subscription)?.tier;
    if (stopped) return;
    const paid = Boolean(tier && tier !== "free");
    if (paid || runs >= SUCCESS_REFETCH_MAX) { onDone(paid); return; }
    schedule(() => void tick(), SUCCESS_REFETCH_DELAY_MS);
  };
  void tick();
  return { stop: () => { stopped = true; }, runs: () => runs };
}

/**
 * Client component that handles post-checkout success.
 * Re-reads the subscription when returning from Stripe checkout.
 */
export function SubscriptionSuccessHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const loop = useRef<{ stop: () => void } | null>(null);

  // Stop only on unmount: removing ?subscription= re-runs the effect below and must not end the re-reads.
  useEffect(() => () => { loop.current?.stop(); loop.current = null; }, []);

  useEffect(() => {
    if (searchParams.get("subscription") !== "success" || loop.current) return;
    // Say "activated" only when the plan shows it; a late webhook gets an honest line instead.
    loop.current = refetchUntilPaid(queryClient, setTimeout, (paid) => toast(paid
      ? { title: "Subscription activated!", description: "Your subscription has been successfully activated. Enjoy your new features!" }
      : { title: "Payment received", description: "Your plan updates within a minute. Reload this page to see it." }));

    // Clean up URL by removing the query parameter
    const url = new URL(window.location.href);
    url.searchParams.delete("subscription");
    router.replace(url.pathname, { scroll: false });
  }, [searchParams, router, queryClient, toast]);

  // This component doesn't render anything
  return null;
}
