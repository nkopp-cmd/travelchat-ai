import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ItineraryInsight } from "@/lib/itineraries/normalize-daily-plans";
import { Bus, Lightbulb, Sparkles } from "lucide-react";

interface ItineraryInsightsPanelProps {
  insights: ItineraryInsight[];
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
}

function getInsightTone(kind: ItineraryInsight["kind"]) {
  if (kind === "transport") {
    return {
      Icon: Bus,
      itemClass:
        "border-sky-300/18 bg-sky-400/8 text-sky-100",
      iconClass: "text-sky-300",
    };
  }

  if (kind === "local") {
    return {
      Icon: Lightbulb,
      itemClass:
        "border-amber-300/18 bg-amber-400/8 text-amber-100",
      iconClass: "text-amber-300",
    };
  }

  return {
    Icon: Sparkles,
    itemClass:
      "border-violet-300/18 bg-violet-400/8 text-violet-100",
    iconClass: "text-violet-300",
  };
}

export function ItineraryInsightsPanel({
  insights,
  title = "Trip notes",
  description = "Local context, transport notes, and practical advice for the full trip.",
  compact = false,
  className,
}: ItineraryInsightsPanelProps) {
  if (insights.length === 0) return null;

  const localCount = insights.filter((insight) => insight.kind === "local").length;
  const transportCount = insights.filter((insight) => insight.kind === "transport").length;
  const groups = [
    {
      kind: "transport" as const,
      title: "Getting around",
      items: insights.filter((insight) => insight.kind === "transport"),
    },
    {
      kind: "local" as const,
      title: "Local tips",
      items: insights.filter((insight) => insight.kind === "local"),
    },
    {
      kind: "insight" as const,
      title: "Trip context",
      items: insights.filter((insight) => insight.kind === "insight"),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <section
      className={cn(
        "rounded-xl border border-white/10 bg-[#130b22]/76 shadow-xl shadow-violet-950/10 backdrop-blur-xl",
        compact ? "p-3" : "p-3 sm:p-4 md:p-5",
        className
      )}
      aria-label={title}
    >
      <div className={cn("flex gap-3", compact ? "mb-2 items-center justify-between" : "mb-3 items-start justify-between")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" aria-hidden="true" />
            <h2 className={cn("font-bold leading-tight text-foreground", compact ? "text-sm" : "text-base sm:text-xl")}>
              {title}
            </h2>
          </div>
          {!compact && description && (
            <p className={cn("mt-1 max-w-2xl text-muted-foreground", compact ? "text-xs" : "text-xs leading-relaxed sm:text-sm")}>
              {description}
            </p>
          )}
        </div>
        <Badge
          variant="secondary"
          className="h-7 w-fit shrink-0 rounded-full border border-violet-300/20 bg-violet-400/12 px-2.5 text-[11px] text-violet-100"
        >
          {insights.length} {insights.length === 1 ? "tip" : "tips"}
        </Badge>
      </div>

      {!compact && (localCount > 0 || transportCount > 0) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {localCount > 0 && (
            <Badge
              variant="secondary"
              className="h-6 rounded-full border border-amber-300/20 bg-amber-400/10 px-2 text-[10px] text-amber-100"
            >
              {localCount} local
            </Badge>
          )}
          {transportCount > 0 && (
            <Badge
              variant="secondary"
              className="h-6 rounded-full border border-sky-300/20 bg-sky-400/10 px-2 text-[10px] text-sky-100"
            >
              {transportCount} transport
            </Badge>
          )}
        </div>
      )}

      <div className={cn("space-y-2", !compact && "sm:space-y-3")}>
        {groups.map((group) => {
          const { Icon, itemClass, iconClass } = getInsightTone(group.kind);

          return (
            <div key={group.kind} className="space-y-1.5">
              {!compact && (
                <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-violet-100/62">
                  {group.title}
                </h3>
              )}
              <div className={cn("grid grid-cols-1", compact ? "gap-2" : "gap-2 md:grid-cols-2 lg:grid-cols-1")}>
                {group.items.map((insight) => (
                  <article key={insight.id} className={cn("rounded-lg border p-2.5", !compact && "sm:p-3", itemClass)}>
                    <div className="flex items-start gap-3">
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", !compact && "h-5 w-5", iconClass)} aria-hidden="true" />
                      <div className="min-w-0">
                        <h4 className="break-words text-sm font-semibold leading-tight text-foreground">{insight.label}</h4>
                        <p className={cn("mt-1 break-words leading-relaxed text-muted-foreground", compact ? "text-xs" : "text-sm")}>
                          {insight.text}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
