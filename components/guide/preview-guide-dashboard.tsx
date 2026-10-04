import Link from "next/link";
import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppBackground } from "@/components/layout/app-background";
import type { PreviewGuideApplicationState } from "@/lib/app-data/preview-guide-application-page";

const linkClass = "inline-flex min-h-11 items-center text-sm text-white/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300";

/** Read-only fresh-owner view. Archived earnings and payment actions remain unavailable. */
export function PreviewGuideDashboard({ state }: { state: PreviewGuideApplicationState }) {
  return <AppBackground ambient className="min-h-screen">
    <section aria-label="Guide dashboard preview" className="mx-auto max-w-3xl space-y-6 px-4 pb-28 pt-8 sm:px-6 sm:pb-12">
      <nav aria-label="Preview guide navigation" className="flex flex-wrap justify-between gap-3">
        <Link href="/settings?data_candidate=d1" className={linkClass}><ArrowLeft className="mr-2 h-4 w-4" /> Preview settings</Link>
        <a href="/guide/dashboard?data_candidate=d1" className={linkClass}><RefreshCw className="mr-2 h-4 w-4" /> Reload dashboard</a>
      </nav>
      <header><Badge className="mb-3">Creator program preview</Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Guide dashboard</h1>
        <p className="mt-3 max-w-xl text-white/75">Check your saved application and local expertise.</p>
      </header>
      <Card className="liquid-panel border-white/10">
        <CardHeader><CardTitle>Application status</CardTitle><CardDescription>Preview applications only. Earnings, payouts, Stripe onboarding and email delivery are unavailable here.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {state.kind === "unavailable" ? <p role="status">Preview guide dashboard is unavailable for this account.</p>
            : state.kind === "new" ? <>
              <p role="status">You have no saved preview application.</p>
              <Button asChild className="min-h-11"><Link href="/guide/apply?data_candidate=d1">Apply as a guide</Link></Button>
            </> : <section aria-label="Saved preview application" className="space-y-4">
              <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5 text-violet-300" /> Pending application</div>
              <p role="status">Your preview application is stored. Approval and payments remain unavailable.</p>
              <dl className="space-y-4 text-sm">
                <div><dt className="font-medium">About you</dt><dd className="mt-1 whitespace-pre-wrap break-words text-white/75">{state.bio}</dd></div>
                <div><dt className="font-medium">Your cities</dt><dd className="mt-1 break-words text-white/75">{state.cities.join(", ")}</dd></div>
                <div><dt className="font-medium">Specialties</dt><dd className="mt-1 break-words text-white/75">{state.specialties.join(", ") || "None selected"}</dd></div>
              </dl>
              <Link href="/guide/apply?data_candidate=d1" className={linkClass}>View application</Link>
            </section>}
        </CardContent>
      </Card>
    </section>
  </AppBackground>;
}
