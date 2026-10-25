import { Languages } from "@/components/ui/icons";
import { driverCard } from "@/lib/help/driver-card";

/**
 * "Show to driver" for one spot: a full-screen card opened with CSS :target (no client JS), so it works from a
 * cached page without signal. Same high-contrast token card as the Help phrase cards.
 */
export function DriverCardLink({ spotId, compact = false }: { spotId: string; compact?: boolean }) {
  return (
    <a href={`#driver-${spotId}`} data-testid="spot-driver-card-link"
      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-raised font-semibold text-foreground transition-colors hover:bg-surface ${compact ? "min-h-11 text-sm" : "min-h-12 text-base"}`}>
      <Languages className="size-4" aria-hidden="true" /> Show to driver
    </a>
  );
}

/**
 * The card itself. Render it once, directly under the page root: an ancestor with backdrop-filter or transform
 * (the liquid cards) turns position:fixed into "fixed to that card", which clipped the first version.
 */
export function DriverCardDialog({ spotId, name, nameField, address }: { spotId: string; name: string; nameField: unknown; address: string }) {
  const card = driverCard({ name, nameField, address });
  const wrap = card.language === "ko" ? "[word-break:keep-all]" : "";
  return (
      <div id={`driver-${spotId}`} role="dialog" aria-label={`Show ${name} to a driver`}
        className="fixed inset-0 z-[60] hidden flex-col overflow-y-auto bg-foreground p-6 text-background target:flex">
        <a href="#" className="ml-auto inline-flex min-h-11 items-center rounded-full bg-background px-5 text-base font-semibold text-foreground">Close</a>
        <div className="flex flex-1 flex-col justify-center gap-5">
          <p lang={card.language} className={`text-[clamp(1.75rem,7vw,3rem)] font-bold leading-tight ${wrap}`}>{card.request.text}</p>
          {card.request.roman && <p className="text-lg text-background/75">{card.request.roman}</p>}
          <div className="rounded-2xl bg-background/10 p-4">
            {card.localName && <p lang={card.language} className={`text-[clamp(2rem,8vw,3.5rem)] font-bold leading-tight ${wrap}`}>{card.localName}</p>}
            <p className={card.localName ? "mt-2 text-xl font-semibold" : "text-[clamp(1.75rem,7vw,3rem)] font-bold leading-tight"}>{card.name}</p>
            {card.address && <p className="mt-2 text-lg text-background/80">{card.address}</p>}
          </div>
          <p className="text-base text-background/60">Please take me to this place.{card.language !== "en" ? ` (${card.languageName})` : ""}</p>
        </div>
      </div>
  );
}
