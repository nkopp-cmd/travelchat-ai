"use client";

import { Card } from "@/components/ui/card";
import { ItineraryTemplate } from "@/lib/templates";
import { Clock, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface TemplateCardProps {
  template: ItineraryTemplate;
}

// Template-specific gradient backgrounds for visual variety
const templateGradients: Record<string, string> = {
  foodie: "from-orange-500/20 via-amber-500/10 to-yellow-500/5",
  culture: "from-violet-500/20 via-purple-500/10 to-indigo-500/5",
  adventure: "from-emerald-500/20 via-teal-500/10 to-cyan-500/5",
  romantic: "from-rose-500/20 via-pink-500/10 to-fuchsia-500/5",
  family: "from-blue-500/20 via-sky-500/10 to-cyan-500/5",
  budget: "from-green-500/20 via-emerald-500/10 to-teal-500/5",
  luxury: "from-amber-500/20 via-yellow-500/10 to-orange-500/5",
  wellness: "from-teal-500/20 via-cyan-500/10 to-sky-500/5",
  nightlife: "from-purple-500/20 via-violet-500/10 to-indigo-500/5",
  photography: "from-pink-500/20 via-rose-500/10 to-red-500/5",
};

// Get gradient based on template ID or name
function getTemplateGradient(template: ItineraryTemplate): string {
  const id = template.id.toLowerCase();
  for (const [key, gradient] of Object.entries(templateGradients)) {
    if (id.includes(key)) return gradient;
  }
  // Default gradient
  return "from-violet-500/20 via-purple-500/10 to-indigo-500/5";
}

// Accent color based on pace
const paceAccents = {
  relaxed: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-700/50",
    glow: "group-hover:shadow-emerald-500/20",
  },
  moderate: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-700/50",
    glow: "group-hover:shadow-blue-500/20",
  },
  active: {
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-700/50",
    glow: "group-hover:shadow-orange-500/20",
  },
};

export function TemplateCard({ template }: TemplateCardProps) {
  const paceConfig = {
    relaxed: { icon: "🌊", label: "Relaxed" },
    moderate: { icon: "🚶", label: "Moderate" },
    active: { icon: "⚡", label: "Active" },
  };

  const pace = paceConfig[template.pace];
  const accent = paceAccents[template.pace];
  const gradient = getTemplateGradient(template);

  return (
    <Link href={`/itineraries/new?template=${template.id}`}>
      <Card className={cn(
        "group relative flex min-h-[104px] cursor-pointer flex-col overflow-hidden !gap-0 !py-0 sm:min-h-[118px]",
        "bg-white/70 dark:bg-white/5 backdrop-blur-md",
        "border border-black/5 dark:border-white/10",
        "transition-all duration-300 ease-out",
        "hover:shadow-lg hover:shadow-violet-500/10",
        accent.glow,
        "hover:border-violet-400/50 dark:hover:border-violet-500/40",
        "hover:-translate-y-0.5"
      )}>
        {/* Animated gradient background */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          gradient
        )} />

        {/* Decorative pattern overlay */}
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
             style={{
               backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
             }} />

        {/* Main Content */}
        <div className="p-2 sm:p-2.5 flex-1 flex flex-col relative z-10">
          {/* Header */}
          <div className="flex items-start gap-2">
            <div className="relative">
              <div className="text-xl sm:text-2xl transform group-hover:scale-105 transition-transform duration-300">
                {template.emoji}
              </div>
              <div aria-hidden="true" className="absolute inset-0 blur-lg opacity-0 group-hover:opacity-25 transition-opacity duration-300 text-xl sm:text-2xl">
                {template.emoji}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 font-bold text-[13px] leading-tight group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors duration-200 sm:text-sm">
                {template.name}
              </h3>
              <p className="mt-1 hidden text-xs leading-snug text-muted-foreground/80 md:line-clamp-2 md:block">
                {template.description}
              </p>
            </div>
          </div>

          {/* Stats Pills Row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {/* Days pill */}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100/80 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-700/50 backdrop-blur-sm">
              <Clock className="h-2.5 w-2.5" />
              {template.days} {template.days === 1 ? 'day' : 'days'}
            </span>

            {/* Pace pill */}
            <span className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border backdrop-blur-sm",
              accent.bg, accent.text, accent.border
            )}>
              {pace.icon} {pace.label}
            </span>

            {/* Activities pill */}
            <span className="hidden items-center gap-1 rounded-full border border-black/5 bg-white/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm dark:border-white/10 dark:bg-white/5 sm:inline-flex">
              <Zap className="h-2.5 w-2.5" />
              {template.activitiesPerDay}/day
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1 min-h-1" />

          {/* Primary action */}
          <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-black/5 dark:border-white/10">
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-violet-600 dark:group-hover:text-violet-300">
              Start from here
            </span>
            <div className={cn(
              "flex items-center justify-center rounded-full",
              "h-6 w-6 sm:h-7 sm:w-7 bg-violet-600 text-white",
              "transition-all duration-200 ease-out",
              "shadow-sm shadow-violet-500/20 group-hover:shadow-md group-hover:shadow-violet-500/30"
            )}>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>

        {/* Corner accent */}
        <div className={cn(
          "absolute top-0 right-0 w-20 h-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          "bg-gradient-to-bl from-violet-500/10 to-transparent"
        )} />
      </Card>
    </Link>
  );
}
