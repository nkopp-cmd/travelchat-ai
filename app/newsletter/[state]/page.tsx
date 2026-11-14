import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { Mail } from "@/components/ui/icons";
import { NEWSLETTER_STATES, type NewsletterState } from "@/lib/newsletter/states";

// Static answer pages for the form and link endpoints. No data, edge-cached, never indexed.
export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(NEWSLETTER_STATES).map((state) => ({ state }));
export const metadata: Metadata = { title: "Newsletter | Localley", robots: { index: false, follow: true } };

const RETRY_FORM: ReadonlySet<NewsletterState> = new Set(["unsubscribed", "invalid", "check-email", "retry"]);

export default async function NewsletterStatePage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  if (!(state in NEWSLETTER_STATES)) notFound();
  const key = state as NewsletterState;
  const copy = NEWSLETTER_STATES[key];
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <PageHeader eyebrow="Newsletter" eyebrowIcon={Mail} title={copy.title} lede={copy.lede} />
      {RETRY_FORM.has(key) ? <LocalleySignup source={`newsletter-${key}`} className="mt-8" /> : null}
      <p className="mt-8 text-[15px]">
        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href="/spots">Browse places locals rate</Link>
      </p>
    </main>
  );
}
