import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo/meta";
import { pageCardImage } from "@/lib/seo/page-card";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Languages } from "@/components/ui/icons";
import { HELP_COUNTRIES } from "@/lib/help/phrases";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { FreePlanLink } from "@/components/help/help-plan-link";

// /help is one of the two pages Google indexes (GSC 2026-11-21): give it crawl paths to the Ring-1 city hubs and
// the template picker, the entry pages of the planner (Push BK3).
const HELP_HUB_LINKS = [
  { href: "/spots?city=seoul", label: "Seoul" },
  { href: "/spots?city=tokyo", label: "Tokyo" },
  { href: "/spots?city=bangkok", label: "Bangkok" },
  { href: "/spots?city=singapore", label: "Singapore" },
] as const;

export const metadata: Metadata = pageMeta({
  title: "Help me say this",
  description: "Show-to-staff phrase cards in Korean, Japanese, Thai, Vietnamese and Chinese for travellers in Asia.",
  path: "/help",
  image: pageCardImage("help"),
});

export const dynamic = "force-static";

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Help", url: "/help" }]} />
      <PageHeader eyebrow="Help" eyebrowIcon={Languages} title="Help me say this"
        lede="Pick the country you are in. Tap a phrase and show the big card to staff or a driver. Works without signal once the page is open." />
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {HELP_COUNTRIES.map((country) => (
          <li key={country.slug}>
            <Link href={`/help/${country.slug}`}
              className="flex min-h-24 flex-col justify-center gap-1 rounded-2xl bg-surface p-4 shadow-surface transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <span className="text-2xl" aria-hidden="true">{country.flag}</span>
              <span className="font-semibold text-foreground">{country.name}</span>
              <span className="text-sm text-muted-foreground">{country.languageName}</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* Push CL4: the pay cards are the most used help pages but had no link from /help itself. */}
      <section aria-labelledby="help-pay" className="mt-8">
        <h2 id="help-pay" className="text-lg font-semibold text-foreground">How to pay</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {HELP_COUNTRIES.map((country) => (
            <li key={country.slug}>
              <Link href={`/help/${country.slug}/pay`}
                className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold text-foreground shadow-surface hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                Pay in {country.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="help-hubs" className="mt-8">
        <h2 id="help-hubs" className="text-lg font-semibold text-foreground">Local places by city</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {HELP_HUB_LINKS.map((hub) => (
            <li key={hub.href}>
              <Link href={hub.href}
                className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-foreground shadow-surface transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                {hub.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/templates"
              className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-foreground shadow-surface transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              Trip templates
            </Link>
          </li>
        </ul>
        {/* Push DW3: /help is indexed but did not link the A-Z hubs, the full spot list per city. */}
        <p className="mt-3 text-sm text-muted-foreground">
          Every place A to Z:{" "}
          {HELP_HUB_LINKS.map((hub, i) => (
            <span key={hub.label}>
              {i > 0 && " · "}
              <Link href={`/spots/a-z/${hub.label.toLowerCase()}`} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                {hub.label}
              </Link>
            </span>
          ))}
        </p>
      </section>
      <FreePlanLink label="Plan a free trip" testId="help-index-plan-trip" />
      <LocalleySignup source="help-index" className="mt-10" />
    </div>
  );
}
