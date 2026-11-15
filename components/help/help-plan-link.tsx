import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Main planner city per help country. A country without a city with enough spots gets no block. */
export const HELP_PLAN_CITY: Readonly<Record<string, string>> = {
  korea: "Seoul",
  japan: "Tokyo",
  thailand: "Bangkok",
  taiwan: "Taipei",
  singapore: "Singapore",
};

export function helpPlanHref(countrySlug: string): string | null {
  const city = HELP_PLAN_CITY[countrySlug];
  return city ? `/itineraries/new?${new URLSearchParams({ city })}` : null;
}

/** Server-rendered link from a help guide to the free planner. No client JS. */
export function HelpPlanLink({ countrySlug, className = "mt-8" }: { countrySlug: string; className?: string }) {
  const href = helpPlanHref(countrySlug);
  if (!href) return null;
  return (
    <div className={className}>
      <Button asChild variant="secondary" className="h-12 w-full rounded-xl text-base" size="lg">
        <Link href={href} prefetch={false} data-testid="help-plan-trip">
          <span className="truncate">Plan a free day in {HELP_PLAN_CITY[countrySlug]}</span>
        </Link>
      </Button>
      <p className="mt-2 text-center text-sm text-muted-foreground">First plan free · no sign-up</p>
    </div>
  );
}
