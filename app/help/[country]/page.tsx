import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft, Languages } from "@/components/ui/icons";
import { HELP_COUNTRIES, helpCountry, helpPhrases } from "@/lib/help/phrases";

// Static per country: the cards open with CSS :target only (no client JS), so they keep working without signal.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_COUNTRIES.map((country) => ({ country: country.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const country = helpCountry((await params).country);
  return country
    ? { title: `Help me say this in ${country.languageName}`, description: `Show-to-staff ${country.languageName} phrase cards for ${country.name}.` }
    : {};
}

/** "{n}" marks a number the traveller points at or shows with fingers. */
function withBlank(text: string) {
  return text.split("{n}").flatMap((part, i) => (i === 0 ? [part] : [<span key={i} className="mx-1 inline-block h-[0.2em] min-w-[1.5em] rounded-full bg-current align-baseline" aria-label="number">&nbsp;</span>, part]));
}

export default async function HelpCountryPage({ params }: { params: Promise<{ country: string }> }) {
  const country = helpCountry((await params).country);
  if (!country) notFound();
  const groups = helpPhrases(country);
  // Korean wraps at spaces; Japanese and Chinese have none and must keep normal breaking.
  const wrap = country.language === "ko" ? "[word-break:keep-all]" : "";
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6" lang="en">
      <Link href="/help" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All countries
      </Link>
      <PageHeader eyebrow={`${country.flag} ${country.name}`} eyebrowIcon={Languages} title="Help me say this"
        lede={`Tap a phrase to show it full screen in ${country.languageName}.`} />
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`h-${group.id}`} className="mt-8">
          <h2 id={`h-${group.id}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h2>
          <ul className="flex flex-col gap-2">
            {group.phrases.map((phrase) => (
              <li key={phrase.id}>
                <a href={`#card-${phrase.id}`}
                  className="block rounded-2xl bg-surface p-4 shadow-surface transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  <span lang={country.language} className={`block text-xl font-semibold leading-snug text-foreground ${wrap}`}>{withBlank(phrase.text)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{phrase.en.replace("{n}", "…")}</span>
                </a>
                {/* Full-screen card: shown while its id is the URL fragment. */}
                <div id={`card-${phrase.id}`} role="dialog" aria-label={phrase.en.replace("{n}", "…")}
                  className="fixed inset-0 z-[60] hidden flex-col overflow-y-auto bg-foreground p-6 text-background target:flex">
                  <a href="#" className="ml-auto inline-flex min-h-11 items-center rounded-full bg-background px-5 text-base font-semibold text-foreground">Close</a>
                  <div className="flex flex-1 flex-col justify-center gap-6">
                    <p lang={country.language} className={`text-[clamp(2.5rem,9vw,4.5rem)] font-bold leading-tight ${wrap}`}>{withBlank(phrase.text)}</p>
                    {phrase.roman && <p className="text-xl text-background/75">{phrase.roman.replace("{n}", "…")}</p>}
                    <p className="text-lg text-background/60">{phrase.en.replace("{n}", "…")}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
