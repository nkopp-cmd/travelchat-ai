import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
    title: "Discover Hidden Gems & Local Spots | Localley",
    description: "Explore hidden gems and local favorites in Seoul, Tokyo, Bangkok, and Singapore. Find the best cafes, restaurants, bars, and attractions rated by the Localley Score.",
    keywords: "hidden gems, local spots, Seoul restaurants, Tokyo cafes, Bangkok bars, Singapore attractions, local favorites, travel guide",
    openGraph: {
        title: "Discover Hidden Gems | Localley",
        description: "Explore local favorites and hidden gems across Asia. Filter by city, category, and Localley Score.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Discover Hidden Gems | Localley",
        description: "Explore local favorites and hidden gems across Asia. Filter by city, category, and Localley Score.",
    },
};

export default function SpotsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                {children}
            </main>
        </div>
    );
}
