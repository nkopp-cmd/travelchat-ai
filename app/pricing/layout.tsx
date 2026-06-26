import type { Metadata } from "next";
import { FAQJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
    title: "Pricing - Plans & Subscription | Localley",
    description: "Choose a paid Localley plan. Pro and Premium subscriptions unlock local-first trip planning, richer maps, saved itineraries, and collaboration features.",
    keywords: "localley pricing, travel app subscription, paid travel planner, pro plan, premium plan, AI travel",
    openGraph: {
        title: "Pricing Plans | Localley",
        description: "Unlock local-first trip planning, richer maps, saved itineraries, and collaboration features with Localley Pro and Premium.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Pricing Plans | Localley",
        description: "Choose the paid Localley plan that fits your travel style.",
    },
};

const faqItems = [
    {
        question: "Can I cancel anytime?",
        answer: "Yes! You can cancel your subscription at any time. You'll continue to have access until the end of your billing period.",
    },
    {
        question: "Is Localley paid only?",
        answer: "Yes. Localley offers paid Pro and Premium subscriptions so the product can focus on high-quality trip planning, richer data, and reliable AI workflows.",
    },
    {
        question: "Can I switch between plans?",
        answer: "Absolutely! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate any differences.",
    },
    {
        question: "Do you offer refunds?",
        answer: "We offer a full refund within 14 days of your first payment if you're not satisfied with Localley.",
    },
];

export default function PricingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <FAQJsonLd items={faqItems} />
            {children}
        </>
    );
}
