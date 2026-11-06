import type { Metadata } from "next";
import { QueryProvider } from "@/lib/query-client";
import { BreadcrumbJsonLd, JsonLd } from "@/components/seo/json-ld";
import { pageMeta, SITE_URL } from "@/lib/seo/meta";
import { TIER_CONFIGS } from "@/lib/subscription";

export const metadata: Metadata = {
    ...pageMeta({
        title: "Pricing - Pro and Premium plans",
        socialTitle: "Localley pricing",
        description: `Localley Pro costs $${TIER_CONFIGS.pro.price} a month or $${TIER_CONFIGS.pro.yearlyPrice} a year; Premium $${TIER_CONFIGS.premium.price} a month. Local-first trip plans, richer maps, saved routes.`,
        path: "/pricing",
    }),
    keywords: "localley pricing, travel app subscription, paid travel planner, pro plan, premium plan, AI travel",
};

// The plans the page shows, as schema.org offers (prices from TIER_CONFIGS, the same source as the page).
const offers = (["pro", "premium"] as const).flatMap((tier) => {
    const plan = TIER_CONFIGS[tier];
    return [
        { name: `${plan.name} monthly`, price: plan.price, unitText: "MONTH" },
        { name: `${plan.name} yearly`, price: plan.yearlyPrice, unitText: "ANN" },
    ].map((offer) => ({
        "@type": "Offer",
        name: offer.name,
        price: offer.price,
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/pricing`,
        priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: offer.price,
            priceCurrency: "USD",
            unitText: offer.unitText,
        },
    }));
});

const pricingJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Localley subscription",
    serviceType: "Travel planning app",
    provider: { "@type": "Organization", name: "Localley", url: SITE_URL },
    areaServed: ["KR", "JP", "TH", "VN", "TW", "SG"],
    url: `${SITE_URL}/pricing`,
    offers,
};

export default function PricingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <JsonLd data={pricingJsonLd} />
            <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Pricing", url: "/pricing" }]} />
            <QueryProvider>{children}</QueryProvider>
        </>
    );
}
