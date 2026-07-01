import { templates } from "@/lib/templates";
import { TemplatePicker } from "@/components/templates/template-picker";
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
      <div className="container mx-auto max-w-6xl px-3 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-4 sm:py-4 md:pb-8">
        {/* Back Button */}
        <Link
          href="/dashboard"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-3"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mx-auto mb-2 max-w-3xl text-center sm:mb-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-xs font-medium text-violet-700 backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:text-violet-400">
            <Sparkles className="h-3.5 w-3.5" />
            Start with a Template
          </div>

          <h1 className="mt-1.5 text-2xl font-bold sm:text-3xl">
            <GradientText variant="violet">
              Itinerary Templates
            </GradientText>
          </h1>

          <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
            Pick a travel style, choose a city, and let Alley build the full route.
          </p>

          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            <Badge variant="secondary" className="border border-black/5 bg-white/70 text-[11px] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 sm:text-xs">
              {templates.length} Templates
            </Badge>
            <Badge variant="secondary" className="border border-black/5 bg-white/70 text-[11px] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 sm:text-xs">
              AI-Powered
            </Badge>
            <Badge variant="secondary" className="border border-black/5 bg-white/70 text-[11px] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 sm:text-xs">
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

        <TemplatePicker templates={templates} />

        {/* Custom Option CTA */}
        <div className="mt-3 hidden border-t border-black/5 pt-3 text-center dark:border-white/10 sm:mt-4 sm:pt-4 md:block lg:max-w-[calc(100%-22rem)]">
          <h3 className="mb-1.5 text-base font-bold sm:text-lg">
            Don&apos;t see what you&apos;re looking for?
          </h3>
          <p className="mb-2.5 text-sm text-muted-foreground">
            Create a fully custom itinerary from scratch with Alley AI
          </p>
          <Link href="/dashboard">
            <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700">
              Create Custom Itinerary
            </Button>
          </Link>
        </div>
      </div>
    </AppBackground>
  );
}
