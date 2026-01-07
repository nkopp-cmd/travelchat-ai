import { templates } from "@/lib/templates";
import { TemplateCard } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";

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
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-12">
        {/* Back Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-100 dark:bg-violet-900/20 rounded-full text-violet-700 dark:text-violet-400 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Start with a Template
          </div>

          <h1 className="text-5xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Itinerary Templates
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Jump-start your trip planning with our curated templates designed for every travel style
          </p>

          <div className="flex flex-wrap gap-2 justify-center pt-4">
            <Badge variant="secondary" className="text-sm">
              {templates.length} Templates
            </Badge>
            <Badge variant="secondary" className="text-sm">
              AI-Powered
            </Badge>
            <Badge variant="secondary" className="text-sm">
              Fully Customizable
            </Badge>
          </div>
        </div>

        {/* Browse by Pace - Primary Sections */}
        <div className="space-y-16">
          {/* Relaxed Pace */}
          {paceGroups.relaxed.length > 0 && (
            <section className="relative">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-teal-400 rounded-full hidden lg:block" />
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 text-2xl">
                  🌊
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Relaxed Pace</h2>
                  <p className="text-muted-foreground text-sm">
                    Take it easy with leisurely itineraries perfect for unwinding
                  </p>
                </div>
                <Badge className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                  {paceGroups.relaxed.length} templates
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-2xl">
                  🚶
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Moderate Pace</h2>
                  <p className="text-muted-foreground text-sm">
                    Balanced itineraries with a mix of activities and downtime
                  </p>
                </div>
                <Badge className="ml-auto bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
                  {paceGroups.moderate.length} templates
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 text-2xl">
                  ⚡
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Active Pace</h2>
                  <p className="text-muted-foreground text-sm">
                    Packed itineraries for travelers who want to see and do it all
                  </p>
                </div>
                <Badge className="ml-auto bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0">
                  {paceGroups.active.length} templates
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paceGroups.active.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Custom Option CTA */}
        <div className="mt-16 text-center p-8 bg-gradient-to-r from-violet-100 to-indigo-100 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-2xl border border-violet-200 dark:border-violet-800">
          <h3 className="text-2xl font-bold mb-2">
            Don&apos;t see what you&apos;re looking for?
          </h3>
          <p className="text-muted-foreground mb-6">
            Create a fully custom itinerary from scratch with Alley AI
          </p>
          <Link href="/dashboard">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              Create Custom Itinerary
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
