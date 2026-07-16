import "server-only";
import { randomUUID } from "node:crypto";
import { ENABLED_CITIES } from "@/lib/cities";
import { createSupabaseAdmin } from "@/lib/supabase";

export type ApifySpotCandidate = {
  runId: string;
  citySlug: string;
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  mapsUrl: string;
  categoryName: string | null;
  categories: string[];
  totalScore: number | null;
  reviewsCount: number | null;
  price: string | null;
  primaryImageUrl: string;
  discoveryQuery: string | null;
  recommendedLocalleyScore: 3 | 4 | 5;
};

type DiscoveryRun = {
  id: string;
  discovery_date: string;
  city_slug: string;
  actor_run_id: string;
  dataset_id: string | null;
  state: "starting" | "running" | "succeeded" | "failed";
  started_at: string;
};

export type ApifySpotDiscoverySummary = {
  date: string;
  citySlug: string | null;
  state: "started" | "pending" | "processed" | "failed" | "already_processed";
  candidates: number;
  skippedExisting: number;
};

const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_MAPS_ACTOR_ID = "compass~crawler-google-places";
const APIFY_REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOTAL_CHARGE_USD = "1";
const RESULTS_PER_QUERY = 12;
const MAX_PLACES_PER_RUN = 60;
const DATASET_LIMIT = 100;
const STALE_RUN_HOURS = 12;
const PENDING_CANDIDATE_RETENTION_DAYS = 90;
const IMPORTED_CANDIDATE_RETENTION_DAYS = 30;
const RUN_RETENTION_DAYS = 120;
const TRAVELER_CATEGORIES = new Set([
  "amusement park", "antique store", "aquarium", "art center", "art gallery", "bakery",
  "bazaar", "beach", "beer hall", "bistro", "book store", "bookshop", "botanical garden",
  "castle", "cathedral", "church", "cinema", "coffee shop", "cultural center", "day spa",
  "dessert shop", "farmers' market", "farmers market", "flea market", "food court", "food market",
  "gift shop", "hiking area", "hiking trail", "historic site", "historical landmark", "library",
  "market", "monument", "mosque", "mountain peak", "movie theater", "nature preserve",
  "night club", "nightclub", "observation deck", "park", "performing arts theater", "public garden",
  "record store", "sauna", "scenic spot", "shopping mall", "shrine", "spa", "stadium", "tea house",
  "temple", "thrift store", "tourist attraction", "viewpoint", "vintage clothing store", "zoo",
]);
const TRAVELER_CATEGORY_FAMILY_PATTERN = /^(?:.+ )?(?:bar|cafe|museum|pub|restaurant)$/;
const OPERATIONAL_CATEGORY_PATTERN = /(?:^medical spa$|\b(?:equipment supplier|manufacturer|repair shop|service center|supplier|supply store|warehouse|wholesaler)$)/;

