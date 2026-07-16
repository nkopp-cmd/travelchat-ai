import { z } from "zod";
import { geographySeedManifest } from "../geography/seed-manifest";

const destinationSlugs = new Set(
  geographySeedManifest.destinations.map((destination) => destination.slug),
);

const sourceSchema = z.object({
  publisher: z.string().min(2),
  url: z.url(),
  retrievedAt: z.iso.datetime(),
  note: z.string().min(12),
});

const routeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  from: z.string(),
  to: z.string(),
  bidirectional: z.boolean(),
  mode: z.enum(["flight", "train", "bus", "ferry"]),
  durationMinutes: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
  departureBufferMinutes: z.number().int().nonnegative(),
  arrivalBufferMinutes: z.number().int().nonnegative(),
  hotelChangeMinutes: z.number().int().nonnegative(),
  costBand: z.enum(["budget", "moderate", "premium"]),
  confidence: z.number().min(0).max(1),
  bookingHint: z.string().min(10),
  reviewStatus: z.enum(["machine_checked", "human_verified"]),
  reviewedAt: z.iso.datetime(),
  recheckAfter: z.iso.date(),
  sources: z.array(sourceSchema).min(1),
}).superRefine((route, ctx) => {
  if (!destinationSlugs.has(route.from) || !destinationSlugs.has(route.to)) {
    ctx.addIssue({ code: "custom", message: "Transfer route uses an unknown destination slug." });
  }
  if (route.from === route.to) {
    ctx.addIssue({ code: "custom", message: "Transfer route endpoints must differ." });
  }
  if (route.durationMinutes.max < route.durationMinutes.min) {
    ctx.addIssue({ code: "custom", message: "Maximum duration must be at least the minimum." });
  }
});

export const TransportManifestSchema = z.object({
  version: z.literal(1),
  corridor: z.literal("kr-jp"),
  routes: z.array(routeSchema).min(10),
}).superRefine((manifest, ctx) => {
  const slugs = new Set<string>();
  const directedKeys = new Set<string>();
  for (const [index, route] of manifest.routes.entries()) {
    if (slugs.has(route.slug)) {
      ctx.addIssue({ code: "custom", message: `Duplicate route slug: ${route.slug}`, path: ["routes", index] });
    }
    slugs.add(route.slug);
    const keys = [`${route.from}:${route.to}:${route.mode}`];
    if (route.bidirectional) keys.push(`${route.to}:${route.from}:${route.mode}`);
    for (const key of keys) {
      if (directedKeys.has(key)) {
        ctx.addIssue({ code: "custom", message: `Duplicate directed route: ${key}`, path: ["routes", index] });
      }
      directedKeys.add(key);
    }
  }
});

export type TransportRoute = z.infer<typeof routeSchema>;

const RETRIEVED_AT = "2026-07-15T00:00:00.000Z";
const REVIEWED_AT = "2026-07-15T00:00:00.000Z";
const RECHECK_AFTER = "2027-01-15";

const source = (publisher: string, url: string, note: string) => ({
  publisher,
  url,
  retrievedAt: RETRIEVED_AT,
  note,
});

const route = (
  value: Omit<TransportRoute, "bidirectional" | "hotelChangeMinutes" | "reviewStatus" | "reviewedAt" | "recheckAfter">,
): TransportRoute => ({
  ...value,
  bidirectional: true,
  hotelChangeMinutes: 45,
  reviewStatus: "machine_checked",
  reviewedAt: REVIEWED_AT,
  recheckAfter: RECHECK_AFTER,
});

