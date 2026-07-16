import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppBackground } from "@/components/layout/app-background";
import { SpotQualityWorkbench } from "@/components/admin/spot-quality-workbench";

export const metadata: Metadata = {
    title: "Spot Quality Queue | Localley Admin",
    description: "Admin queue for Localley spot image, location, and place identity enrichment.",
};

export default function AdminSpotQualityPage() {
    return (
        <AppBackground ambient className="min-h-screen">
            <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-6 sm:px-6 lg:px-8">
                <Link
                    href="/admin/spots/discovery"
                    className="rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-400/20"
                >
                    Review Apify discoveries
                </Link>
            </div>
            <Suspense fallback={null}>
                <SpotQualityWorkbench />
            </Suspense>
        </AppBackground>
    );
}
