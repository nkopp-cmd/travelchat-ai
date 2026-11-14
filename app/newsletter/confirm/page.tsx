import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Mail } from "@/components/ui/icons";
import { isToken } from "@/lib/newsletter/store";
import { redirect } from "next/navigation";

// Mail links land here. The page only shows a button: the change happens on POST, so link scanners in mail
// systems cannot confirm an address by opening the link. Private: the URL holds a personal token.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Newsletter | Localley", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function NewsletterConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  if (!isToken(token)) redirect("/newsletter/invalid");
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <PageHeader eyebrow="Newsletter" eyebrowIcon={Mail} title="Confirm your sign-up" lede="One more tap: confirm that you want the Localley newsletter." />
      <form method="post" action="/api/newsletter/confirm" className="mt-8">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" className="min-h-12 px-6 font-semibold">Confirm my sign-up</Button>
      </form>
    </main>
  );
}
