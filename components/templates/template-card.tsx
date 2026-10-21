"use client";

import { Card } from "@/components/ui/card";
import {
  getTemplateImageUrl,
  getTemplateSampleCity,
  ItineraryTemplate,
} from "@/lib/templates";
import { ArrowRight, Check, Clock } from "@/components/ui/icons";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface TemplateCardProps {
  template: ItineraryTemplate;
  href?: string;
  actionHref?: string;
  primaryHref?: string;
  isSelected?: boolean;
  onSelect?: () => void;
}

// Accent color based on pace
const paceAccents = {
  relaxed: {
    bg: "bg-raised",
    text: "text-foreground",
    border: " ",
    glow: "",
  },
  moderate: {
    bg: "bg-raised",
    text: "text-foreground",
    border: " ",
    glow: "",
  },
  active: {
    bg: "bg-raised",
    text: "text-foreground",
    border: " ",
    glow: "",
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
  const sampleCity = getTemplateSampleCity(template);
  const imageUrl = getTemplateImageUrl(template, {
    width: 240,
    height: 180,
    quality: 88,
  });

  return (
      <Card className={cn(
        "group relative flex min-h-[54px] cursor-pointer flex-col overflow-hidden !gap-0 !py-0 sm:min-h-[66px]",
        "bg-raised backdrop-blur-md",
        " ",
        "transition-all duration-300 ease-out",
        "",
        accent.glow,
        " ",
        "hover:-translate-y-0.5",
        isSelected && " bg-primary/10 "
      )}>

        {/* Main Content */}
        <div
          className={cn(
            "relative z-10 flex flex-1 flex-col p-1.5 sm:p-2",
            isSelected && "sm:pb-9",
          )}
          data-testid="template-card-content"
        >
          {/* Header */}
          <div className="flex items-start gap-1.5 sm:gap-2">
            <div className="relative h-8 w-9 shrink-0 overflow-hidden rounded-md bg-black/20 shadow-sm sm:h-10 sm:w-11">
              <Image
                src={imageUrl}
                alt={`${sampleCity} inspiration for ${template.name}`}
                fill
                sizes="48px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
              <div className="absolute bottom-0.5 right-0.5 rounded-full bg-black/55 px-1 text-xs leading-4 shadow-sm backdrop-blur-sm sm:text-xs">
                {template.emoji}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-xs font-bold leading-tight transition-colors duration-200 group-hover:text-primary dark:group-hover:text-primary sm:text-xs">
                {template.name}
              </h3>
              <p className="mt-0.5 hidden truncate text-xs font-medium leading-none text-foreground min-[380px]:block sm:text-xs">
                Inspired by {sampleCity}
              </p>
              <p className="mt-0.5 hidden text-xs leading-snug text-muted-foreground/80 xl:line-clamp-1 xl:block">
                {template.description}
              </p>
            </div>
          </div>

          {/* Compact Meta Row */}
          <div className="mt-auto flex items-center gap-1 pt-0.5 text-xs font-semibold leading-none text-muted-foreground sm:gap-1.5 sm:pt-1 sm:text-xs">
            <span className="inline-flex min-w-0 items-center gap-0.5 rounded-md bg-primary/15 px-1 py-0.5 text-foreground sm:gap-1 sm:px-1.5 sm:py-1">
              <Clock className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
              <span className="whitespace-nowrap">{template.days}d</span>
            </span>
            <span className={cn(
              "inline-flex min-w-0 items-center gap-0.5 rounded-md px-1 py-0.5 sm:gap-1 sm:px-1.5 sm:py-1",
              accent.bg, accent.text, accent.border
            )}>
              <span aria-hidden="true" className="shrink-0 text-xs leading-none sm:text-xs">{pace.icon}</span>
              <span className="whitespace-nowrap xl:hidden">{pace.shortLabel}</span>
              <span className="hidden whitespace-nowrap xl:inline">{pace.label}</span>
            </span>
            <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-primary/80 transition-transform duration-200 group-hover:translate-x-0.5 sm:h-3.5 sm:w-3.5" />
          </div>
        </div>

        {isSelected && (
          <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground sm:left-2 sm:top-2">
            <Check className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Selected</span>
          </div>
        )}

      </Card>
  );
}

export function TemplateCard({ template, href, actionHref, primaryHref, isSelected, onSelect }: TemplateCardProps) {
  const className = "block h-full rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background";
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
      <div className="relative h-full">
        <button
          type="button"
          onClick={onSelect}
          className={cn(className, "w-full")}
          aria-pressed={isSelected}
          aria-label={`Select ${template.name} template`}
        >
          {content}
        </button>
        {isSelected && primaryHref && (
          <Link
            href={primaryHref}
            className="absolute right-1.5 top-1.5 z-20 hidden h-6 items-center justify-center gap-1 rounded-md bg-primary px-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 focus:ring-offset-[#100b1c] sm:inset-x-1.5 sm:top-auto sm:bottom-1.5 sm:inline-flex sm:h-8 sm:px-2 sm:text-xs"
            aria-label={`Use ${template.name} template`}
            data-testid="template-card-inline-action"
          >
            <span className="sm:hidden">Use</span>
            <span className="hidden sm:inline">Use this</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </div>
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
