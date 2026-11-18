import type { Metadata } from "next";
import Link from "next/link";
import { PageEyebrow } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

// Root 404 (Push AM1). Unknown paths reach this page instead of a sign-up redirect (middleware.ts PRIVATE_SECTIONS):
// a visitor from a dead link gets the two real next steps, crawlers get a 404 (Next.js adds noindex itself).
export const metadata: Metadata = {
  title: { absolute: "Page not found | Localley" },
};

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <PageEyebrow>Error 404</PageEyebrow>
      <h1 className="text-3xl font-bold">This page does not exist</h1>
      <p className="text-base text-muted-foreground">
        The link may be old or mistyped. You can still plan a trip with local spots in Seoul, Tokyo, Bangkok and more
        — the first plan is free and needs no account.
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/itineraries/new" data-testid="not-found-plan">Plan a free trip</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
          <Link href="/spots">Browse local spots</Link>
        </Button>
      </div>
    </section>
  );
}
