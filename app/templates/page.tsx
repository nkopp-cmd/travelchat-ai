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
  const paceGroups = {
    relaxed: templates.filter((t) => t.pace === 'relaxed'),
    moderate: templates.filter((t) => t.pace === 'moderate'),
    active: templates.filter((t) => t.pace === 'active'),
  };

  return (
    <AppBackground ambient className="min-h-screen">
      <div className="container mx-auto px-4 py-4 sm:py-7">
        {/* Back Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 sm:mb-5"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-5 space-y-2 sm:mb-6 sm:space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10 rounded-full text-violet-700 dark:text-violet-400 text-xs sm:text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            Start with a Template
          </div>

          <h1 className="text-2xl font-bold sm:text-4xl">
            <GradientText variant="violet">
              Itinerary Templates
            </GradientText>
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
            Jump-start your trip planning with our curated templates designed for every travel style
          </p>

          <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center pt-1 sm:pt-2">
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

        {/* Browse by Pace - Primary Sections */}
        <div className="space-y-5 sm:space-y-7">
          {/* Relaxed Pace */}
          {paceGroups.relaxed.length > 0 && (
            <section className="relative">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-teal-400 rounded-full hidden lg:block" />
              <div className="flex items-center gap-2.5 mb-3 sm:mb-4 rounded-lg border border-black/5 bg-white/50 p-2.5 sm:p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 text-lg sm:text-xl dark:from-emerald-900/30 dark:to-teal-900/30">
                  🌊
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-xl font-bold">Relaxed Pace</h2>
                  <p className="text-muted-foreground text-xs sm:text-sm line-clamp-1 sm:line-clamp-none">
                    Take it easy with leisurely itineraries perfect for unwinding
                  </p>
                </div>
                <Badge className="ml-auto shrink-0 bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/30 text-[11px] sm:text-xs">
                  {paceGroups.relaxed.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {paceGroups.relaxed.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </section>
          )}

          {/* Moderate Pace */}
          {paceGroups.moderate.length > 0 && (
            <section className="relative">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-indigo-400 rounded-full hidden lg:block" />
              <div className="flex items-center gap-2.5 mb-3 sm:mb-4 rounded-lg border border-black/5 bg-white/50 p-2.5 sm:p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 text-lg sm:text-xl dark:from-blue-900/30 dark:to-indigo-900/30">
                  🚶
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-xl font-bold">Moderate Pace</h2>
                  <p className="text-muted-foreground text-xs sm:text-sm line-clamp-1 sm:line-clamp-none">
                    Balanced itineraries with a mix of activities and downtime
                  </p>
                </div>
                <Badge className="ml-auto shrink-0 bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200/50 dark:border-blue-700/30 text-[11px] sm:text-xs">
                  {paceGroups.moderate.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {paceGroups.moderate.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </section>
          )}

          {/* Active Pace */}
          {paceGroups.active.length > 0 && (
            <section className="relative">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-400 to-red-400 rounded-full hidden lg:block" />
              <div className="flex items-center gap-2.5 mb-3 sm:mb-4 rounded-lg border border-black/5 bg-white/50 p-2.5 sm:p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-red-100 text-lg sm:text-xl dark:from-orange-900/30 dark:to-red-900/30">
                  ⚡
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-xl font-bold">Active Pace</h2>
                  <p className="text-muted-foreground text-xs sm:text-sm line-clamp-1 sm:line-clamp-none">
                    Packed itineraries for travelers who want to see and do it all
                  </p>
                </div>
                <Badge className="ml-auto shrink-0 bg-orange-100/80 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200/50 dark:border-orange-700/30 text-[11px] sm:text-xs">
                  {paceGroups.active.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {paceGroups.active.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Custom Option CTA */}
        <div className="mt-6 sm:mt-8 text-center p-4 sm:p-5 bg-white/70 dark:bg-white/5 backdrop-blur-md rounded-lg border border-black/5 dark:border-white/10 shadow-lg shadow-violet-500/5">
          <h3 className="text-lg sm:text-xl font-bold mb-2">
            Don&apos;t see what you&apos;re looking for?
          </h3>
          <p className="text-sm sm:text-base text-muted-foreground mb-4">
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
