"use client";

import { Card } from "@/components/ui/card";
import { ItineraryTemplate } from "@/lib/templates";
import { Clock, Users, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";

interface TemplateCardProps {
  template: ItineraryTemplate;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const paceConfig = {
    relaxed: { icon: "🌊", label: "Relaxed", color: "text-emerald-600 dark:text-emerald-400" },
    moderate: { icon: "🚶", label: "Moderate", color: "text-blue-600 dark:text-blue-400" },
    active: { icon: "⚡", label: "Active", color: "text-orange-600 dark:text-orange-400" },
  };

  const pace = paceConfig[template.pace];

  return (
    <Link href={`/itineraries/new?template=${template.id}`}>
      <Card className="group overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/10 hover:border-violet-300/50 dark:hover:border-violet-700/50 hover:-translate-y-1 h-full flex flex-col bg-card cursor-pointer">
        {/* Main Content */}
        <div className="p-5 flex-1 flex flex-col">
          {/* Header: Emoji + Title + Description */}
          <div className="flex gap-4">
            <div className="text-4xl flex-shrink-0">{template.emoji}</div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-lg leading-tight group-hover:text-violet-600 transition-colors">
                {template.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                {template.description}
              </p>
            </div>
          </div>

          {/* Meta Row: Days • Pace • Activities */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/40 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {template.days} {template.days === 1 ? 'day' : 'days'}
            </span>
            <span className="text-border">•</span>
            <span className={`flex items-center gap-1 ${pace.color}`}>
              {pace.icon} {pace.label}
            </span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              {template.activitiesPerDay}/day
            </span>
          </div>

          {/* Target Audience - Clean inline */}
          <div className="flex items-center gap-2 mt-4 text-sm">
            <Users className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
            <span className="text-muted-foreground">
              Perfect for <span className="text-foreground font-medium">{template.targetAudience}</span>
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1 min-h-4" />

          {/* CTA - Compact, shows on hover */}
          <div className="flex items-center justify-end mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <span className="text-sm font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1">
              Use Template
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
