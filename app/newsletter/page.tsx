import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { Mail } from "@/components/ui/icons";
import { pageMeta } from "@/lib/seo/meta";

export const metadata: Metadata = pageMeta({
  title: "Newsletter: Asia travel picks by email",
  description: "The free Localley newsletter: places locals rate in Seoul, Tokyo, Bangkok and Singapore, plus how to pay, get around and plan your days. About twice a month.",
  path: "/newsletter",
});

// Public, static and edge-cached (cloudflare/opennext/edge-html-cache.ts). The form posts to /api/newsletter/subscribe.
export const dynamic = "force-static";

export default function NewsletterPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Newsletter", url: "/newsletter" }]} />
      <PageHeader eyebrow="Newsletter" eyebrowIcon={Mail} title="Asia picks, in your inbox"
        lede="One short email about twice a month: places locals rate, and the practical answers you need before you go." />
      <LocalleySignup source="newsletter-page" heading="Get the Localley newsletter" className="mt-8" />
      <div className="mt-10 space-y-6 text-[15px] leading-7 text-muted-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">
        <section>
          <h2>What you get</h2>
          <ul>
            <li>New top-rated places in <Link className="text-primary underline" href="/spots?city=seoul">Seoul</Link>, <Link className="text-primary underline" href="/spots?city=tokyo">Tokyo</Link>, <Link className="text-primary underline" href="/spots?city=bangkok">Bangkok</Link> and <Link className="text-primary underline" href="/spots?city=singapore">Singapore</Link>, scored by rating per review and local buzz.</li>
            <li>Short how-tos: paying with a foreign card, reading a menu, what is open late.</li>
            <li>One idea for a day plan you can copy into your own trip.</li>
          </ul>
        </section>
        <section>
          <h2>How it works</h2>
          <p>Enter your email. We send one link; your sign-up starts only when you open it. Every issue has a one-click unsubscribe link. We never sell or share your address. Details are in our <Link className="text-primary underline" href="/privacy">privacy policy</Link>.</p>
        </section>
      </div>
    </main>
  );
}
