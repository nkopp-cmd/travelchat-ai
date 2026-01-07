"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItineraryTemplate } from "@/lib/templates";
import { Clock, Users, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";

interface TemplateCardProps {
  template: ItineraryTemplate;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const paceIcons = {
    relaxed: "🌊",
    moderate: "🚶",
    active: "⚡",
  };

  const paceColors = {
    relaxed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    moderate: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
    active: "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  };

  return (
    <Card className="group hover:shadow-xl hover:shadow-violet-200/50 dark:hover:shadow-violet-900/20 hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 border-border/40 overflow-hidden cursor-pointer">
      {/* Gradient Header */}
      <div className={`h-3 bg-gradient-to-r ${template.color} group-hover:h-4 transition-all duration-300`} />

      <CardHeader className="space-y-3">
        {/* Icon & Title */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{template.emoji}</div>
            <div>
              <CardTitle className="text-xl group-hover:text-violet-600 transition-colors">
                {template.name}
              </CardTitle>
              <CardDescription className="mt-1">
                {template.description}
              </CardDescription>
            </div>
          </div>
        </div>

        {/* Meta Information */}
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{template.days} {template.days === 1 ? 'day' : 'days'}</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span>{template.activitiesPerDay} activities/day</span>
          </div>
          <span>•</span>
          <Badge variant="secondary" className={paceColors[template.pace]}>
            {paceIcons[template.pace]} {template.pace}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Focus Areas */}
        <div>
          <p className="text-sm font-medium mb-2">Focus Areas:</p>
          <div className="flex flex-wrap gap-2">
            {template.focus.map((focus, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {focus}
              </Badge>
            ))}
          </div>
        </div>

        {/* Target Audience - Best For Section */}
        <div className="p-3 rounded-lg bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/10 dark:to-indigo-900/10 border border-violet-100 dark:border-violet-800/30">
          <div className="flex items-start gap-2 text-sm">
            <Users className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-violet-600 dark:text-violet-400">Best for:</span>
              <span className="text-foreground ml-1">{template.targetAudience}</span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <Link href={`/itineraries/new?template=${template.id}`} className="block">
          <Button className="w-full group-hover:bg-violet-600 group-hover:text-white transition-colors">
            Use Template
            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
