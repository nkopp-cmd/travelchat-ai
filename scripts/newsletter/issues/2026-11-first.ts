import type { NewsletterIssue } from "../../../emails/newsletter-issue-email";

// Issue 1, refreshed 2026-11-26: every number is from production D1 (visible spots, weekly_city_spot_rankings) on
// 2026-11-26; ranked spots are indexable guide pages (spots-1.xml); payment guidance from lib/help/pay.json.
const SITE = "https://www.localley.io";
const utm = (path: string) => `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=newsletter&utm_medium=email&utm_campaign=2026-11-first`;
const spot = (id: string) => utm(`/spots/${id}`);

// Approval tag for the list send (PRIME RULE 4, 2026-11-25: publish + Telegram preview; Nils' "no" blocks).
export const approval = "NL-20261126";

export const issue: NewsletterIssue = {
  subject: "41 Seoul places locals rate at the top, and how to pay in Korea",
  preview: "Our Seoul scores in one chart, five Hidden Gems where locals outnumber tourists, and a payment tip for Korea.",
  title: "Find the places locals actually rate",
  intro:
    "Welcome to the first Localley newsletter. We score every place from 1 to 6 by rating per review and by how often locals post about it. This issue: the Seoul scores, five places locals outnumber tourists, and how to pay in Korea.",
  hero: { photo: "seoul", alt: "Neon signs in a Seoul side street at night", credit: "Photo: Unsplash" },
  stats: [
    { value: "496", label: "Seoul places rated" },
    { value: "41", label: "Legendary Alley" },
    { value: "30", label: "Asian cities" },
  ],
  scores: {
    title: "How Seoul scores",
    caption: "Most places we keep are Local Favorite or better. Tourist traps do not make the list.",
    rows: [
      { level: 6, count: 41 },
      { level: 5, count: 170 },
      { level: 4, count: 159 },
      { level: 3, count: 84 },
      { level: 2, count: 42 },
    ],
    url: utm("/spots?city=seoul"),
    linkLabel: "See all Seoul places",
  },
  ranked: {
    title: "Five Hidden Gems where locals outnumber tourists",
    caption: "Hidden Gem score and a full local guide, sorted by the share of locals among visitors.",
    spots: [
      { name: "Sillim-dong Sundae Town", area: "Gwanak-gu", level: 5, localShare: 90,
        note: "Vendors have served sundae (blood sausage) here for decades. Order it with gopchang.", url: spot("26f8640c-0942-4001-b0ac-b20d3cf5b197") },
      { name: "Nakseongdae Park", area: "Gwanak-gu", level: 5, localShare: 90,
        note: "A quiet memorial park for General Kang Gam-chan, with traditional buildings and gardens.", url: spot("32be2449-a190-4afb-a3d2-75bbf4b6e241") },
      { name: "Naksan Park", area: "Jongno-gu", level: 5, localShare: 85,
        note: "Walk the old fortress wall at sunset for views of old and new Seoul. Free.", url: spot("b50160e9-3c20-49c6-8d8f-7700b0b8ccc3") },
      { name: "Yeouido Saetgang Ecological Park", area: "Yeongdeungpo-gu", level: 5, localShare: 85,
        note: "A green river path behind the office towers, popular with local cyclists.", url: spot("37e27665-0b02-4522-944c-cc5652af8592") },
      { name: "Mangwon Market", area: "Mapo-gu", level: 5, localShare: 80,
        note: "A neighbourhood market where grandmas sell homemade banchan. Less crowded than Gwangjang.", url: spot("aee0ec5d-577b-4e3a-ab5e-d92c4b743202") },
    ],
  },
  cityShares: {
    title: "Where hidden gems are easiest to find",
    caption: "Share of rated places at Hidden Gem or Legendary Alley.",
    rows: [
      { city: "Seoul", share: 43, url: utm("/spots?city=seoul") },
      { city: "Tokyo", share: 41, url: utm("/spots?city=tokyo") },
      { city: "Singapore", share: 36, url: utm("/spots?city=singapore") },
      { city: "Bangkok", share: 31, url: utm("/spots?city=bangkok") },
    ],
    source: "Seoul 496, Tokyo 537, Singapore 513, Bangkok 398 rated places. Localley data, 26 Nov 2026.",
  },
  trend: {
    icon: "trend",
    eyebrow: "Our weekly social scan",
    title: "Zhinan Temple led Taipei two weeks in a row",
    body: "It was the top Taipei spot in our scan of local posts in the weeks of 16 and 23 November. Take the Maokong Gondola to the Zhinan Temple stop. In Bangkok, Nang Loeng Market led both weeks.",
    url: spot("1537affa-dcdb-4ba6-a51f-e19fb1461fdd"),
    linkLabel: "Open Zhinan Temple",
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
      { city: "Singapore", photo: "singapore", title: "184 Hidden Gems", body: "Neighbourhood food and local spots.", url: utm("/spots?city=singapore"), linkLabel: "Explore Singapore" },
      { city: "Bangkok", photo: "bangkok", title: "169 Local Favorites", body: "Street food and markets first.", url: utm("/spots?city=bangkok"), linkLabel: "Explore Bangkok" },
    ],
  },
  cta: { label: "Plan a trip with Localley", url: utm("/itineraries/new") },
  sources: "Photos: Unsplash. Scores and counts: Localley data, 26 Nov 2026.",
};
