"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Compass, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TemplateCard } from "@/components/templates/template-card";
import type { ItineraryTemplate } from "@/lib/templates";
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
  const defaultTemplate = templates.find((template) => template.id === "local-authentic") || templates[0];
  const [selectedId, setSelectedId] = useState(defaultTemplate?.id || "");
  const [paceFilter, setPaceFilter] = useState<PaceFilter>("all");

  const selectedTemplate = templates.find((template) => template.id === selectedId) || defaultTemplate;
  const visibleTemplates = useMemo(
    () => templates.filter((template) => paceFilter === "all" || template.pace === paceFilter),
    [paceFilter, templates]
  );

  if (!selectedTemplate) return null;

  const handlePaceFilterChange = (pace: PaceFilter) => {
    setPaceFilter(pace);

    const nextVisibleTemplates = templates.filter(
      (template) => pace === "all" || template.pace === pace
    );
    const selectedStillVisible = nextVisibleTemplates.some(
      (template) => template.id === selectedId
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
                  : "border-white/10 bg-white/[0.055] text-violet-100/80 hover:border-violet-300/30 hover:bg-white/[0.08]"
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
              isSelected={selectedTemplate.id === template.id}
              onSelect={() => setSelectedId(template.id)}
            />
          ))}
        </div>
      </div>

      <aside className="hidden rounded-2xl border border-white/10 bg-[#12091f]/86 p-4 shadow-2xl shadow-violet-950/20 backdrop-blur-xl lg:sticky lg:top-20 lg:block">
        <TemplateSummary template={selectedTemplate} />
      </aside>

      <div className="fixed inset-x-3 bottom-[calc(4.6rem+env(safe-area-inset-bottom,0px))] z-40 flex items-center gap-2 rounded-xl border border-violet-300/20 bg-[#10081c]/95 p-2 shadow-2xl shadow-violet-950/40 backdrop-blur-xl lg:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
          <span className="shrink-0 text-lg leading-none">{selectedTemplate.emoji}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-white">{selectedTemplate.name}</p>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-violet-100/70">
              {selectedTemplate.days}d / {paceLabels[selectedTemplate.pace]} / {selectedTemplate.activitiesPerDay}/day
            </p>
          </div>
        </div>
        <Button asChild className="h-11 shrink-0 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-sm shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500">
          <Link href={getTemplateUrl(selectedTemplate.id)}>
            Use
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function TemplateSummary({ template }: { template: ItineraryTemplate }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/15 text-2xl shadow-lg shadow-violet-950/20">
          {template.emoji}
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <Badge className="rounded-full border border-violet-300/20 bg-violet-500/15 text-[10px] text-violet-100">
              Selected
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.06] text-[10px] text-violet-100">
              {paceLabels[template.pace]}
            </Badge>
          </div>
          <h2 className="text-xl font-bold leading-tight text-white">{template.name}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{template.description}</p>
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
          <p className="text-sm font-bold text-white">{template.activitiesPerDay}/day</p>
          <p className="text-[11px] text-muted-foreground">Stops</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.055] p-2.5">
          <SlidersHorizontal className="mb-1 h-4 w-4 text-violet-300" />
          <p className="truncate text-sm font-bold capitalize text-white">{template.pace}</p>
          <p className="text-[11px] text-muted-foreground">Pace</p>
        </div>
      </div>

      <p className="rounded-xl border border-white/10 bg-white/[0.045] p-3 text-sm leading-relaxed text-violet-100/80">
        {paceDescriptions[template.pace]} Alley will use this as structure, then fill it with real local spots for your city.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {template.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="rounded-full border border-white/10 bg-white/[0.055] text-[11px] text-violet-100/75">
            {tag}
          </Badge>
        ))}
      </div>

      <Button asChild className="h-11 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500">
        <Link href={getTemplateUrl(template.id)}>
          <Sparkles className="mr-2 h-4 w-4" />
          Use this template
        </Link>
      </Button>
    </div>
  );
}
