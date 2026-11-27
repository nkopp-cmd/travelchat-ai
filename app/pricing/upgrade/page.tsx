import type { Metadata } from "next";
import { parsePlannerLimit } from "@/lib/pricing-checkout";
import { PricingPage } from "../pricing-page";

export const metadata: Metadata = { robots: { index: false, follow: true } };

type Props = { searchParams: Promise<{ limit?: string | string[]; resets?: string | string[] }> };

export default async function PlannerUpgradePage({ searchParams }: Props) {
    const { limit, resets } = await searchParams;
    const query = new URLSearchParams();
    if (typeof limit === "string") query.set("limit", limit);
    if (typeof resets === "string") query.set("resets", resets);
    return <PricingPage plannerLimit={parsePlannerLimit(query)} />;
}
