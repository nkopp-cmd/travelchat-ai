import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ItineraryInsight } from "@/lib/itineraries/normalize-daily-plans";
import { Bus, Lightbulb, Sparkles } from "@/components/ui/icons";

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
        " bg-primary/10 text-foreground",
      iconClass: "text-primary",
    };
  }

  if (kind === "local") {
    return {
      Icon: Lightbulb,
      itemClass:
        " bg-[rgb(var(--ll-warning)/0.14)] text-foreground",
      iconClass: "text-[rgb(var(--ll-warning))]",
    };
  }

  return {
    Icon: Sparkles,
    itemClass:
      " bg-primary/10 text-foreground",
    iconClass: "text-primary",
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
        "rounded-xl bg-surface backdrop-blur-xl",
        compact ? "p-3" : "p-3 sm:p-4 md:p-5",
        className
      )}
      aria-label={title}
    >
      <div className={cn("flex gap-3", compact ? "mb-2 items-center justify-between" : "mb-3 items-start justify-between")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
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
          className="h-7 w-fit shrink-0 rounded-full bg-primary/10 px-2.5 text-xs text-foreground"
        >
          {insights.length} {insights.length === 1 ? "tip" : "tips"}
        </Badge>
      </div>

      {!compact && (localCount > 0 || transportCount > 0) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {localCount > 0 && (
            <Badge
              variant="secondary"
              className="h-6 rounded-full bg-[rgb(var(--ll-warning)/0.14)] px-2 text-xs text-foreground"
            >
              {localCount} local
            </Badge>
          )}
          {transportCount > 0 && (
            <Badge
              variant="secondary"
              className="h-6 rounded-full bg-primary/10 px-2 text-xs text-foreground"
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
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                  {group.title}
                </h3>
              )}
              <div className={cn("grid grid-cols-1", compact ? "gap-2" : "gap-2 md:grid-cols-2 lg:grid-cols-1")}>
                {group.items.map((insight) => (
                  <article key={insight.id} className={cn("rounded-lg p-2.5", !compact && "sm:p-3", itemClass)}>
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
