"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  Compass,
  SlidersHorizontal,
  Sparkles,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TemplateCard } from "@/components/templates/template-card";
import {
  getTemplateImageUrl,
  getTemplateSampleCity,
  type ItineraryTemplate,
} from "@/lib/templates";
import { cn } from "@/lib/utils";

interface TemplatePickerProps {
  templates: ItineraryTemplate[];
}

type PaceFilter = "all" | ItineraryTemplate["pace"];

const paceLabels: Record<PaceFilter, string> = {
  all: "All",
  relaxed: "Relaxed",
  moderate: "Moderate",
  active: "Active",
};

const paceDescriptions: Record<ItineraryTemplate["pace"], string> = {
  relaxed: "Light days, more breathing room.",
  moderate: "Balanced days with focused routes.",
  active: "Fuller days for high-energy trips.",
};

export function getTemplateUrl(template: ItineraryTemplate) {
  const params = new URLSearchParams({
    template: template.id,
    city: getTemplateSampleCity(template),
  });

  return `/itineraries/new?${params.toString()}`;
}

export function TemplatePicker({ templates }: TemplatePickerProps) {
  const defaultTemplate =
    templates.find((template) => template.id === "local-authentic") ||
    templates[0];
  const [selectedId, setSelectedId] = useState(defaultTemplate?.id || "");
  const [paceFilter, setPaceFilter] = useState<PaceFilter>("all");

  const selectedTemplate =
    templates.find((template) => template.id === selectedId) || defaultTemplate;
  const visibleTemplates = useMemo(
    () =>
      templates.filter(
        (template) => paceFilter === "all" || template.pace === paceFilter,
      ),
    [paceFilter, templates],
  );

  if (!selectedTemplate) return null;
  const handlePaceFilterChange = (pace: PaceFilter) => {
    setPaceFilter(pace);

    const nextVisibleTemplates = templates.filter(
      (template) => pace === "all" || template.pace === pace,
    );
    const selectedStillVisible = nextVisibleTemplates.some(
      (template) => template.id === selectedId,
    );

    if (!selectedStillVisible && nextVisibleTemplates[0]) {
      setSelectedId(nextVisibleTemplates[0].id);
    }
  };

  return (
    <section
      className="grid gap-3 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:pb-0"
      data-testid="template-picker-shell"
    >
      <div className="min-w-0 space-y-2.5">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0">
          {(Object.keys(paceLabels) as PaceFilter[]).map((pace) => (
            <button
              key={pace}
              type="button"
              onClick={() => handlePaceFilterChange(pace)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition",
                paceFilter === pace
                  ? " bg-primary text-primary-foreground"
                  : " bg-raised text-foreground hover:bg-raised",
              )}
            >
              {paceLabels[pace]}
            </button>
          ))}
        </div>

        <div
          className="grid grid-cols-2 gap-1.5 min-[430px]:grid-cols-3 sm:gap-2 lg:grid-cols-3 xl:grid-cols-4"
          data-testid="template-picker-grid"
        >
          {visibleTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedTemplate.id === template.id}
              primaryHref={getTemplateUrl(template)}
              onSelect={() => setSelectedId(template.id)}
            />
          ))}
        </div>
      </div>

      <aside className="hidden rounded-2xl bg-surface p-4 backdrop-blur-xl lg:sticky lg:top-20 lg:block">
        <TemplateSummary template={selectedTemplate} />
      </aside>

      <div
        className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 bg-surface px-3 py-2 shadow-[0_-16px_34px_rgba(0,0,0,0.34)] backdrop-blur-xl lg:hidden"
        data-testid="template-mobile-cta"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {selectedTemplate.name}
            </p>
            <p className="truncate text-xs text-foreground">
              {selectedTemplate.days} days / {paceLabels[selectedTemplate.pace]} / {getTemplateSampleCity(selectedTemplate)}
            </p>
          </div>
          <Button
            asChild
            className="h-10 shrink-0 rounded-lg bg-primary text-primary-foreground px-3 text-sm"
          >
            <Link href={getTemplateUrl(selectedTemplate)}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Use template
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function TemplateSummary({ template }: { template: ItineraryTemplate }) {
  const sampleCity = getTemplateSampleCity(template);
  const imageUrl = getTemplateImageUrl(template, {
    width: 720,
    height: 420,
    quality: 90,
  });

  return (
    <div className="space-y-4">
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-black/20">
        <Image
          src={imageUrl}
          alt={`${sampleCity} inspiration for ${template.name}`}
          fill
          sizes="336px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/12 to-transparent" />
        <div className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-md">
          Inspired by {sampleCity}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-2xl">
          {template.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <Badge className="rounded-full bg-primary/15 text-xs text-foreground">
              Selected
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-full bg-raised text-xs text-foreground"
            >
              {paceLabels[template.pace]}
            </Badge>
          </div>
          <h2 className="text-xl font-bold leading-tight text-foreground">
            {template.name}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {template.description}
          </p>
        </div>
      </div>

      <Button
        asChild
        className="h-10 w-full rounded-xl bg-primary text-primary-foreground"
      >
        <Link href={getTemplateUrl(template)}>
          <Sparkles className="mr-2 h-4 w-4" />
          Start in {sampleCity}
        </Link>
      </Button>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-raised p-2.5">
          <Clock className="mb-1 h-4 w-4 text-primary" />
          <p className="text-sm font-bold text-foreground">{template.days} days</p>
          <p className="text-xs text-muted-foreground">Duration</p>
        </div>
        <div className="rounded-xl bg-raised p-2.5">
          <Compass className="mb-1 h-4 w-4 text-primary" />
          <p className="text-sm font-bold text-foreground">
            {template.activitiesPerDay}/day
          </p>
          <p className="text-xs text-muted-foreground">Stops</p>
        </div>
        <div className="rounded-xl bg-raised p-2.5">
          <SlidersHorizontal className="mb-1 h-4 w-4 text-primary" />
          <p className="truncate text-sm font-bold capitalize text-foreground">
            {template.pace}
          </p>
          <p className="text-xs text-muted-foreground">Pace</p>
        </div>
      </div>

      <p className="rounded-xl bg-raised p-3 text-sm leading-relaxed text-foreground">
        {paceDescriptions[template.pace]} Alley will use this as structure, then
        fill it with real local spots for your city.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {template.tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="rounded-full bg-raised text-xs text-foreground"
          >
            {tag}
          </Badge>
        ))}
      </div>

    </div>
  );
}
