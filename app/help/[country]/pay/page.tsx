import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft, CreditCard } from "@/components/ui/icons";
import { HELP_COUNTRIES, helpCountry } from "@/lib/help/phrases";
import { PAY_CHECKED_AT, PAY_SECTIONS, payGuide } from "@/lib/help/pay";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_COUNTRIES.map((country) => ({ country: country.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const country = helpCountry((await params).country);
  return country ? { title: `How to pay in ${country.name}`, description: `Cards, cash, wallets, transit cards and ATMs for visitors to ${country.name}.` } : {};
}

const checked = new Date(`${PAY_CHECKED_AT}T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function HelpPayPage({ params }: { params: Promise<{ country: string }> }) {
  const country = helpCountry((await params).country);
  const guide = country && payGuide(country.slug);
  if (!country || !guide) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link href={`/help/${country.slug}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {country.name} phrases
      </Link>
      <PageHeader eyebrow={`${country.flag} ${country.name}`} eyebrowIcon={CreditCard} title="How can I pay here?"
        lede={`What works for visitors, checked ${checked}. Rules change: trust the signs at the counter.`} />
      <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
        Need to ask? <Link href={`/help/${country.slug}#h-pay`} className="font-semibold underline">Show the paying phrases</Link>
        {country.language !== "en" ? ` in ${country.languageName}.` : "."}
      </p>
      {PAY_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`pay-${section.id}`} className="mt-6 rounded-2xl bg-surface p-4 shadow-surface">
          <h2 id={`pay-${section.id}`} className="font-semibold text-foreground">{section.title}</h2>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-base leading-7 text-foreground">
            {guide[section.id].map((point) => <li key={point}>{point}</li>)}
          </ul>
        </section>
      ))}
      <section aria-labelledby="pay-tipping" className="mt-6 rounded-2xl bg-surface p-4 shadow-surface">
        <h2 id="pay-tipping" className="font-semibold text-foreground">Tipping</h2>
        <p className="mt-2 text-base leading-7 text-foreground">{guide.tipping}</p>
      </section>
      <details className="mt-6 text-sm text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer items-center">Sources ({guide.sources.length})</summary>
        <ul className="mt-2 flex flex-col gap-1 break-all">
          {guide.sources.map((url) => <li key={url}><a href={url} rel="noopener noreferrer nofollow" target="_blank" className="underline">{url}</a></li>)}
        </ul>
      </details>
    </main>
  );
}
