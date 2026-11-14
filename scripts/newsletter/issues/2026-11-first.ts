import type { NewsletterIssue } from "../../../emails/newsletter-issue-email";

// Issue 1. Facts from the live site on 2026-11-14 (Seoul hub counts, lib/help/pay.json checked guidance).
const SITE = "https://www.localley.io";
const utm = (path: string) => `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=newsletter&utm_medium=email&utm_campaign=2026-11-first`;

export const issue: NewsletterIssue = {
  subject: "Hidden gems in Seoul, and how to pay without stress",
  preview: "41 Seoul places locals rate at the top level, plus three short how-tos for Asia trips.",
  title: "Find the places locals actually rate",
  intro:
    "Welcome to the first Localley newsletter. Each issue gives you a few places worth your time and one practical answer before you go. This time: how we rate places, and how to pay in Korea.",
  picks: [
    {
      city: "Seoul",
      title: "Do not trust the review count",
      body: "A 4.8 from 300 reviews usually beats a 4.3 from 20,000: the people who find it love it, and there is no tour-bus queue. We score 458 Seoul places this way. 41 reach the top level, Legendary Alley.",
      url: utm("/spots?city=seoul"),
      linkLabel: "See Seoul's top-rated places",
    },
    {
      city: "Korea",
      title: "Paying in Korea: card first, cash for the subway card",
      body: "Foreign Visa and Mastercard work in most shops, restaurants, convenience stores and taxis. Buy a Tmoney card at a convenience store and keep some cash to top it up.",
      url: utm("/help/korea/pay"),
      linkLabel: "Read the Korea payment guide",
    },
    {
      city: "Tokyo · Bangkok · Singapore",
      title: "Same method, three more cities",
      body: "Every enabled city has its own list of places scored by rating per review and local buzz. Filter by area, by category, or by what is open now.",
      url: utm("/spots?city=tokyo"),
      linkLabel: "Start with Tokyo",
    },
  ],
  cta: { label: "Plan a trip with Localley", url: utm("/itineraries/new") },
};
