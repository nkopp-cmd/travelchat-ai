import Link from "next/link";
import { pricingLine } from "@/lib/seo/pricing-line";

/** One body link to /pricing (server-rendered, no client JS). Keep it outside <header>/<nav>/<footer>. */
export function PricingLineLink({ pageKey, className }: { pageKey: string; className?: string }) {
  const line = pricingLine(pageKey);
  return (
    <p data-testid="pricing-line" className={className ?? "text-sm leading-6 text-muted-foreground"}>
      {line.before}
      <Link href="/pricing" prefetch={false} className="font-semibold text-foreground underline underline-offset-2">
        {line.anchor}
      </Link>
      {line.after}
    </p>
  );
}
