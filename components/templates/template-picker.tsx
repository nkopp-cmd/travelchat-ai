"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  Compass,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
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

function getTemplateUrl(templateId: string) {
  return `/itineraries/new?template=${encodeURIComponent(templateId)}`;
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
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <div className="min-w-0 space-y-2.5">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0">
          {(Object.keys(paceLabels) as PaceFilter[]).map((pace) => (
            <button
              key={pace}
              type="button"
              onClick={() => handlePaceFilterChange(pace)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition",
                paceFilter === pace
                  ? "border-violet-300/50 bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                  : "border-white/10 bg-white/[0.055] text-violet-100/80 hover:border-violet-300/30 hover:bg-white/[0.08]",
              )}
            >
              {paceLabels[pace]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1.5 min-[430px]:grid-cols-3 sm:gap-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              actionHref={getTemplateUrl(template.id)}
              isSelected={selectedTemplate.id === template.id}
              onSelect={() => setSelectedId(template.id)}
            />
          ))}
        </div>
      </div>

      <aside className="hidden rounded-2xl border border-white/10 bg-[#12091f]/86 p-4 shadow-2xl shadow-violet-950/20 backdrop-blur-xl lg:sticky lg:top-20 lg:block">
        <TemplateSummary template={selectedTemplate} />
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#090511]/94 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-16px_34px_rgba(0,0,0,0.34)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {selectedTemplate.name}
            </p>
            <p className="truncate text-[11px] text-violet-100/55">
              {selectedTemplate.days} days / {paceLabels[selectedTemplate.pace]}
            </p>
          </div>
          <Button
            asChild
            className="h-10 shrink-0 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-sm shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500"
          >
            <Link href={getTemplateUrl(selectedTemplate.id)}>
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
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-black/20 shadow-lg shadow-violet-950/20">
        <Image
          src={imageUrl}
          alt={`${sampleCity} inspiration for ${template.name}`}
          fill
          sizes="336px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/12 to-transparent" />
        <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
          Inspired by {sampleCity}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/15 text-2xl shadow-lg shadow-violet-950/20">
          {template.emoji}
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <Badge className="rounded-full border border-violet-300/20 bg-violet-500/15 text-[10px] text-violet-100">
              Selected
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-full border border-white/10 bg-white/[0.06] text-[10px] text-violet-100"
            >
              {paceLabels[template.pace]}
            </Badge>
          </div>
          <h2 className="text-xl font-bold leading-tight text-white">
            {template.name}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {template.description}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.055] p-2.5">
          <Clock className="mb-1 h-4 w-4 text-violet-300" />
          <p className="text-sm font-bold text-white">{template.days} days</p>
          <p className="text-[11px] text-muted-foreground">Duration</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.055] p-2.5">
          <Compass className="mb-1 h-4 w-4 text-violet-300" />
          <p className="text-sm font-bold text-white">
            {template.activitiesPerDay}/day
          </p>
          <p className="text-[11px] text-muted-foreground">Stops</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.055] p-2.5">
          <SlidersHorizontal className="mb-1 h-4 w-4 text-violet-300" />
          <p className="truncate text-sm font-bold capitalize text-white">
            {template.pace}
          </p>
          <p className="text-[11px] text-muted-foreground">Pace</p>
        </div>
      </div>

      <p className="rounded-xl border border-white/10 bg-white/[0.045] p-3 text-sm leading-relaxed text-violet-100/80">
        {paceDescriptions[template.pace]} Alley will use this as structure, then
        fill it with real local spots for your city.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {template.tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="rounded-full border border-white/10 bg-white/[0.055] text-[11px] text-violet-100/75"
          >
            {tag}
          </Badge>
        ))}
      </div>

      <Button
        asChild
        className="h-11 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500"
      >
        <Link href={getTemplateUrl(template.id)}>
          <Sparkles className="mr-2 h-4 w-4" />
          Use this template
        </Link>
      </Button>
    </div>
  );
}
