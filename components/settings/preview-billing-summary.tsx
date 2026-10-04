import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { PreviewBillingSettings } from "@/lib/app-data/preview-billing-settings";

/** No links or payment actions: this is a private, read-only preview of the existing billing state. */
export function PreviewBillingSummary({ summary }: { summary: PreviewBillingSettings | null }) {
  return <section aria-label="Preview billing">
    <Card className="rounded-2xl border-white/10 bg-white/[0.055] shadow-2xl shadow-violet-950/20 backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Preview plan and usage. Checkout and billing changes are unavailable here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {summary ? <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-semibold">{summary.plan}</p>
            <Badge variant="secondary" className="border-white/10 bg-white/10">{summary.status}</Badge>
          </div>
          {summary.periodEnd && <p className="text-sm text-muted-foreground">
            {summary.cancelAtPeriodEnd ? "Subscription ends" : "Billing period ends"}: {summary.periodEnd} (UTC)
          </p>}
          {summary.trialEnd && <p className="text-sm text-muted-foreground">Trial ends: {summary.trialEnd} (UTC)</p>}
          {summary.cancelAtPeriodEnd && <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">
            Cancellation is scheduled for the end of this billing period.
          </p>}
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {summary.usage.map(row => <div key={row.label} className="min-w-0 space-y-2">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                <span>{row.label}</span><span className="tabular-nums text-muted-foreground">{row.used} / {row.limit}</span>
              </div>
              <Progress value={row.percent} aria-label={row.label} aria-valuenow={row.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${row.used} of ${row.limit}` } className="h-2" />
            </div>)}
          </div>
        </> : <p role="status">Preview billing is unavailable for this account.</p>}
      </CardContent>
    </Card>
  </section>;
}
