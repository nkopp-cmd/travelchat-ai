import { templates } from "@/lib/templates";
import { TemplateCard } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppBackground } from "@/components/layout/app-background";
import { GradientText } from "@/components/ui/gradient-text";

import type { Metadata } from "next";

export const metadata: Metadata = {
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
      <div className="container mx-auto px-3 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-4 sm:py-5">
        {/* Back Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 sm:mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mx-auto mb-3 max-w-3xl text-center sm:mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10 rounded-full text-violet-700 dark:text-violet-400 text-xs sm:text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            Start with a Template
          </div>

          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            <GradientText variant="violet">
              Itinerary Templates
            </GradientText>
          </h1>

          <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Pick a travel style, choose a city, and let Alley build the full route.
          </p>

          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:gap-2">
            <Badge variant="secondary" className="text-xs sm:text-sm bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10">
              {templates.length} Templates
            </Badge>
            <Badge variant="secondary" className="text-xs sm:text-sm bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10">
              AI-Powered
            </Badge>
            <Badge variant="secondary" className="text-xs sm:text-sm bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10">
              Fully Customizable
            </Badge>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-3 gap-1.5 text-center sm:mx-auto sm:mb-3 sm:max-w-xl sm:gap-2">
          <Badge className="justify-center border border-emerald-200/50 bg-emerald-100/80 px-2 py-1 text-[11px] text-emerald-700 dark:border-emerald-700/30 dark:bg-emerald-900/30 dark:text-emerald-300">
            Relaxed {paceCounts.relaxed}
          </Badge>
          <Badge className="justify-center border border-blue-200/50 bg-blue-100/80 px-2 py-1 text-[11px] text-blue-700 dark:border-blue-700/30 dark:bg-blue-900/30 dark:text-blue-300">
            Moderate {paceCounts.moderate}
          </Badge>
          <Badge className="justify-center border border-orange-200/50 bg-orange-100/80 px-2 py-1 text-[11px] text-orange-700 dark:border-orange-700/30 dark:bg-orange-900/30 dark:text-orange-300">
            Active {paceCounts.active}
          </Badge>
        </div>

        <section>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {templates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        </section>

        {/* Custom Option CTA */}
        <div className="mt-3 border-t border-black/5 pt-3 text-center dark:border-white/10 sm:mt-4 sm:pt-4">
          <h3 className="text-lg sm:text-xl font-bold mb-2">
            Don&apos;t see what you&apos;re looking for?
          </h3>
          <p className="text-sm sm:text-base text-muted-foreground mb-3">
            Create a fully custom itinerary from scratch with Alley AI
          </p>
          <Link href="/dashboard">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20">
              Create Custom Itinerary
            </Button>
          </Link>
        </div>
      </div>
    </AppBackground>
  );
}
