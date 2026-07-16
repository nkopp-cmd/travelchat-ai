import type { Metadata } from "next";
import { AppBackground } from "@/components/layout/app-background";
import { ApifySpotDiscoveryWorkbench } from "@/components/admin/apify-spot-discovery-workbench";

export const metadata: Metadata = {
  title: "Apify Spot Discovery | Localley Admin",
  description: "Review cost-bounded map discoveries before adding them to Localley.",
};

export default function AdminApifySpotDiscoveryPage() {
  return (
    <AppBackground ambient className="min-h-screen">
      <ApifySpotDiscoveryWorkbench />
    </AppBackground>
  );
}
