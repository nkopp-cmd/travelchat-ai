import type { Metadata } from "next";
import { FAQJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
    title: "Pricing - Plans & Subscription | Localley",
    description: "Choose your Localley plan. Free, Pro, and Premium tiers with AI-generated images, unlimited itineraries, and exclusive travel features.",
    keywords: "localley pricing, travel app subscription, pro plan, premium plan, AI travel",
    openGraph: {
        title: "Pricing Plans | Localley",
        description: "Unlock AI-generated images, unlimited itineraries, and exclusive travel deals with Localley Pro and Premium.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Pricing Plans | Localley",
        description: "Unlock AI-generated images, unlimited itineraries, and exclusive travel deals.",
    },
};

const faqItems = [
    {
        question: "Can I cancel anytime?",
        answer: "Yes! You can cancel your subscription at any time. You'll continue to have access until the end of your billing period.",
    },
    {
        question: "What happens after my trial ends?",
        answer: "After your 7-day free trial, you'll be automatically charged for the Pro plan. You can cancel anytime during the trial to avoid charges.",
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
