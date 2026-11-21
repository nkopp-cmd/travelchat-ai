"use client";

import { useEffect, useState } from "react";
import { dropPaymentParam, waitForPaidTier } from "@/lib/trips/paid-return";

// Push BY1: back from a Stripe checkout started at the planner limit (/itineraries/new?payment=success).
// Re-reads the plan a few times (the webhook can land after the browser), says what is true, drops the param.
// Never starts a checkout and never grants access: the server limit check stays the only gate.
export function PlannerPaidReturn() {
  const [state, setState] = useState<"paid" | "pending" | null>(null);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("payment") !== "success") return;
    let stopped = false;
    void waitForPaidTier(async () => {
      const response = await fetch("/api/subscription/status", { cache: "no-store" });
      return response.ok ? (await response.json()).tier : null;
    }, { stopped: () => stopped }).then((result) => {
      if (result === "stopped") return;
      dropPaymentParam();
      setState(result);
    });
    return () => { stopped = true; };
  }, []);
  if (!state) return null;
  return <p role="status" data-testid="planner-paid-return" className="mx-4 mt-3 rounded-lg bg-raised px-4 py-3 text-sm text-foreground">
    {state === "paid" ? "Pro is active. Plan your next trip." : "Payment received. Your plan updates within a minute. Reload this page if a limit still shows."}
  </p>;
}
