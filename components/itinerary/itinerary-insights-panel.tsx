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
        "border-sky-200/50 bg-sky-50/85 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
      iconClass: "text-sky-500 dark:text-sky-300",
    };
  }

  if (kind === "local") {
    return {
      Icon: Lightbulb,
      itemClass:
        "border-amber-200/55 bg-amber-50/85 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
      iconClass: "text-amber-500 dark:text-amber-300",
    };
  }

  return {
    Icon: Sparkles,
    itemClass:
      "border-violet-200/50 bg-violet-50/85 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200",
    iconClass: "text-violet-500 dark:text-violet-300",
  };
}

export function ItineraryInsightsPanel({
  insights,
  title = "Trip insights",
  description = "Local notes and transit guidance for the whole itinerary.",
  compact = false,
  className,
}: ItineraryInsightsPanelProps) {
  if (insights.length === 0) return null;

  return (
    <section
      className={cn(
        "rounded-lg border border-violet-200/15 bg-white/75 shadow-lg shadow-violet-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.055]",
        compact ? "p-3" : "p-4 sm:p-5",
        className
      )}
      aria-label={title}
    >
      <div className={cn("flex gap-3", compact ? "mb-2 items-center" : "mb-4 flex-col sm:flex-row sm:items-end sm:justify-between")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden="true" />
            <h2 className={cn("font-bold text-foreground", compact ? "text-sm" : "text-xl")}>
              {title}
            </h2>
          </div>
          {!compact && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <Badge
          variant="secondary"
          className="w-fit shrink-0 border border-violet-200/30 bg-violet-100/80 text-violet-700 dark:border-violet-400/15 dark:bg-violet-900/30 dark:text-violet-300"
        >
          {insights.length} {insights.length === 1 ? "tip" : "tips"}
        </Badge>
      </div>

      <div className={cn("grid grid-cols-1", compact ? "gap-2" : "gap-3 md:grid-cols-2")}>
        {insights.map((insight) => {
          const { Icon, itemClass, iconClass } = getInsightTone(insight.kind);

          return (
            <article key={insight.id} className={cn("rounded-lg border p-3", !compact && "sm:p-4", itemClass)}>
              <div className="flex items-start gap-3">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", !compact && "h-5 w-5", iconClass)} aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{insight.label}</h3>
                  <p className={cn("mt-1 leading-relaxed text-muted-foreground", compact ? "text-xs" : "text-sm")}>
                    {insight.text}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
