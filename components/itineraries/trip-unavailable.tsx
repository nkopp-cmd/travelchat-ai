"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TripUnavailableView({ candidate = false, pending = false }: {
  candidate?: boolean; pending?: boolean;
}) {
  const suffix = candidate ? "?data_candidate=d1" : "";
  const focus = "h-auto min-h-11 whitespace-normal px-4 py-3 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";
  return <section aria-labelledby="trip-unavailable-title" aria-busy={pending || undefined}
    className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-10">
      <div aria-hidden="true" className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background text-foreground">
        <Compass className="h-6 w-6" />
      </div>
      <p className="mb-3 text-sm font-medium text-muted-foreground">Let’s find your next stop</p>
      <h1 id="trip-unavailable-title" className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        This trip is unavailable
      </h1>
      <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
        It may be private or the link may no longer be valid. Return to your trips or discover somewhere new.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {pending ? <>
          <Button disabled className={focus}><ArrowLeft aria-hidden="true" />My trips</Button>
          <Button disabled variant="outline" className={focus}>Explore places</Button>
        </> : <>
          <Button asChild className={focus}>
            <Link prefetch={false} href={`/itineraries${suffix}`}><ArrowLeft aria-hidden="true" />My trips</Link>
          </Button>
          <Button asChild variant="outline" className={focus}>
            <Link prefetch={false} href={`/spots${suffix}`}>Explore places</Link>
          </Button>
        </>}
      </div>
    </div>
  </section>;
}

export function TripUnavailable({ candidateHost }: { candidateHost: boolean }) {
  const search = useSearchParams();
  const flags = search.getAll("data_candidate");
  return <TripUnavailableView candidate={candidateHost && flags.length === 1 && flags[0] === "d1"} />;
}
