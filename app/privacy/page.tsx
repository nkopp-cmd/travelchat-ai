import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo/meta";
import { PageHeader } from "@/components/layout/page-header";
import { ShieldCheck } from "@/components/ui/icons";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Privacy policy",
    description: "What Localley stores about you, why, which services help us run it, cookies, and how to have it deleted.",
    path: "/privacy",
  }),
};

// Public, static and edge-cached (cloudflare/opennext/edge-html-cache.ts). No account data.
export const dynamic = "force-static";

const CONTACT = "nkopp@my-goodlife.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Privacy", url: "/privacy" }]} />
      <PageHeader eyebrow="Legal" eyebrowIcon={ShieldCheck} title="Privacy policy"
        lede="Localley helps you find local spots and plan trips in Asian cities. This page explains, in plain words, what we keep about you and why." />
      <div className="mt-8 space-y-8 text-[15px] leading-7 text-muted-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">
        <p className="text-sm">Last updated: 14 November 2026</p>
        <section>
          <h2>What we store</h2>
          <ul>
            <li>Your account: email address and name.</li>
            <li>What you save: saved spots, itineraries and trip stories.</li>
            <li>What you send us: spot submissions, photos you upload, and your chat messages with the trip planner.</li>
            <li>If you pay for a plan: your plan and its status. Stripe handles the payment; we never see or store your card number.</li>
          </ul>
          <p>You can browse spots and use the phrase cards without an account.</p>
        </section>
        <section>
          <h2>Newsletter</h2>
          <p>If you sign up for the Localley newsletter, we store your email address, the page where you signed up, the time you confirmed and the consent text you agreed to. We send the newsletter only after you confirm the link in our first email. Every issue has a one-click unsubscribe link; after you unsubscribe we keep only the address and the date, so we never email you again by mistake.</p>
        </section>
        <section>
          <h2>Google sign-in</h2>
          <p>When you sign in with Google, we receive only your name and email address. We use them to create and identify your Localley account. We do not read your Google contacts, files, calendar or any other Google data.</p>
        </section>
        <section>
          <h2>How we use it</h2>
          <p>We use your data only to run Localley: to sign you in, keep your saved spots and trips, build itineraries, show your submissions, and send the emails you ask for (for example, a sign-in link). We do not sell your data, and we do not use it for advertising.</p>
        </section>
        <section>
          <h2>Who helps us run Localley</h2>
          <p>We use service providers that process data on our behalf: Cloudflare and Supabase (hosting and storage), Stripe (payments), Resend (email), and AI providers that write itinerary and chat answers from the text you enter. Map and place details come from map providers such as Google Maps, Kakao and OpenStreetMap.</p>
        </section>
        <section>
          <h2>Cookies</h2>
          <p>We use a sign-in cookie to keep you signed in. We do not use advertising or tracking cookies.</p>
        </section>
        <section>
          <h2>Deletion and your rights</h2>
          <p>You can ask us to show, correct or delete your data at any time. Email <a className="text-primary underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address on your account. We delete your account and its data on request.</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>Questions about privacy: <a className="text-primary underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
        </section>
      </div>
    </main>
  );
}
