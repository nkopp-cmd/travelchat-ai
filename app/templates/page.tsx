import { templates } from "@/lib/templates";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { TemplatePicker } from "@/components/templates/template-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "@/components/ui/icons";
import Link from "next/link";
import { AppBackground } from "@/components/layout/app-background";

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/templates" },
  title: "Itinerary Templates - Curated Travel Plans | Localley",
  description: "Start your trip planning with our AI-powered itinerary templates. Curated plans for every travel style - relaxed, moderate, or active adventures.",
  keywords: "itinerary templates, travel planning, trip templates, vacation planner, AI travel, trip itinerary",
  openGraph: {
    title: "Itinerary Templates | Localley",
    description: "Jump-start your trip planning with curated templates designed for every travel style.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Itinerary Templates | Localley",
    description: "Jump-start your trip planning with curated templates designed for every travel style.",
  },
};

export default function TemplatesPage() {
  const paceCounts = {
    relaxed: templates.filter((template) => template.pace === "relaxed").length,
    moderate: templates.filter((template) => template.pace === "moderate").length,
    active: templates.filter((template) => template.pace === "active").length,
  };

  return (
    <AppBackground ambient className="min-h-screen">
      <PageShell>
        <PageHeader
          eyebrow="Start with a template"
          eyebrowIcon={Sparkles}
          title="Itinerary Templates"
          lede="Pick a travel style, choose a city, and let Alley build the full route."
        />
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{templates.length} templates</Badge>
          <Badge variant="secondary">Relaxed {paceCounts.relaxed}</Badge>
          <Badge variant="secondary">Moderate {paceCounts.moderate}</Badge>
          <Badge variant="secondary">Active {paceCounts.active}</Badge>
        </div>

        <TemplatePicker templates={templates} />

        {/* Custom Option CTA */}
        <div className="mt-3 hidden pt-3 text-center sm:mt-4 sm:pt-4 md:block lg:max-w-[calc(100%-22rem)]">
          <h3 className="mb-1.5 text-base font-bold sm:text-lg">
            Don&apos;t see what you&apos;re looking for?
          </h3>
          <p className="mb-2.5 text-sm text-muted-foreground">
            Create a fully custom itinerary from scratch with Alley AI
          </p>
          <Button asChild>
            <Link href="/dashboard">
              Create Custom Itinerary
            </Link>
          </Button>
        </div>
      </PageShell>
    </AppBackground>
  );
}
