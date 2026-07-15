import { ENABLED_CITIES, type CityConfig } from "../cities";
import {
  GeographyManifestSchema,
  VIBE_SLUGS,
  type GeographyLocalArea,
} from "./manifest-schema";

const REVIEWED_AT = "2026-07-14T00:00:00.000Z";
const destinationAliases: Record<string, string[]> = {
  bangkok: ["Bangkok", "Krung Thep Maha Nakhon"],
  seoul: ["Seoul", "서울"],
  tokyo: ["Tokyo", "Tōkyō", "東京"],
  osaka: ["Osaka", "Ōsaka", "大阪"],
  kyoto: ["Kyoto", "Kyōto", "京都"],
  busan: ["Busan", "Pusan", "부산"],
  jeju: ["Jeju", "Jeju-do", "제주"],
  nara: ["Nara", "奈良"],
  kanazawa: ["Kanazawa", "金沢"],
  gyeongju: ["Gyeongju", "Kyongju", "경주"],
  sapporo: ["Sapporo", "札幌"],
  okinawa: ["Okinawa", "沖縄"],
};

const nightlifeAreas = new Set([
  "hongdae", "itaewon", "gangnam", "shibuya", "shinjuku", "roppongi",
  "dontonbori", "dotonbori", "namba", "shinsaibashi", "amemura", "susukino",
]);
const historicAreas = new Set([
  "insadong", "bukchon", "ikseon dong", "jongno", "samcheong dong", "asakusa",
  "yanaka", "gion", "higashiyama", "arashiyama", "fushimi", "naramachi",
  "todai ji area", "kasuga area", "higashi chaya", "kazuemachi", "nagamachi",
  "gamcheon", "yangdong village", "bulguksa area", "shuri",
]);
const foodieAreas = new Set([
  "mangwon", "euljiro", "myeongdong", "tsukiji", "kichijoji", "ebisu", "dotonbori",
  "nishiki", "pontocho", "nampo dong", "jagalchi", "seomyeon", "tanukikoji",
  "kokusai street",
]);
const trendyAreas = new Set([
  "seongsu dong", "yeonnam dong", "hongdae", "shimokitazawa", "nakameguro",
  "daikanyama", "harajuku", "koenji", "nakazakicho", "amemura", "aewol",
]);
const quietAreas = new Set([
  "bukchon", "samcheong dong", "yanaka", "arashiyama", "fushimi", "maruyama",
  "hallim", "udo island", "yangdong village", "ban xang khong",
]);