export const transportManifest = TransportManifestSchema.parse({
  version: 1,
  corridor: "kr-jp",
  routes: [
    route({
      slug: "seoul-busan-ktx", from: "seoul", to: "busan", mode: "train",
      durationMinutes: { min: 150, max: 200 }, departureBufferMinutes: 35, arrivalBufferMinutes: 20,
      costBand: "moderate", confidence: 0.9,
      bookingHint: "Check the current KORAIL timetable and reserve busy departures in advance.",
      sources: [source("Korea Tourism Organization", "https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=1589997", "Official visitor guidance confirms direct Seoul–Busan rail services and conservative journey ranges.")],
    }),
    route({
      slug: "seoul-gyeongju-ktx", from: "seoul", to: "gyeongju", mode: "train",
      durationMinutes: { min: 120, max: 155 }, departureBufferMinutes: 35, arrivalBufferMinutes: 25,
      costBand: "moderate", confidence: 0.9,
      bookingHint: "Use the current KORAIL timetable; Gyeongju station requires an onward local transfer.",
      sources: [source("Korea Tourism Organization", "https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=221840", "Official destination guidance states about two hours by KTX from Seoul to Gyeongju.")],
    }),
    route({
      slug: "busan-gyeongju-train", from: "busan", to: "gyeongju", mode: "train",
      durationMinutes: { min: 55, max: 85 }, departureBufferMinutes: 35, arrivalBufferMinutes: 25,
      costBand: "budget", confidence: 0.82,
      bookingHint: "Confirm the current Donghae Line departure and the station used in Busan.",
      sources: [source("Korea Tourism Organization", "https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=219&vcontsId=1591437", "Official 2026 Donghae Line guidance lists Bujeon, Taehwagang, and Gyeongju segment times.")],
    }),
    route({
      slug: "seoul-jeju-flight", from: "seoul", to: "jeju", mode: "flight",
      durationMinutes: { min: 70, max: 95 }, departureBufferMinutes: 120, arrivalBufferMinutes: 45,
      costBand: "moderate", confidence: 0.84,
      bookingHint: "Search both Gimpo and limited Incheon departures; never assume a specific schedule.",
      sources: [source("Korea Tourism Organization", "https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=177&vcontsId=1589896", "Official guidance confirms the Seoul-area to Jeju air link and an approximately 75-minute flight.")],
    }),
    route({
      slug: "busan-jeju-flight", from: "busan", to: "jeju", mode: "flight",
      durationMinutes: { min: 55, max: 80 }, departureBufferMinutes: 120, arrivalBufferMinutes: 45,
      costBand: "moderate", confidence: 0.82,
      bookingHint: "Check live airline schedules for Gimhae–Jeju before presenting a departure.",
      sources: [source("Air Busan", "https://en.airbusan.com/content/individual/booking/route", "The operator's current route page lists Busan–Jeju as a domestic route.")],
    }),
    route({
      slug: "tokyo-kyoto-shinkansen", from: "tokyo", to: "kyoto", mode: "train",
      durationMinutes: { min: 130, max: 170 }, departureBufferMinutes: 35, arrivalBufferMinutes: 20,
      costBand: "moderate", confidence: 0.94,
      bookingHint: "Check the current JR Central timetable and train-specific Japan Rail Pass conditions.",
      sources: [source("JR Central", "https://global.jr-central.co.jp/en/onlinebooking/contents/shinkansen/", "The official operator guide states about 130 minutes between Tokyo and Kyoto.")],
    }),
    route({
      slug: "tokyo-osaka-shinkansen", from: "tokyo", to: "osaka", mode: "train",
      durationMinutes: { min: 141, max: 185 }, departureBufferMinutes: 35, arrivalBufferMinutes: 25,
      costBand: "moderate", confidence: 0.94,
      bookingHint: "Plan for arrival at Shin-Osaka and a separate local transfer to the accommodation area.",
      sources: [source("JR Central", "https://global.jr-central.co.jp/en/company/about_shinkansen/", "The official operator reports a fastest Tokyo–Shin-Osaka time of 2 hours 21 minutes.")],
    }),
    route({
      slug: "kyoto-osaka-jr", from: "kyoto", to: "osaka", mode: "train",
      durationMinutes: { min: 28, max: 55 }, departureBufferMinutes: 25, arrivalBufferMinutes: 20,
      costBand: "budget", confidence: 0.9,
      bookingHint: "Select the station pair that matches the accommodation; this edge is city-center to city-center guidance.",
      sources: [source("JR West", "https://www.westjr.co.jp/global/en/ir/library/fact-sheets/2024/pdf/fact09.pdf", "The official fact sheet lists Osaka–Kyoto rail travel from 28 minutes.")],
    }),
    route({
      slug: "osaka-nara-train", from: "osaka", to: "nara", mode: "train",
      durationMinutes: { min: 33, max: 60 }, departureBufferMinutes: 25, arrivalBufferMinutes: 20,
      costBand: "budget", confidence: 0.9,
      bookingHint: "Choose JR or Kintetsu according to the exact Osaka and Nara neighborhoods.",
      sources: [source("JR West", "https://www.westjr.co.jp/global/en/ir/library/fact-sheets/2024/pdf/fact09.pdf", "The official fact sheet lists representative Osaka-area to Nara rail times of 33–36 minutes.")],
    }),
    route({
      slug: "kyoto-nara-kintetsu", from: "kyoto", to: "nara", mode: "train",
      durationMinutes: { min: 33, max: 55 }, departureBufferMinutes: 25, arrivalBufferMinutes: 20,
      costBand: "budget", confidence: 0.9,
      bookingHint: "Check current Kintetsu service dates and use regular trains when the sightseeing express is unavailable.",
      sources: [source("Kintetsu Railway", "https://www.kintetsu.co.jp/foreign/english/aoniyoshi/", "The official 2026 timetable shows Kyoto–Kintetsu-Nara journeys of roughly 33–36 minutes.")],
    }),
    route({
      slug: "seoul-tokyo-flight", from: "seoul", to: "tokyo", mode: "flight",
      durationMinutes: { min: 130, max: 180 }, departureBufferMinutes: 180, arrivalBufferMinutes: 75,
      costBand: "premium", confidence: 0.8,
      bookingHint: "Search all Seoul/Tokyo airport pairs and verify the actual operating day before proposing a flight.",
      sources: [source("Air Busan", "https://en.airbusan.com/content/individual/booking/route", "The current operator route map confirms Incheon–Tokyo service; exact schedules remain provider data.")],
    }),
    route({
      slug: "busan-osaka-flight", from: "busan", to: "osaka", mode: "flight",
      durationMinutes: { min: 80, max: 120 }, departureBufferMinutes: 180, arrivalBufferMinutes: 75,
      costBand: "premium", confidence: 0.82,
      bookingHint: "Verify the live Gimhae–Kansai schedule and include airport-to-city transfers separately.",
      sources: [source("Air Busan", "https://en.airbusan.com/content/individual/booking/route", "The current operator route map explicitly lists Busan–Osaka (Kansai).")],
    }),
  ],
});

export type DirectedTransportEdge = TransportRoute & {
  id: string;
  reverseOf?: string;
};

export const directedTransportEdges: readonly DirectedTransportEdge[] = transportManifest.routes.flatMap((item) => {
  const forward: DirectedTransportEdge = { ...item, id: item.slug };
  if (!item.bidirectional) return [forward];
  return [
    forward,
    {
      ...item,
      id: `${item.slug}-reverse`,
      from: item.to,
      to: item.from,
      reverseOf: item.slug,
    },
  ];
});