export const APIFY_SPOT_DISCOVERY_QUERIES = [
  "hidden gem restaurant",
  "local cafe",
  "local market",
  "independent shop",
  "scenic viewpoint",
] as const;

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeHttpsUrl(value: unknown): string | null {
  const text = compactText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeGoogleMapsUrl(value: unknown): string | null {
  const normalized = safeHttpsUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();
  return (host === "google.com" || host.endsWith(".google.com")) && url.pathname.startsWith("/maps")
    ? url.toString()
    : null;
}

function safeGoogleImageUrl(value: unknown): string | null {
  const normalized = safeHttpsUrl(value);
  if (!normalized) return null;
  const host = new URL(normalized).hostname.toLowerCase();
  return host === "googleusercontent.com" || host.endsWith(".googleusercontent.com") ||
    host === "ggpht.com" || host.endsWith(".ggpht.com")
    ? normalized
    : null;
}

function normalizeCategories(item: Record<string, unknown>): string[] {
  const values = [
    compactText(item.categoryName),
    ...(Array.isArray(item.categories) ? item.categories.map(compactText) : []),
  ].filter(Boolean);
  return [...new Set(values)].slice(0, 12);
}

function isTravelerFacingCategory(categoryName: string | null, categories: string[]): boolean {
  return [categoryName || "", ...categories]
    .filter(Boolean)
    .map((category) => category.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim())
    .some((category) => !OPERATIONAL_CATEGORY_PATTERN.test(category) &&
      (TRAVELER_CATEGORIES.has(category) || TRAVELER_CATEGORY_FAMILY_PATTERN.test(category)));
}

function distanceKilometers(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number },
): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right.lat - left.lat);
  const longitudeDelta = radians(right.lng - left.lng);
  const startLatitude = radians(left.lat);
  const endLatitude = radians(right.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function mapApifyCategory(categoryName: string | null, categories: string[]): string {
  const value = [categoryName || "", ...categories].join(" ").toLowerCase();
  if (/cafe|coffee|tea house/.test(value)) return "Cafe";
  if (/bar|pub|night club|nightlife|cocktail/.test(value)) return "Nightlife";
  if (/market|bazaar|flea/.test(value)) return "Market";
  if (/shop|store|mall|vintage|thrift|boutique/.test(value)) return "Shopping";
  if (/park|garden|viewpoint|beach|trail|nature|mountain/.test(value)) return "Outdoor";
  if (/museum|gallery|temple|shrine|historic|culture|art center/.test(value)) return "Culture";
  if (/restaurant|food|bakery|dessert|noodle|ramen/.test(value)) return "Food";
  return "Entertainment";
}

export function recommendLocalleyScore(
  totalScore: number | null,
  reviewsCount: number | null,
): 3 | 4 | 5 {
  if (totalScore !== null && totalScore >= 4.6 && reviewsCount !== null && reviewsCount >= 10 && reviewsCount <= 600) {
    return 5;
  }
  if (totalScore !== null && totalScore >= 4.3 && (reviewsCount === null || reviewsCount <= 2_000)) {
    return 4;
  }
  return 3;
}

export function normalizeApifySpotCandidate(input: {
  item: Record<string, unknown>;
  citySlug: string;
  runId: string;
}): ApifySpotCandidate | null {
  if (input.item.permanentlyClosed === true || input.item.temporarilyClosed === true || input.item.isAdvertisement === true) {
    return null;
  }
  const location = input.item.location && typeof input.item.location === "object"
    ? input.item.location as Record<string, unknown>
    : {};
  const latitude = finiteNumber(location.lat ?? location.latitude ?? input.item.latitude);
  const longitude = finiteNumber(location.lng ?? location.longitude ?? input.item.longitude);
  const placeId = compactText(input.item.placeId ?? input.item.place_id);
  const name = compactText(input.item.title ?? input.item.name);
  const address = compactText(input.item.address ?? input.item.fullAddress ?? input.item.full_address);
  const mapsUrl = safeGoogleMapsUrl(input.item.url ?? input.item.mapsUrl ?? input.item.googleMapsUrl);
  const primaryImageUrl = safeGoogleImageUrl(input.item.imageUrl ?? input.item.image_url);
  if (!placeId || !name || !address || latitude === null || longitude === null || !mapsUrl || !primaryImageUrl) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const city = ENABLED_CITIES.find((candidate) => candidate.slug === input.citySlug);
  if (!city) return null;
  const countryCode = compactText(input.item.countryCode ?? input.item.country_code).toUpperCase();
  if (countryCode && countryCode !== city.countryCode) return null;
  if (distanceKilometers(city.center, { lat: latitude, lng: longitude }) > 120) return null;

  const totalScore = finiteNumber(input.item.totalScore ?? input.item.rating ?? input.item.avg_rating);
  const reviewsValue = finiteNumber(input.item.reviewsCount ?? input.item.reviewCount ?? input.item.total_reviews);
  const reviewsCount = reviewsValue === null ? null : Math.max(0, Math.floor(reviewsValue));
  if (totalScore !== null && totalScore < 4) return null;
  if (reviewsCount !== null && reviewsCount < 5) return null;
  const categories = normalizeCategories(input.item);
  const categoryName = compactText(input.item.categoryName) || categories[0] || null;
  if (!isTravelerFacingCategory(categoryName, categories)) return null;

  return {
    runId: input.runId,
    citySlug: input.citySlug,
    placeId,
    name,
    address,
    latitude,
    longitude,
    mapsUrl,
    categoryName,
    categories,
    totalScore,
    reviewsCount,
    price: compactText(input.item.price ?? input.item.priceLevel) || null,
    primaryImageUrl,
    discoveryQuery: compactText(input.item.searchString ?? input.item.searchQuery) || null,
    recommendedLocalleyScore: recommendLocalleyScore(totalScore, reviewsCount),
  };
}

async function apifyRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${APIFY_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(APIFY_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Apify request failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}

async function chooseNextCity(): Promise<(typeof ENABLED_CITIES)[number]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("apify_spot_discovery_runs")
    .select("city_slug,discovery_date")
    .order("discovery_date", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not load Apify discovery history: ${error.message}`);
  const latest = new Map<string, string>();
  for (const row of data || []) {
    if (!latest.has(row.city_slug)) latest.set(row.city_slug, row.discovery_date);
  }
  return [...ENABLED_CITIES].sort((left, right) => {
    const leftDate = latest.get(left.slug) || "";
    const rightDate = latest.get(right.slug) || "";
    return leftDate.localeCompare(rightDate) || left.ring - right.ring || left.slug.localeCompare(right.slug);
  })[0];
}

async function startDailyRun(token: string, date: string): Promise<ApifySpotDiscoverySummary> {
  const supabase = createSupabaseAdmin();
  const city = await chooseNextCity();
  const placeholder = `starting:${randomUUID()}`;
  const { data: claimed, error: claimError } = await supabase
    .from("apify_spot_discovery_runs")
    .insert({
      discovery_date: date,
      city_slug: city.slug,
      actor_id: APIFY_MAPS_ACTOR_ID,
      actor_run_id: placeholder,
      state: "starting",
      max_places: MAX_PLACES_PER_RUN,
    })
    .select("*")
    .maybeSingle();
  if (claimError?.code === "23505") {
    return { date, citySlug: null, state: "already_processed", candidates: 0, skippedExisting: 0 };
  }
  if (claimError || !claimed) throw new Error(`Could not claim Apify discovery run: ${claimError?.message || "missing row"}`);

  try {
    const response = await apifyRequest<{
      data: { id: string; defaultDatasetId?: string };
    }>(`/acts/${APIFY_MAPS_ACTOR_ID}/runs?waitForFinish=0&maxTotalChargeUsd=${MAX_TOTAL_CHARGE_USD}`, token, {
      method: "POST",
      body: JSON.stringify({
        searchStringsArray: APIFY_SPOT_DISCOVERY_QUERIES,
        locationQuery: `${city.name}, ${city.country}`,
        maxCrawledPlacesPerSearch: RESULTS_PER_QUERY,
        language: "en",
        skipClosedPlaces: true,
        scrapePlaceDetailPage: false,
        maxImages: 0,
        scrapeContacts: false,
        scrapeReviewsPersonalData: false,
      }),
    });
    const { error } = await supabase
      .from("apify_spot_discovery_runs")
      .update({
        actor_run_id: response.data.id,
        dataset_id: response.data.defaultDatasetId || null,
        state: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id);
    if (error) throw new Error(error.message);
    return { date, citySlug: city.slug, state: "started", candidates: 0, skippedExisting: 0 };
  } catch (error) {
    await supabase
      .from("apify_spot_discovery_runs")
      .update({
        state: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 500) : "Actor start failed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id);
    throw error;
  }
}

async function storeCandidates(run: DiscoveryRun, items: Record<string, unknown>[]): Promise<{
  candidates: number;
  skippedExisting: number;
}> {
  const supabase = createSupabaseAdmin();
  const normalized = [...new Map(items
    .map((item) => normalizeApifySpotCandidate({ item, citySlug: run.city_slug, runId: run.id }))
    .filter((item): item is ApifySpotCandidate => Boolean(item))
    .map((item) => [item.placeId, item] as const)).values()];
  const placeIds = [...new Set(normalized.map((item) => item.placeId))];
  if (placeIds.length === 0) return { candidates: 0, skippedExisting: 0 };
  const [{ data: spots, error: spotsError }, { data: candidates, error: candidatesError }] = await Promise.all([
    supabase.from("spots").select("google_place_id").in("google_place_id", placeIds),
    supabase.from("apify_spot_candidates").select("place_id").in("place_id", placeIds),
  ]);
  if (spotsError) throw new Error(`Could not dedupe discovered spots: ${spotsError.message}`);
  if (candidatesError) throw new Error(`Could not dedupe discovery candidates: ${candidatesError.message}`);
  const existing = new Set([
    ...(spots || []).map((spot) => spot.google_place_id).filter(Boolean),
    ...(candidates || []).map((candidate) => candidate.place_id),
  ]);
  const fresh = normalized.filter((candidate) => !existing.has(candidate.placeId));
  if (fresh.length > 0) {
    const { error } = await supabase.from("apify_spot_candidates").insert(fresh.map((candidate) => ({
      run_id: candidate.runId,
      city_slug: candidate.citySlug,
      place_id: candidate.placeId,
      name: candidate.name,
      address: candidate.address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      maps_url: candidate.mapsUrl,
      category_name: candidate.categoryName,
      categories: candidate.categories,
      total_score: candidate.totalScore,
      reviews_count: candidate.reviewsCount,
      price: candidate.price,
      primary_image_url: candidate.primaryImageUrl,
      discovery_query: candidate.discoveryQuery,
      recommended_localley_score: candidate.recommendedLocalleyScore,
    })));
    if (error) throw new Error(`Could not store Apify spot candidates: ${error.message}`);
  }
  return { candidates: fresh.length, skippedExisting: normalized.length - fresh.length };
}

async function processDailyRun(token: string, run: DiscoveryRun): Promise<ApifySpotDiscoverySummary> {
  const supabase = createSupabaseAdmin();
  if (run.state === "succeeded") {
    return { date: run.discovery_date, citySlug: run.city_slug, state: "already_processed", candidates: 0, skippedExisting: 0 };
  }
  if (run.state === "failed") {
    return { date: run.discovery_date, citySlug: run.city_slug, state: "failed", candidates: 0, skippedExisting: 0 };
  }
  if (run.actor_run_id.startsWith("starting:")) {
    return { date: run.discovery_date, citySlug: run.city_slug, state: "pending", candidates: 0, skippedExisting: 0 };
  }
  const response = await apifyRequest<{
    data: { status: string; defaultDatasetId?: string };
  }>(`/actor-runs/${run.actor_run_id}`, token);
  const status = response.data.status;
  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
    await supabase
      .from("apify_spot_discovery_runs")
      .update({
        state: "failed",
        error_message: `Actor ended with ${status}.`,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { date: run.discovery_date, citySlug: run.city_slug, state: "failed", candidates: 0, skippedExisting: 0 };
  }
  if (status !== "SUCCEEDED") {
    return { date: run.discovery_date, citySlug: run.city_slug, state: "pending", candidates: 0, skippedExisting: 0 };
  }
  const datasetId = response.data.defaultDatasetId || run.dataset_id;
  if (!datasetId) throw new Error("Completed Apify discovery run has no dataset.");
  const items = await apifyRequest<Record<string, unknown>[]>(
    `/datasets/${datasetId}/items?clean=true&limit=${DATASET_LIMIT}`,
    token,
  );
  const stored = await storeCandidates(run, items);
  const { error } = await supabase
    .from("apify_spot_discovery_runs")
    .update({
      dataset_id: datasetId,
      state: "succeeded",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  if (error) throw new Error(`Could not complete Apify discovery run: ${error.message}`);
  return { date: run.discovery_date, citySlug: run.city_slug, state: "processed", ...stored };
}

export async function refreshApifySpotDiscovery(now: Date = new Date()): Promise<ApifySpotDiscoverySummary> {
  if (process.env.APIFY_SPOT_DISCOVERY_ENABLED !== "true") {
    throw new Error("Apify spot discovery is disabled.");
  }
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new Error("APIFY_API_TOKEN is not configured.");
  const date = now.toISOString().slice(0, 10);
  const supabase = createSupabaseAdmin();
  const staleBefore = new Date(now.getTime() - STALE_RUN_HOURS * 60 * 60 * 1_000).toISOString();
  const pendingBefore = new Date(now.getTime() - PENDING_CANDIDATE_RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString();
  const importedBefore = new Date(now.getTime() - IMPORTED_CANDIDATE_RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString();
  const runBefore = new Date(now.getTime() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  const { error: pendingRetentionError } = await supabase
    .from("apify_spot_candidates")
    .delete()
    .in("status", ["pending", "rejected"])
    .lt("created_at", pendingBefore);
  if (pendingRetentionError) throw new Error(`Could not enforce pending Apify candidate retention: ${pendingRetentionError.message}`);
  const { error: importedRetentionError } = await supabase
    .from("apify_spot_candidates")
    .delete()
    .eq("status", "imported")
    .lt("reviewed_at", importedBefore);
  if (importedRetentionError) throw new Error(`Could not enforce imported Apify candidate retention: ${importedRetentionError.message}`);
  const { error: runRetentionError } = await supabase
    .from("apify_spot_discovery_runs")
    .delete()
    .in("state", ["succeeded", "failed"])
    .lt("discovery_date", runBefore);
  if (runRetentionError) throw new Error(`Could not enforce Apify run retention: ${runRetentionError.message}`);

  const { data: activeRun, error: activeRunError } = await supabase
    .from("apify_spot_discovery_runs")
    .select("*")
    .in("state", ["starting", "running"])
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (activeRunError) throw new Error(`Could not load active Apify discovery run: ${activeRunError.message}`);
  if (activeRun) {
    const run = activeRun as DiscoveryRun;
    if (run.started_at < staleBefore) {
      if (!run.actor_run_id.startsWith("starting:")) {
        await apifyRequest(`/actor-runs/${run.actor_run_id}/abort`, token, { method: "POST" });
      }
      const { error: staleError } = await supabase
        .from("apify_spot_discovery_runs")
        .update({
          state: "failed",
          error_message: "Discovery run exceeded the twelve-hour safety window and was aborted.",
          completed_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", run.id)
        .in("state", ["starting", "running"]);
      if (staleError) throw new Error(`Could not recover stale Apify discovery run: ${staleError.message}`);
      if (run.discovery_date === date) {
        return { date: run.discovery_date, citySlug: run.city_slug, state: "failed", candidates: 0, skippedExisting: 0 };
      }
    } else {
      const rollover = await processDailyRun(token, run);
      if (run.discovery_date === date || rollover.state === "pending") return rollover;
    }
  }

  const { data, error } = await supabase
    .from("apify_spot_discovery_runs")
    .select("*")
    .eq("discovery_date", date)
    .maybeSingle();
  if (error) throw new Error(`Could not load today's Apify discovery run: ${error.message}`);
  return data ? processDailyRun(token, data as DiscoveryRun) : startDailyRun(token, date);
}
