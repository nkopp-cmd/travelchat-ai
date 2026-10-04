import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PreviewBillingSummary } from "@/components/settings/preview-billing-summary";
import type { previewProfile } from "@/lib/app-data/preview-profile";

export function PreviewProfile({ profile }: { profile: Awaited<ReturnType<typeof previewProfile>> | null }) {
  return <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-28 pt-5 sm:px-6 sm:pb-10 sm:pt-8">
    <Card className="rounded-2xl border-white/10 bg-white/[0.055] shadow-2xl shadow-violet-950/20 backdrop-blur-xl">
      <CardHeader>
        <CardTitle><h1>Preview profile</h1></CardTitle>
        <CardDescription>Your private preview trips and billing. Progress, profile editing and sharing are unavailable here.</CardDescription>
      </CardHeader>
      <CardContent>
        {profile ? <section aria-label="Your preview trips" className="space-y-3">
          <h2 className="font-semibold">Your preview trips ({profile.trips.length})</h2>
          {profile.trips.length === 0 && <p className="text-sm text-muted-foreground">No preview trips yet.</p>}
          {profile.trips.slice(0, 12).map(trip => <Link key={trip.id}
            href={`/itineraries/${trip.id}?data_candidate=d1`}
            className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
            <p className="break-words font-medium">{trip.title}</p>
            <p className="text-sm text-muted-foreground">{trip.city} · {trip.days} {trip.days === 1 ? "day" : "days"}</p>
          </Link>)}
          {profile.trips.length > 12 && <p className="text-sm text-muted-foreground">Showing your 12 most recent preview trips.</p>}
          <Link href="/settings?data_candidate=d1" className="inline-block py-2 text-sm underline">Preview settings</Link>
        </section> : <p role="status">Preview profile is unavailable for this account.</p>}
      </CardContent>
    </Card>
    {profile && <PreviewBillingSummary summary={profile.billing} />}
  </div>;
}
