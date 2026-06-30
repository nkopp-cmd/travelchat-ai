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

  return (
    <section
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.045] shadow-xl shadow-violet-950/10 backdrop-blur-xl",
        compact ? "p-3" : "p-3.5 sm:p-4",
        className
      )}
      aria-label={title}
    >
      <div className={cn("flex gap-3", compact ? "mb-2 items-center" : "mb-3 flex-col sm:flex-row sm:items-end sm:justify-between")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" aria-hidden="true" />
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
          className="h-7 w-fit shrink-0 rounded-full border border-violet-300/20 bg-violet-400/12 px-2.5 text-[11px] text-violet-100"
        >
          {insights.length} {insights.length === 1 ? "tip" : "tips"}
        </Badge>
      </div>

      <div className={cn("grid grid-cols-1", compact ? "gap-2" : "gap-2.5 sm:grid-cols-2")}>
        {insights.map((insight) => {
          const { Icon, itemClass, iconClass } = getInsightTone(insight.kind);

          return (
            <article key={insight.id} className={cn("rounded-lg border p-2.5", !compact && "sm:p-3", itemClass)}>
              <div className="flex items-start gap-3">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", !compact && "h-5 w-5", iconClass)} aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-tight text-foreground">{insight.label}</h3>
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
