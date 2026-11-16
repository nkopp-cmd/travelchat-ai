import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QUICK_START_OFFER } from "@/lib/offer-copy";

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

/** Server-rendered link to the free planner plus the one offer line. No client JS. */
export function FreePlanLink({ href = "/itineraries/new", label, testId }: { href?: string; label: string; testId: string }) {
  return (
    <div className="mt-8">
      <Button asChild variant="secondary" className="h-12 w-full rounded-xl text-base" size="lg">
        <Link href={href} prefetch={false} data-testid={testId}>
          <span className="truncate">{label}</span>
        </Link>
      </Button>
      <p className="mt-2 text-center text-sm text-muted-foreground">{QUICK_START_OFFER}</p>
    </div>
  );
}

/** Server-rendered link from a help guide to the free planner. No client JS. */
export function HelpPlanLink({ countrySlug }: { countrySlug: string }) {
  const href = helpPlanHref(countrySlug);
  if (!href) return null;
  return <FreePlanLink href={href} label={`Plan a free day in ${HELP_PLAN_CITY[countrySlug]}`} testId="help-plan-trip" />;
}
