import { cn } from "@/lib/utils";

/** Hosted signup for the shared Seoul newsletter (shared/plans/seoul-living-newsletter.md "Signup contract"). */
export const SEOUL_LIVING_URL = "https://nilsgroove.com/seoul-living?src=localley";

/**
 * Plain link, 0 KB JS: the address is collected and confirmed on nilsgroove.com only, never here.
 */
export function SeoulLivingLink({ className }: { className?: string }) {
  return (
    <aside className={cn("rounded-2xl bg-surface px-5 py-4 shadow-surface", className)}>
      <p className="font-semibold">Seoul Living</p>
      <p className="mt-1 text-sm text-muted-foreground">
        One short email each Monday from Nils, with picks from Atlas, Localley and TripGuide.
      </p>
      <a href={SEOUL_LIVING_URL} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
        Get the weekly Seoul Living email
      </a>
    </aside>
  );
}
