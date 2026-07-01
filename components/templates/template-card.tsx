"use client";

import { Card } from "@/components/ui/card";
import {
  getTemplateImageUrl,
  getTemplateSampleCity,
  ItineraryTemplate,
} from "@/lib/templates";
import { ArrowRight, Check, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface TemplateCardProps {
  template: ItineraryTemplate;
  href?: string;
  actionHref?: string;
  isSelected?: boolean;
  onSelect?: () => void;
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

function TemplateCardContent({
  template,
  isSelected = false,
}: {
  template: ItineraryTemplate;
  isSelected?: boolean;
}) {
  const paceConfig = {
    relaxed: { icon: "🌊", label: "Relaxed", shortLabel: "Relax" },
    moderate: { icon: "🚶", label: "Moderate", shortLabel: "Medium" },
    active: { icon: "⚡", label: "Active", shortLabel: "Active" },
  };

  const pace = paceConfig[template.pace];
  const accent = paceAccents[template.pace];
  const gradient = getTemplateGradient(template);
  const sampleCity = getTemplateSampleCity(template);
  const imageUrl = getTemplateImageUrl(template, {
    width: 240,
    height: 180,
    quality: 88,
  });

  return (
      <Card className={cn(
        "group relative flex min-h-[66px] cursor-pointer flex-col overflow-hidden !gap-0 !py-0 sm:min-h-[78px]",
        "bg-white/70 dark:bg-white/5 backdrop-blur-md",
        "border border-black/5 dark:border-white/10",
        "transition-all duration-300 ease-out",
        "hover:shadow-lg hover:shadow-violet-500/10",
        accent.glow,
        "hover:border-violet-400/50 dark:hover:border-violet-500/40",
        "hover:-translate-y-0.5",
        isSelected && "border-violet-400/70 bg-violet-500/10 shadow-lg shadow-violet-500/15 ring-2 ring-violet-400/50"
      )}>
        {/* Animated gradient background */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          gradient
        )} />

        {/* Main Content */}
        <div className="relative z-10 flex flex-1 flex-col p-1.5 sm:p-2">
          {/* Header */}
          <div className="flex items-start gap-2 sm:gap-2.5">
            <div className="relative h-10 w-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/20 shadow-sm sm:h-12 sm:w-14">
              <Image
                src={imageUrl}
                alt={`${sampleCity} inspiration for ${template.name}`}
                fill
                sizes="56px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
              <div className="absolute bottom-0.5 right-0.5 rounded-full bg-black/55 px-1 text-[10px] leading-4 shadow-sm backdrop-blur-sm sm:text-[11px]">
                {template.emoji}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-[11px] font-bold leading-tight transition-colors duration-200 group-hover:text-violet-600 dark:group-hover:text-violet-400 sm:text-xs">
                {template.name}
              </h3>
              <p className="mt-0.5 hidden truncate text-[9px] font-medium leading-none text-violet-200/70 min-[360px]:block sm:text-[10px]">
                Inspired by {sampleCity}
              </p>
              <p className="mt-0.5 hidden text-[10px] leading-snug text-muted-foreground/80 xl:line-clamp-1 xl:block">
                {template.description}
              </p>
            </div>
          </div>

          {/* Compact Meta Row */}
          <div className="mt-auto flex items-center gap-1 pt-0.5 text-[9px] font-semibold leading-none text-muted-foreground sm:gap-1.5 sm:pt-1 sm:text-[10px]">
            <span className="inline-flex min-w-0 items-center gap-0.5 rounded-md border border-violet-200/40 bg-violet-100/65 px-1 py-0.5 text-violet-700 dark:border-violet-700/35 dark:bg-violet-900/30 dark:text-violet-200 sm:gap-1 sm:px-1.5 sm:py-1">
              <Clock className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
              <span className="whitespace-nowrap">{template.days}d</span>
            </span>
            <span className={cn(
              "inline-flex min-w-0 items-center gap-0.5 rounded-md border px-1 py-0.5 sm:gap-1 sm:px-1.5 sm:py-1",
              accent.bg, accent.text, accent.border
            )}>
              <span aria-hidden="true" className="shrink-0 text-[10px] leading-none sm:text-[11px]">{pace.icon}</span>
              <span className="whitespace-nowrap xl:hidden">{pace.shortLabel}</span>
              <span className="hidden whitespace-nowrap xl:inline">{pace.label}</span>
            </span>
            <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-violet-300/80 transition-transform duration-200 group-hover:translate-x-0.5 sm:h-3.5 sm:w-3.5" />
          </div>
        </div>

        {isSelected && (
          <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-violet-100/50 bg-violet-600 text-white shadow-lg shadow-violet-950/20">
            <Check className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Selected</span>
          </div>
        )}

        {/* Corner accent */}
        <div className={cn(
          "absolute top-0 right-0 w-20 h-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          "bg-gradient-to-bl from-violet-500/10 to-transparent"
        )} />
      </Card>
  );
}

export function TemplateCard({ template, href, actionHref, isSelected, onSelect }: TemplateCardProps) {
  const className = "block h-full rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-background";
  const content = <TemplateCardContent template={template} isSelected={isSelected} />;

  if (actionHref) {
    return (
      <Link
        href={actionHref}
        className={className}
        onMouseEnter={onSelect}
        onFocus={onSelect}
        onClick={onSelect}
        aria-label={`Use ${template.name} template`}
      >
        {content}
      </Link>
    );
  }

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(className, "w-full")}
        aria-pressed={isSelected}
        aria-label={`Select ${template.name} template`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href || `/itineraries/new?template=${template.id}`}
      className={className}
      aria-label={`Use ${template.name} template`}
    >
      {content}
    </Link>
  );
}
