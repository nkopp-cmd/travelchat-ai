import { templates } from "@/lib/templates";
import { TemplateCard } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Itinerary Templates - Localley",
  description: "Start your trip planning with our curated itinerary templates for every travel style",
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

        {/* All Templates Grid */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">All Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        </div>

        {/* By Pace Section */}
        <div className="space-y-12">
          {/* Relaxed Pace */}
          {paceGroups.relaxed.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-1 w-12 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full" />
                <h2 className="text-2xl font-bold">Relaxed Pace 🌊</h2>
              </div>
              <p className="text-muted-foreground mb-6">
                Take it easy with leisurely itineraries perfect for unwinding
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paceGroups.relaxed.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </div>
          )}

          {/* Moderate Pace */}
          {paceGroups.moderate.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-1 w-12 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full" />
                <h2 className="text-2xl font-bold">Moderate Pace 🚶</h2>
              </div>
              <p className="text-muted-foreground mb-6">
                Balanced itineraries with a mix of activities and downtime
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paceGroups.moderate.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </div>
          )}

          {/* Active Pace */}
          {paceGroups.active.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-1 w-12 bg-gradient-to-r from-orange-400 to-red-400 rounded-full" />
                <h2 className="text-2xl font-bold">Active Pace ⚡</h2>
              </div>
              <p className="text-muted-foreground mb-6">
                Packed itineraries for travelers who want to see and do it all
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paceGroups.active.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Custom Option CTA */}
        <div className="mt-16 text-center p-8 bg-gradient-to-r from-violet-100 to-indigo-100 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-2xl border border-violet-200 dark:border-violet-800">
          <h3 className="text-2xl font-bold mb-2">
            Don't see what you're looking for?
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