const surroundingAreas: Record<string, Array<{
  name: string;
  slug: string;
  kind: GeographyLocalArea["kind"];
  aliases: string[];
  characterization: string;
}>> = {
  seoul: [{
    name: "Incheon Airport Area",
    slug: "incheon-airport-area",
    kind: "day_trip_area",
    aliases: ["Incheon", "Yeongjongdo"],
    characterization: "A western gateway area for airport arrivals, resort stays, and transfer-day activities; it should not be scheduled as central Seoul.",
  }],
  hanoi: [
    {
      name: "Sa Pa",
      slug: "sa-pa",
      kind: "town",
      aliases: ["Sapa", "Lao Cai", "Lào Cai"],
      characterization: "A mountain destination reached from Hanoi that needs its own overnight pacing and long transfer buffer.",
    },
    {
      name: "Ninh Binh",
      slug: "ninh-binh",
      kind: "town",
      aliases: ["Ninh Bình", "Hoa Lu", "Hoa Lư", "Tam Coc", "Trang An", "Tràng An"],
      characterization: "A landscape and heritage extension south of Hanoi, suited to a long day trip or overnight stop with transfer time protected.",
    },
    {
      name: "Ha Long",
      slug: "ha-long",
      kind: "town",
      aliases: ["Hạ Long", "Ha Long Bay", "Quang Ninh", "Quảng Ninh"],
      characterization: "A coastal and bay extension east of Hanoi that requires a dedicated transfer and weather-aware cruise planning.",
    },
  ],
  "kuala-lumpur": [{
    name: "Melaka",
    slug: "melaka",
    kind: "town",
    aliases: ["Malacca"],
    characterization: "A historic city extension south of Kuala Lumpur, feasible as a long day trip but better paced as an overnight for deeper exploration.",
  }],
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[’'()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function areaKind(name: string): GeographyLocalArea["kind"] {
  const normalized = normalizedName(name);
  if (/island/.test(normalized)) return "island";
  if (/nearby/.test(normalized)) return "day_trip_area";
  if (/village|city$/.test(normalized)) return "town";
  if (/area$|street$|park$|lake$/.test(normalized)) return "district";
  return "neighborhood";
}

function localAreaVibes(name: string): GeographyLocalArea["vibes"] {
  const normalized = normalizedName(name);
  const scores = new Map<(typeof VIBE_SLUGS)[number], number>([
    ["walkable", 72],
    ["local-authenticity", 68],
    ["cultural", 58],
  ]);
  if (nightlifeAreas.has(normalized)) scores.set("nightlife", 86);
  if (historicAreas.has(normalized)) {
    scores.set("historic", 88);
    scores.set("cultural", 84);
  }
  if (foodieAreas.has(normalized)) scores.set("foodie", 86);
  if (trendyAreas.has(normalized)) scores.set("trendy", 84);
  if (quietAreas.has(normalized)) scores.set("quiet", 78);
  if (scores.size === 3) scores.set("foodie", 62);
  return [...scores].map(([slug, score]) => ({
    slug,
    score,
    confidence: 0.72,
    evidence: `Machine-checked editorial classification for ${name}; requires corridor QA before public claims.`,
  }));
}

function characterization(name: string, city: CityConfig): string {
  const normalized = normalizedName(name);
  const traits = [
    nightlifeAreas.has(normalized) ? "late-night energy" : null,
    historicAreas.has(normalized) ? "historic streets and cultural landmarks" : null,
    foodieAreas.has(normalized) ? "strong food-market and dining appeal" : null,
    trendyAreas.has(normalized) ? "independent shops and trend-led creative culture" : null,
    quietAreas.has(normalized) ? "a slower, quieter rhythm" : null,
  ].filter(Boolean);
  const focus = traits.length > 0
    ? traits.join(", ")
    : "everyday local streets, neighborhood businesses, and a distinct base for nearby exploration";
  return `${name} is a ${city.name} area characterized by ${focus}. Treat this as editorial orientation, not a safety claim.`;
}

function travelerTypes(name: string): string[] {
  const normalized = normalizedName(name);
  const types = new Set<string>(["independent travelers", "local-culture seekers"]);
  if (nightlifeAreas.has(normalized)) types.add("nightlife travelers");
  if (historicAreas.has(normalized)) types.add("history and culture travelers");
  if (foodieAreas.has(normalized)) types.add("food-focused travelers");
  if (quietAreas.has(normalized)) types.add("slow-travel visitors");
  return [...types];
}

function localAreasFor(city: CityConfig): GeographyLocalArea[] {
  const registryAreas = city.neighborhoods.map((name) => ({
    slug: slugify(name),
    kind: areaKind(name),
    name: { en: name },
    aliases: [],
    characterization: { en: characterization(name, city) },
    travelerTypes: travelerTypes(name),
    practicalNotes: {
      walkability: "Plan activities in compact clusters; verify step-free access and steep grades per venue before booking.",
      bestTime: "Match visit time to venue hours, commuter peaks, weather, and the traveler’s preferred daily rhythm.",
      transit: `Use current official ${city.name} transit information for routing; this seed does not store live schedules.`,
    },
    confidence: 0.72,
    reviewStatus: "machine_checked" as const,
    reviewedAt: REVIEWED_AT,
    sourceMeta: {
      source: "Localley city registry",
      sourceId: `${city.slug}:neighborhoods`,
      license: "Internal curated data",
      retrievedAt: REVIEWED_AT,
    },
    vibes: localAreaVibes(name),
    }));
  const extensions = (surroundingAreas[city.slug] || []).map((area) => ({
    slug: area.slug,
    kind: area.kind,
    name: { en: area.name },
    aliases: area.aliases,
    characterization: { en: area.characterization },
    travelerTypes: travelerTypes(area.name),
    practicalNotes: {
      walkability: "Cluster activity after arrival; local terrain and step-free access must be checked per venue.",
      bestTime: "Protect the transfer window and verify weather, operating hours, and seasonal disruption before confirming.",
      transit: `Treat travel from ${city.name} as an explicit intercity or regional transfer, not local transit time.`,
    },
    confidence: 0.8,
    reviewStatus: "machine_checked" as const,
    reviewedAt: REVIEWED_AT,
    sourceMeta: {
      source: "Localley geography corridor review",
      sourceId: `${city.slug}:extension:${area.slug}`,
      license: "Internal curated data",
      retrievedAt: REVIEWED_AT,
    },
    vibes: localAreaVibes(area.name),
  }));
  return [...registryAreas, ...extensions];
}

const countries = [...new Map(ENABLED_CITIES.map((city) => [city.countryCode, city])).values()]
  .map((city) => ({
    code: city.countryCode,
    name: { en: city.country },
    defaultCurrency: city.currency,
    defaultLanguages: city.languages,
    sourceMeta: {
      source: "Localley city registry",
      sourceId: `country:${city.countryCode}`,
      license: "Internal curated data",
      retrievedAt: REVIEWED_AT,
    },
  }))
  .sort((left, right) => left.code.localeCompare(right.code));

const vibeTaxonomy = VIBE_SLUGS.map((slug) => ({
  slug,
  label: slug.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
  version: 1,
  rubric: {
    veryLow: "0–19: little reliable evidence for this characteristic",
    low: "20–39: present only in limited pockets or situations",
    mixed: "40–59: meaningful but not dominant",
    high: "60–79: consistently useful for matching traveler preferences",
    defining: "80–100: a defining reason travelers choose this area",
  },
}));

export const geographySeedManifest = GeographyManifestSchema.parse({
  version: 1,
  generatedFrom: "lib/cities.ts",
  reviewedAt: REVIEWED_AT,
  countries,
  vibeTaxonomy,
  destinations: ENABLED_CITIES.map((city) => ({
    slug: city.slug,
    name: { en: city.name },
    aliases: destinationAliases[city.slug] || [city.name],
    countryCode: city.countryCode,
    center: city.center,
    timezone: city.timezone,
    currency: city.currency,
    languages: city.languages,
    ring: city.ring,
    isEnabled: city.isEnabled,
    targets: city.targets,
    characterization: {
      en: city.vibe || `${city.name} is a Localley-supported destination with curated local-first coverage.`,
    },
    sourceMeta: {
      source: "Localley city registry",
      sourceId: `destination:${city.slug}`,
      license: "Internal curated data",
      retrievedAt: REVIEWED_AT,
    },
    reviewedAt: REVIEWED_AT,
    localAreas: localAreasFor(city),
  })),
});
