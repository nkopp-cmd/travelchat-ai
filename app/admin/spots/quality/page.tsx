import type { Metadata } from "next";
import { AppBackground } from "@/components/layout/app-background";
import { SpotQualityWorkbench } from "@/components/admin/spot-quality-workbench";

export const metadata: Metadata = {
    title: "Spot Quality Queue | Localley Admin",
    description: "Admin queue for Localley spot image, location, and place identity enrichment.",
};

export default function AdminSpotQualityPage() {
    return (
        <AppBackground ambient className="min-h-screen">
            <SpotQualityWorkbench />
        </AppBackground>
    );
}
