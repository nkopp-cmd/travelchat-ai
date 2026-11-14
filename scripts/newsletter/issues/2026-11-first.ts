import type { NewsletterIssue } from "../../../emails/newsletter-issue-email";

// Issue 1. Every number is from production D1 (visible spots) on 2026-11-14; payment guidance from lib/help/pay.json.
const SITE = "https://www.localley.io";
const utm = (path: string) => `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=newsletter&utm_medium=email&utm_campaign=2026-11-first`;
const spot = (id: string) => utm(`/spots/${id}`);

// Telegram approval tag for the list send (Nils replies "ok NL-20261114-rich").
export const approval = "NL-20261114-rich";

export const issue: NewsletterIssue = {
  subject: "41 Seoul places locals rate at the top, and how to pay in Korea",
  preview: "Our Seoul scores in one chart, the five most local Legendary spots, and a payment tip for Korea.",
  title: "Find the places locals actually rate",
  intro:
    "Welcome to the first Localley newsletter. We score every place from 1 to 6 by rating per review and by how often locals post about it. This issue: the Seoul scores, five places with almost no tourists, and how to pay in Korea.",
  hero: { photo: "seoul", alt: "Neon signs in a Seoul side street at night", credit: "Photo: Unsplash" },
  stats: [
    { value: "458", label: "Seoul places rated" },
    { value: "41", label: "Legendary Alley" },
    { value: "4", label: "cities live" },
  ],
  scores: {
    title: "How Seoul scores",
    caption: "Most places we keep are Local Favorite or better. Tourist traps do not make the list.",
    rows: [
      { level: 6, count: 41 },
      { level: 5, count: 170 },
      { level: 4, count: 159 },
      { level: 3, count: 46 },
      { level: 2, count: 42 },
    ],
    url: utm("/spots?city=seoul"),
    linkLabel: "See all 458 Seoul places",
  },
  ranked: {
    title: "Five Legendary spots with almost no tourists",
    caption: "Top score, sorted by the share of locals among visitors.",
    spots: [
      { name: "Haengdang-dong Local Market", area: "Seongdong-gu", level: 6, localShare: 98,
        note: "A neighbourhood market for residents. No tour groups.", url: spot("067bacc4-825e-4e60-bab8-2720785c15bf") },
      { name: "Changsin-dong Sewing Village", area: "Jongno-gu", level: 6, localShare: 98,
        note: "The garment district where Seoul fashion starts, with cheap workers' eateries.", url: spot("d1e6b2f9-0ff7-4151-9142-1052db9eca25") },
      { name: "Sadang Station Underground", area: "Dongjak-gu", level: 6, localShare: 98,
        note: "Underground shopping at very low prices for clothes, shoes and accessories.", url: spot("c23fb655-d962-4cd5-8dd0-362fb8732b1f") },
      { name: "Dongmyo Flea Market", area: "Jongno-gu", level: 6, localShare: 95,
        note: "A big outdoor flea market where grandmas sell everything. Go early for vintage.", url: spot("f6b6d93a-4993-4ce7-8691-afe8b2ce3d09") },
      { name: "Hongje-dong Hills", area: "Seodaemun-gu", level: 6, localShare: 95,
        note: "Hillside streets with wide city views, old apartment blocks and local markets.", url: spot("0afb50c3-64dd-4e22-8600-edcf29a1879f") },
    ],
  },
  cityShares: {
    title: "Where hidden gems are easiest to find",
    caption: "Share of rated places at Hidden Gem or Legendary Alley.",
    rows: [
      { city: "Seoul", share: 46, url: utm("/spots?city=seoul") },
      { city: "Tokyo", share: 43, url: utm("/spots?city=tokyo") },
      { city: "Singapore", share: 37, url: utm("/spots?city=singapore") },
      { city: "Bangkok", share: 32, url: utm("/spots?city=bangkok") },
    ],
    source: "Seoul 458, Tokyo 514, Singapore 442, Bangkok 389 rated places. Localley data, 14 Nov 2026.",
  },
  trend: {
    icon: "trend",
    eyebrow: "Our weekly social scan",
    title: "Dongmyo Flea Market led Seoul two weeks in a row",
    body: "It was the top Seoul spot in our scan of local posts in the weeks of 12 and 19 October. In Bangkok, Yaowarat (Chinatown) street food led the week of 19 October.",
    url: spot("f6b6d93a-4993-4ce7-8691-afe8b2ce3d09"),
    linkLabel: "Open Dongmyo Flea Market",
  },
  tip: {
    icon: "card",
    eyebrow: "Before you go · Korea",
    title: "Pay by card, keep cash for the subway card",
    body: "Foreign Visa and Mastercard work in most shops, restaurants, convenience stores and taxis. Buy a T-money card at a convenience store and top it up with cash.",
    url: utm("/help/korea/pay"),
    linkLabel: "Read the Korea payment guide",
  },
  cityCards: {
    title: "Same method, three more cities",
    cards: [
      { city: "Tokyo", photo: "tokyo", title: "201 Hidden Gems", body: "The most of any city we rate.", url: utm("/spots?city=tokyo"), linkLabel: "Explore Tokyo" },
      { city: "Singapore", photo: "singapore", title: "175 Local Favorites", body: "Neighbourhood food and local spots.", url: utm("/spots?city=singapore"), linkLabel: "Explore Singapore" },
      { city: "Bangkok", photo: "bangkok", title: "169 Local Favorites", body: "Street food and markets first.", url: utm("/spots?city=bangkok"), linkLabel: "Explore Bangkok" },
    ],
  },
  cta: { label: "Plan a trip with Localley", url: utm("/itineraries/new") },
  sources: "Photos: Unsplash. Scores and counts: Localley data, 14 Nov 2026.",
};
