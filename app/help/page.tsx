import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Languages } from "@/components/ui/icons";
import { HELP_COUNTRIES } from "@/lib/help/phrases";

export const metadata: Metadata = {
  title: "Help me say this",
  description: "Show-to-staff phrase cards in Korean, Japanese, Thai, Vietnamese and Chinese for travellers in Asia.",
};

export const dynamic = "force-static";

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
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
    </main>
  );
}
