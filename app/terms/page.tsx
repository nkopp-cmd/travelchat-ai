import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Newspaper } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The short rules for using Localley.",
  alternates: { canonical: "/terms" },
};

// Public, static and edge-cached (cloudflare/opennext/edge-html-cache.ts). No account data.
export const dynamic = "force-static";

const CONTACT = "nkopp@my-goodlife.com";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <PageHeader eyebrow="Legal" eyebrowIcon={Newspaper} title="Terms of use"
        lede="By using Localley you agree to these short terms." />
      <div className="mt-8 space-y-8 text-[15px] leading-7 text-muted-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">
        <p className="text-sm">Last updated: 31 October 2026</p>
        <section>
          <h2>The service</h2>
          <p>Localley shows local spots and helps you plan trips. Spot details, opening hours, prices and AI-written itineraries can be wrong or out of date. Check important details (opening hours, bookings, safety) before you go. You use the suggestions at your own risk.</p>
        </section>
        <section>
          <h2>Your account</h2>
          <p>Keep your sign-in details safe. You are responsible for what happens in your account. Tell us if you think someone else is using it.</p>
        </section>
        <section>
          <h2>What you post</h2>
          <ul>
            <li>Only submit spots, photos and text that you have the right to share.</li>
            <li>Do not post anything illegal, hateful, misleading or that shows private people without their consent.</li>
            <li>You keep ownership of your content. You allow Localley to show it in the app so other travellers can use it.</li>
            <li>We may review, edit or remove content that breaks these rules.</li>
          </ul>
        </section>
        <section>
          <h2>Fair use</h2>
          <p>Do not misuse Localley: no scraping, no automated mass requests, and no attempts to break or bypass its security or usage limits.</p>
        </section>
        <section>
          <h2>Paid plans</h2>
          <p>Paid plans renew until you cancel them. You can cancel in your settings; the plan stays active until the end of the paid period.</p>
        </section>
        <section>
          <h2>Changes and ending</h2>
          <p>We may change Localley or these terms. We may suspend accounts that break them. You can stop using Localley and ask us to delete your account at any time.</p>
        </section>
        <section>
          <h2>Privacy and contact</h2>
          <p>Our <Link className="text-primary underline" href="/privacy">privacy policy</Link> explains how we handle your data. Questions: <a className="text-primary underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
        </section>
      </div>
    </main>
  );
}
