import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase";
import { ENABLED_CITIES, inferCityFromAddress } from "@/lib/cities";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import { getLocalizedText, normalizeSpotPhotos, type RawSpot } from "@/lib/spots/transform";

export type SocialTrendPlatform = "instagram" | "tiktok" | "youtube";

type ActorConfig = {
  actorId: string;
  input: Record<string, unknown>;
};

type TrendRunRow = {
  id: string;
  week_start: string;
  platform: SocialTrendPlatform;
  actor_id: string;
  actor_run_id: string;
  dataset_id: string | null;
  state: "starting" | "running" | "succeeded" | "failed";
  attempt_count: number;
  processed_at: string | null;
};

export type NormalizedSocialTrendItem = {
  weekStart: string;
  citySlug: string;
  platform: SocialTrendPlatform;
  externalId: string;
  canonicalUrl: string;
  contentText: string;
  placeHint: string | null;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
};

export type WeeklyTrendRefreshSummary = {
  weekStart: string;
  started: SocialTrendPlatform[];
  pending: SocialTrendPlatform[];
  processed: SocialTrendPlatform[];
  failed: SocialTrendPlatform[];
  contentItems: number;
  rankings: number;
  builtCities: string[];
};

const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_REQUEST_TIMEOUT_MS = 20_000;
const APIFY_DATASET_LIMIT = 1_000;
const SOCIAL_RESULT_LIMIT_PER_CITY = 12;
const MAX_ACTOR_CHARGE_USD = "2";
const MAX_CONTENT_TEXT_LENGTH = 4_000;
const MAX_LINKER_SIGNALS_PER_CITY = 16;
const MAX_LINKER_SPOTS_PER_CITY = 160;
const MAX_NEW_RUNS_PER_INVOCATION = 3;
const MAX_RUN_ATTEMPTS = 3;
const MAX_CITY_BUILD_ATTEMPTS = 3;
const DERIVED_DATA_RETENTION_DAYS = 16 * 7;
const STALE_STARTING_MINUTES = 30;
const STALE_RUNNING_HOURS = 6;
const MAX_PENDING_SOCIAL_LEADS_PER_CITY = 3;

export const SOCIAL_SCOUT_CITIES = ENABLED_CITIES;

const PLATFORM_HOSTS: Record<SocialTrendPlatform, string[]> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
};

type TrendRunReadiness = Pick<TrendRunRow, "state" | "attempt_count" | "processed_at">;

export function canRetryTrendRun(run: TrendRunReadiness): boolean {
  return run.state === "failed" && run.attempt_count < MAX_RUN_ATTEMPTS;
}

export function areTrendRunsReadyForBuild(runs: TrendRunReadiness[]): boolean {
  if (runs.length !== Object.keys(actorConfigs()).length) return false;
  return runs.some((run) => Boolean(run.processed_at)) && runs.every((run) =>
    Boolean(run.processed_at) || (run.state === "failed" && run.attempt_count >= MAX_RUN_ATTEMPTS),
  );
}

function cityQueries(): string[] {
  return SOCIAL_SCOUT_CITIES.map((city) => `${city.name} hidden gems travel`);
}

function actorConfigs(): Record<SocialTrendPlatform, ActorConfig> {
  const queries = cityQueries();
  const instagramHashtags = SOCIAL_SCOUT_CITIES.flatMap((city) => {
    const base = city.slug.replace(/-/g, "");
    return [`${base}travel`, `${base}hiddengems`];
  });
  return {
    instagram: {
      actorId: "apify~instagram-hashtag-scraper",
      input: {
        hashtags: instagramHashtags,
        resultsType: "posts",
        resultsLimit: 8,
        keywordSearch: false,
      },
    },
    tiktok: {
      actorId: "clockworks~tiktok-scraper",
      input: {
        searchQueries: queries,
        resultsPerPage: SOCIAL_RESULT_LIMIT_PER_CITY,
        searchSection: "/video",
        videoSearchSorting: "MOST_LIKED",
        videoSearchDateFilter: "PAST_WEEK",
      },
    },
    youtube: {
      actorId: "streamers~youtube-scraper",
      input: {
        searchQueries: queries,
        maxResults: SOCIAL_RESULT_LIMIT_PER_CITY,
        maxResultsShorts: SOCIAL_RESULT_LIMIT_PER_CITY,
        sortingOrder: "views",
        dateFilter: "week",
      },
    },
  };
}

export function getWeekStart(value: Date = new Date()): string {
  const date = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function compactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(compactText).filter(Boolean).join(" ");
  return "";
}

function nestedValue(item: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[key];
  }, item);
}

function firstText(item: Record<string, unknown>, paths: string[]): string {
  for (const path of paths) {
    const value = compactText(nestedValue(item, path));
    if (value) return value;
  }
  return "";
}

function firstCount(item: Record<string, unknown>, paths: string[]): number {
  for (const path of paths) {
    const value = nestedValue(item, path);
    const number = typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/,/g, ""))
        : NaN;
    if (Number.isFinite(number) && number >= 0) return Math.floor(number);
  }
  return 0;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function detectCitySlug(item: Record<string, unknown>): string | null {
  const searchable = [
    firstText(item, ["searchQuery", "query", "searchTerm", "sourceInput", "source_input"]),
    firstText(item, ["input", "inputUrl", "hashtag", "hashtagName"]),
    firstText(item, ["caption", "text", "title", "description"]),
    firstText(item, ["locationName", "location.name", "location.city"]),
  ].join(" ");
  const normalized = normalizeSearchText(searchable);
  const compact = normalized.replace(/\s+/g, "");
  return SOCIAL_SCOUT_CITIES.find((city) =>
    normalized.includes(normalizeSearchText(city.name)) ||
    normalized.includes(normalizeSearchText(city.slug)) ||
    compact.includes(normalizeSearchText(city.name).replace(/\s+/g, "")) ||
    compact.includes(normalizeSearchText(city.slug).replace(/\s+/g, "")),
  )?.slug || null;
}

function canonicalSocialUrl(
  item: Record<string, unknown>,
  platform: SocialTrendPlatform,
): string | null {
  const value = firstText(item, [
    "url",
    "postUrl",
    "videoUrl",
    "webVideoUrl",
    "webVideoUrlNoWatermark",
  ]);
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase();
    if (!PLATFORM_HOSTS[platform].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      return null;
    }
    const validContentPath = platform === "instagram"
      ? /^\/(?:p|reel|tv)\/[^/]+\/?$/i.test(url.pathname)
      : platform === "tiktok"
        ? (/^\/@[^/]+\/video\/\d+\/?$/i.test(url.pathname) ||
          (/^(?:vm|vt)\.tiktok\.com$/.test(host) && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname)))
        : host === "youtu.be"
          ? /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
          : (/^\/shorts\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) ||
            (url.pathname === "/watch" && Boolean(url.searchParams.get("v"))));
    if (!validContentPath) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["igsh", "si", "feature"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizePublishedAt(item: Record<string, unknown>): string | null {
  const value = nestedValue(item, "timestamp") ??
    nestedValue(item, "createTimeISO") ??
    nestedValue(item, "date") ??
    nestedValue(item, "date_posted") ??
    nestedValue(item, "publishedAt");
  if (typeof value === "number") {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePlaceHint(item: Record<string, unknown>, citySlug: string): string | null {
  const value = firstText(item, [
    "locationName",
    "location.name",
    "placeName",
    "place.name",
    "poi.name",
  ]).replace(/\s+/g, " ").trim().slice(0, 160);
  if (value.length < 3) return null;
  const city = SOCIAL_SCOUT_CITIES.find((candidate) => candidate.slug === citySlug);
  const normalized = normalizeSearchText(value);
  if (!city || normalized === normalizeSearchText(city.name) || normalized === normalizeSearchText(city.slug)) {
    return null;
  }
  if (/^(travel|tourism|hidden gems?|food|nightlife|things to do)$/i.test(value)) return null;
  return value;
}

export function normalizeSocialTrendItem(input: {
  item: Record<string, unknown>;
  platform: SocialTrendPlatform;
  weekStart: string;
}): NormalizedSocialTrendItem | null {
  const citySlug = detectCitySlug(input.item);
  const canonicalUrl = canonicalSocialUrl(input.item, input.platform);
  if (!citySlug || !canonicalUrl) return null;
  const publishedAt = normalizePublishedAt(input.item);
  if (input.platform === "instagram" && !publishedAt) return null;
  if (publishedAt) {
    const publishedTime = new Date(publishedAt).getTime();
    const weekStartTime = new Date(`${input.weekStart}T00:00:00.000Z`).getTime();
    if (publishedTime < weekStartTime || publishedTime >= weekStartTime + 7 * 24 * 60 * 60 * 1_000) {
      return null;
    }
  }

  const externalId = firstText(input.item, [
    "id",
    "shortCode",
    "shortcode",
    "videoId",
    "video_id",
  ]) || createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32);
  const placeHint = normalizePlaceHint(input.item, citySlug);
  const contentText = [
    placeHint,
    firstText(input.item, ["caption", "text", "title"]),
    firstText(input.item, ["description"]),
    compactText(nestedValue(input.item, "hashtags")),
  ].filter(Boolean).join("\n").slice(0, MAX_CONTENT_TEXT_LENGTH);

  return {
    weekStart: input.weekStart,
    citySlug,
    platform: input.platform,
    externalId: externalId.slice(0, 200),
    canonicalUrl,
    contentText,
    placeHint,
    publishedAt,
    viewCount: firstCount(input.item, [
      "videoPlayCount", "playCount", "viewCount", "views", "stats.playCount", "stats.views",
    ]),
    likeCount: firstCount(input.item, [
      "likesCount", "diggCount", "likeCount", "likes", "stats.diggCount", "stats.likes",
    ]),
    commentCount: firstCount(input.item, [
      "commentsCount", "commentCount", "comments", "stats.commentCount", "stats.comments",
    ]),
    shareCount: firstCount(input.item, [
      "sharesCount", "shareCount", "shares", "stats.shareCount", "stats.shares",
    ]),
    saveCount: firstCount(input.item, [
      "collectCount", "saveCount", "savesCount", "stats.collectCount", "stats.saves",
    ]),
  };
}

function apifyHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function apifyRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${APIFY_API_BASE}${path}`, {
    ...init,
    headers: { ...apifyHeaders(token), ...init.headers },
    signal: AbortSignal.timeout(APIFY_REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Apify request failed with status ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

async function claimRunSlot(input: {
  weekStart: string;
  platform: SocialTrendPlatform;
  actorId: string;
}): Promise<TrendRunRow | null> {
  const supabase = createSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("weekly_social_trend_runs")
    .select("*")
    .eq("week_start", input.weekStart)
    .eq("platform", input.platform)
    .maybeSingle();
  if (existingError) throw new Error(`Could not inspect weekly social run: ${existingError.message}`);
  if (existing) {
    const run = existing as TrendRunRow;
    if (!canRetryTrendRun(run)) return null;
    const placeholder = `starting:${randomUUID()}`;
    const { data, error } = await supabase
      .from("weekly_social_trend_runs")
      .update({
        actor_id: input.actorId,
        actor_run_id: placeholder,
        dataset_id: null,
        state: "starting",
        error_message: null,
        attempt_count: run.attempt_count + 1,
        started_at: new Date().toISOString(),
        completed_at: null,
        processed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("state", "failed")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Could not retry weekly social run: ${error.message}`);
    return data as TrendRunRow | null;
  }
  const placeholder = `starting:${randomUUID()}`;
  const { data, error } = await supabase
    .from("weekly_social_trend_runs")
    .insert({
      week_start: input.weekStart,
      platform: input.platform,
      actor_id: input.actorId,
      actor_run_id: placeholder,
      state: "starting",
    })
    .select("*")
    .maybeSingle();
  if (error?.code === "23505") return null;
  if (error) throw new Error(`Could not claim weekly social run: ${error.message}`);
  return data as TrendRunRow;
}

async function startMissingRuns(
  token: string,
  weekStart: string,
): Promise<SocialTrendPlatform[]> {
  const supabase = createSupabaseAdmin();
  const configs = actorConfigs();
  const started: SocialTrendPlatform[] = [];
  let attemptedStarts = 0;
  for (const platform of Object.keys(configs) as SocialTrendPlatform[]) {
    if (attemptedStarts >= MAX_NEW_RUNS_PER_INVOCATION) break;
    const config = configs[platform];
    const slot = await claimRunSlot({ weekStart, platform, actorId: config.actorId });
    if (!slot) continue;
    attemptedStarts += 1;
    try {
      const response = await apifyRequest<{
        data: { id: string; defaultDatasetId?: string; status: string };
      }>(`/acts/${config.actorId}/runs?waitForFinish=0&maxTotalChargeUsd=${MAX_ACTOR_CHARGE_USD}`, token, {
        method: "POST",
        body: JSON.stringify(config.input),
      });
      const { error } = await supabase
        .from("weekly_social_trend_runs")
        .update({
          actor_run_id: response.data.id,
          dataset_id: response.data.defaultDatasetId || null,
          state: "running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", slot.id);
      if (error) throw new Error(error.message);
      started.push(platform);
    } catch (error) {
      await supabase
        .from("weekly_social_trend_runs")
        .update({
          state: "failed",
          error_message: error instanceof Error ? error.message.slice(0, 500) : "Actor start failed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", slot.id);
    }
  }
  return started;
}

async function upsertContentItems(items: NormalizedSocialTrendItem[]): Promise<void> {
  if (items.length === 0) return;
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("weekly_social_content").upsert(
    items.map((item) => ({
      week_start: item.weekStart,
      city_slug: item.citySlug,
      platform: item.platform,
      external_id: item.externalId,
      canonical_url: item.canonicalUrl,
      content_text: item.contentText,
      place_hint: item.placeHint,
      published_at: item.publishedAt,
      view_count: item.viewCount,
      like_count: item.likeCount,
      comment_count: item.commentCount,
      share_count: item.shareCount,
      save_count: item.saveCount,
      observed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 56 * 24 * 60 * 60 * 1_000).toISOString(),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "week_start,platform,external_id,city_slug" },
  );
  if (error) throw new Error(`Could not store weekly social content: ${error.message}`);

  const leads = items.filter((item) => item.placeHint && engagementValue(item) > 0);
  if (leads.length === 0) return;
  const { error: leadsError } = await supabase.from("weekly_social_spot_leads").upsert(
    leads.map((item) => ({
      week_start: item.weekStart,
      city_slug: item.citySlug,
      platform: item.platform,
      external_id: item.externalId,
      place_hint: item.placeHint,
      normalized_hint: normalizeSearchText(item.placeHint || "").slice(0, 160),
      canonical_url: item.canonicalUrl,
      engagement_score: engagementValue(item),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "week_start,city_slug,normalized_hint" },
  );
  if (leadsError) throw new Error(`Could not store weekly social place leads: ${leadsError.message}`);

  for (const citySlug of [...new Set(leads.map((item) => item.citySlug))]) {
    const { data: overflow, error: overflowError } = await supabase
      .from("weekly_social_spot_leads")
      .select("id")
      .eq("city_slug", citySlug)
      .eq("status", "pending")
      .order("engagement_score", { ascending: false })
      .order("created_at", { ascending: true })
      .range(MAX_PENDING_SOCIAL_LEADS_PER_CITY, 99);
    if (overflowError) throw new Error(`Could not bound social spot leads: ${overflowError.message}`);
    const overflowIds = (overflow || []).map((lead) => lead.id);
    if (overflowIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("weekly_social_spot_leads")
        .delete()
        .in("id", overflowIds)
        .eq("status", "pending");
      if (deleteError) throw new Error(`Could not prune social spot leads: ${deleteError.message}`);
    }
  }
}

function spotCitySlug(spot: RawSpot): string | null {
  return inferCityFromAddress(getLocalizedText(spot.address))?.slug || null;
}

export function mentionsSpot(content: string, spot: Pick<RawSpot, "name">): boolean {
  const name = normalizeSearchText(getLocalizedText(spot.name));
  if (name.length < 5) return false;
  return normalizeSearchText(content).includes(name);
}

function engagementValue(item: NormalizedSocialTrendItem): number {
  return item.viewCount + item.likeCount * 8 + item.commentCount * 12 +
    item.shareCount * 20 + item.saveCount * 16;
}

type SpotSignalLink = {
  spotId: string;
  signalIds: string[];
};

function signalKey(item: Pick<NormalizedSocialTrendItem, "platform" | "externalId">): string {
  return `${item.platform}:${item.externalId}`;
}

function linkSignalsToSpots(input: {
  signals: NormalizedSocialTrendItem[];
  spots: RawSpot[];
}): SpotSignalLink[] {
  const eligibleSignals = input.signals
    .filter((signal) => engagementValue(signal) > 0 && signal.contentText.trim())
    .sort((left, right) => engagementValue(right) - engagementValue(left))
    .slice(0, MAX_LINKER_SIGNALS_PER_CITY);
  const eligibleSpots = input.spots
    .sort((left, right) => (right.localley_score || 0) - (left.localley_score || 0))
    .slice(0, MAX_LINKER_SPOTS_PER_CITY);
  if (eligibleSignals.length === 0 || eligibleSpots.length === 0) return [];

  const hardLinks = new Map<string, Set<string>>();
  for (const spot of eligibleSpots) {
    for (const signal of eligibleSignals) {
      if (!mentionsSpot(signal.contentText, spot)) continue;
      const linked = hardLinks.get(spot.id) || new Set<string>();
      linked.add(signalKey(signal));
      hardLinks.set(spot.id, linked);
    }
  }

  return [...hardLinks].map(([spotId, signalIds]) => ({
    spotId,
    signalIds: [...signalIds],
  }));
}

async function rebuildCityRankings(weekStart: string, citySlug: string): Promise<number> {
  const supabase = createSupabaseAdmin();
  const [{ data: contentRows, error: contentError }, { data: spotRows, error: spotError }] = await Promise.all([
    supabase.from("weekly_social_content").select("*").eq("week_start", weekStart),
    supabase.from("spots").select("*").gte("localley_score", 4).eq("verified", true),
  ]);
  if (contentError) throw new Error(`Could not load social signals: ${contentError.message}`);
  if (spotError) throw new Error(`Could not load trend candidates: ${spotError.message}`);

  const content = (contentRows || []).map((row) => ({
    weekStart: row.week_start,
    citySlug: row.city_slug,
    platform: row.platform as SocialTrendPlatform,
    externalId: row.external_id,
    canonicalUrl: row.canonical_url,
    contentText: row.content_text,
    placeHint: row.place_hint || null,
    publishedAt: row.published_at,
    viewCount: Number(row.view_count) || 0,
    likeCount: Number(row.like_count) || 0,
    commentCount: Number(row.comment_count) || 0,
    shareCount: Number(row.share_count) || 0,
    saveCount: Number(row.save_count) || 0,
  } satisfies NormalizedSocialTrendItem));
  const spots = ((spotRows || []) as RawSpot[]).filter((spot) => {
    if (!shouldShowPublicSpot(spot)) return false;
    return normalizeSpotPhotos(spot.photos, spot.category).some(
      (photo) => !photo.includes("/images/placeholders/"),
    );
  });

  const city = SOCIAL_SCOUT_CITIES.find((candidate) => candidate.slug === citySlug);
  if (!city) throw new Error(`Unsupported social trend city: ${citySlug}`);
    const cityContent = content.filter(
      (item) => item.citySlug === city.slug && engagementValue(item) > 0,
    );
    const citySpots = spots.filter((spot) => spotCitySlug(spot) === city.slug);
    const links = linkSignalsToSpots({
      signals: cityContent,
      spots: citySpots,
    });
    const signalsById = new Map(cityContent.map((signal) => [signalKey(signal), signal]));
    const maxByPlatform = new Map<SocialTrendPlatform, number>();
    for (const item of cityContent) {
      maxByPlatform.set(
        item.platform,
        Math.max(maxByPlatform.get(item.platform) || 0, engagementValue(item)),
      );
    }
    const candidates = links
      .map((link) => {
        const spot = citySpots.find((candidate) => candidate.id === link.spotId);
        if (!spot) return null;
        const signals = link.signalIds
          .map((signalId) => signalsById.get(signalId))
          .filter((signal): signal is NormalizedSocialTrendItem => Boolean(signal));
        if (signals.length === 0) return null;
        const normalizedSignals = signals.map((item) => {
          const max = Math.max(1, maxByPlatform.get(item.platform) || 1);
          return Math.log1p(engagementValue(item)) / Math.log1p(max);
        });
        const platforms = new Set(signals.map((item) => item.platform));
        const peak = Math.max(...normalizedSignals);
        const average = normalizedSignals.reduce((sum, value) => sum + value, 0) / normalizedSignals.length;
        const corroboration = Math.min(1, (signals.length - 1) / 3 + (platforms.size - 1) / 2);
        const recentSignals = signals.filter((item) => {
          if (!item.publishedAt) return false;
          return Date.now() - new Date(item.publishedAt).getTime() <= 8 * 24 * 60 * 60 * 1_000;
        }).length;
        const recency = recentSignals / signals.length;
        const score = Math.min(100, (peak * 0.55 + average * 0.2 + corroboration * 0.15 + recency * 0.1) * 100);
        return { spot, signals, platforms, score };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

  const rankingRows = candidates.map((candidate, index) => ({
    spot_id: candidate.spot.id,
    rank: index + 1,
    score: candidate.score.toFixed(3),
    post_count: candidate.signals.length,
    platform_count: candidate.platforms.size,
    signal_summary: {
      label: "Trending on social this week",
      recentPublicPosts: candidate.signals.length,
      socialChannels: candidate.platforms.size,
    },
  }));

  const { error } = await supabase.rpc("replace_weekly_city_spot_rankings", {
    p_week_start: weekStart,
    p_city_slug: city.slug,
    p_rankings: rankingRows,
  });
  if (error) throw new Error(`Could not publish weekly rankings: ${error.message}`);
  return rankingRows.length;
}

export function getSocialTrendRetentionCutoffs(now: Date = new Date()): {
  derivedBeforeWeek: string;
  staleStartingBefore: string;
  staleRunningBefore: string;
} {
  return {
    derivedBeforeWeek: new Date(
      now.getTime() - DERIVED_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
    ).toISOString().slice(0, 10),
    staleStartingBefore: new Date(
      now.getTime() - STALE_STARTING_MINUTES * 60 * 1_000,
    ).toISOString(),
    staleRunningBefore: new Date(
      now.getTime() - STALE_RUNNING_HOURS * 60 * 60 * 1_000,
    ).toISOString(),
  };
}

async function cleanupSocialTrendData(now: Date): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { derivedBeforeWeek, staleStartingBefore, staleRunningBefore } =
    getSocialTrendRetentionCutoffs(now);
  const cleanupResults = await Promise.all([
    supabase
      .from("weekly_social_content")
      .delete()
      .lt("expires_at", now.toISOString()),
    supabase
      .from("weekly_city_spot_rankings")
      .delete()
      .lt("week_start", derivedBeforeWeek),
    supabase
      .from("weekly_social_trend_runs")
      .update({
        state: "failed",
        error_message: "Actor start did not complete within the safety window.",
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("state", "starting")
      .lt("started_at", staleStartingBefore),
    supabase
      .from("weekly_social_trend_runs")
      .update({
        state: "failed",
        error_message: "Actor run exceeded the six-hour safety window.",
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("state", "running")
      .lt("started_at", staleRunningBefore),
    supabase
      .from("weekly_social_trend_city_builds")
      .update({
        state: "failed",
        error_message: "City ranking build lease expired.",
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("state", "running")
      .lt("lease_expires_at", now.toISOString()),
    supabase
      .from("weekly_social_trend_city_builds")
      .delete()
      .lt("week_start", derivedBeforeWeek),
    supabase
      .from("weekly_social_trend_runs")
      .delete()
      .lt("week_start", derivedBeforeWeek),
    supabase
      .from("weekly_social_spot_leads")
      .delete()
      .lt("expires_at", now.toISOString()),
  ]);
  const cleanupError = cleanupResults.find((result) => result.error)?.error;
  if (cleanupError) {
    throw new Error(`Could not apply social trend retention: ${cleanupError.message}`);
  }
}

async function processAvailableRuns(
  token: string,
  weekStart: string,
  summary: WeeklyTrendRefreshSummary,
): Promise<{ handled: boolean; pending: boolean }> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("weekly_social_trend_runs")
    .select("*")
    .eq("week_start", weekStart)
    .is("processed_at", null)
    .in("state", ["starting", "running", "succeeded"])
    .order("started_at", { ascending: true })
    .limit(3);
  if (error) throw new Error(`Could not load weekly social runs: ${error.message}`);
  let handled = false;
  let pending = false;

  for (const row of data || []) {
    const run = row as TrendRunRow;
    if (run.actor_run_id.startsWith("starting:")) {
      summary.pending.push(run.platform);
      pending = true;
      continue;
    }
    const response = await apifyRequest<{
      data: { status: string; defaultDatasetId?: string };
    }>(`/actor-runs/${run.actor_run_id}`, token);
    const status = response.data.status;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      const { error: updateError } = await supabase
        .from("weekly_social_trend_runs")
        .update({
          state: "failed",
          error_message: `Actor ended with ${status}.`,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      if (updateError) throw new Error(`Could not record failed social run: ${updateError.message}`);
      summary.failed.push(run.platform);
      handled = true;
      continue;
    }
    if (status !== "SUCCEEDED") {
      summary.pending.push(run.platform);
      pending = true;
      continue;
    }

    const datasetId = response.data.defaultDatasetId || run.dataset_id;
    if (!datasetId) throw new Error(`Completed ${run.platform} run has no dataset.`);
    const items = await apifyRequest<Record<string, unknown>[]>(
      `/datasets/${datasetId}/items?clean=true&limit=${APIFY_DATASET_LIMIT}`,
      token,
    );
    const normalized = items
      .map((item) => normalizeSocialTrendItem({ item, platform: run.platform, weekStart }))
      .filter((item): item is NormalizedSocialTrendItem => Boolean(item));
    await upsertContentItems(normalized);
    const { error: updateError } = await supabase
      .from("weekly_social_trend_runs")
      .update({
        dataset_id: datasetId,
        state: "succeeded",
        completed_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    if (updateError) throw new Error(`Could not mark social run processed: ${updateError.message}`);
    summary.contentItems += normalized.length;
    summary.processed.push(run.platform);
    handled = true;
  }

  return { handled, pending };
}

async function runsReadyForBuild(weekStart: string): Promise<boolean> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("weekly_social_trend_runs")
    .select("state,attempt_count,processed_at")
    .eq("week_start", weekStart);
  if (error) throw new Error(`Could not inspect weekly social run readiness: ${error.message}`);
  return areTrendRunsReadyForBuild(data || []);
}

async function claimNextCityBuild(weekStart: string): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("weekly_social_trend_city_builds")
    .select("city_slug,state,attempt_count")
    .eq("week_start", weekStart);
  if (error) throw new Error(`Could not inspect city ranking builds: ${error.message}`);
  const builds = new Map((data || []).map((build) => [build.city_slug, build]));
  const city = SOCIAL_SCOUT_CITIES.find((candidate) => {
    const build = builds.get(candidate.slug);
    return !build || (build.state === "failed" && build.attempt_count < MAX_CITY_BUILD_ATTEMPTS);
  });
  if (!city) return null;

  const existing = builds.get(city.slug);
  const timestamp = new Date();
  const claim = {
      week_start: weekStart,
      city_slug: city.slug,
      state: "running",
      attempt_count: existing ? existing.attempt_count + 1 : 1,
      error_message: null,
      lease_expires_at: new Date(timestamp.getTime() + 10 * 60 * 1_000).toISOString(),
      completed_at: null,
      updated_at: timestamp.toISOString(),
  };
  const query = existing
    ? supabase
        .from("weekly_social_trend_city_builds")
        .update(claim)
        .eq("week_start", weekStart)
        .eq("city_slug", city.slug)
        .eq("state", "failed")
        .eq("attempt_count", existing.attempt_count)
    : supabase.from("weekly_social_trend_city_builds").insert(claim);
  const { data: claimed, error: claimError } = await query.select("city_slug").maybeSingle();
  if (claimError?.code === "23505") return null;
  if (claimError) throw new Error(`Could not claim city ranking build: ${claimError.message}`);
  return claimed?.city_slug || null;
}

async function buildNextCity(
  weekStart: string,
  summary: WeeklyTrendRefreshSummary,
): Promise<boolean> {
  if (!await runsReadyForBuild(weekStart)) return false;
  const citySlug = await claimNextCityBuild(weekStart);
  if (!citySlug) return false;
  const supabase = createSupabaseAdmin();
  try {
    summary.rankings += await rebuildCityRankings(weekStart, citySlug);
    const { error } = await supabase
      .from("weekly_social_trend_city_builds")
      .update({
        state: "succeeded",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("week_start", weekStart)
      .eq("city_slug", citySlug);
    if (error) throw new Error(`Could not complete city ranking build: ${error.message}`);
    summary.builtCities.push(citySlug);
  } catch (error) {
    await supabase
      .from("weekly_social_trend_city_builds")
      .update({
        state: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 500) : "City build failed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("week_start", weekStart)
      .eq("city_slug", citySlug);
    throw error;
  }
  return true;
}

async function buildRemainingCities(
  weekStart: string,
  summary: WeeklyTrendRefreshSummary,
): Promise<void> {
  for (let index = 0; index < SOCIAL_SCOUT_CITIES.length; index += 1) {
    if (!await buildNextCity(weekStart, summary)) break;
  }
}

export async function refreshWeeklySocialTrends(
  now: Date = new Date(),
): Promise<WeeklyTrendRefreshSummary> {
  if (process.env.WEEKLY_SOCIAL_TRENDS_ENABLED !== "true") {
    throw new Error("Weekly social trends are disabled.");
  }
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new Error("APIFY_API_TOKEN is not configured.");

  const weekStart = getWeekStart(now);
  const summary: WeeklyTrendRefreshSummary = {
    weekStart,
    started: [],
    pending: [],
    processed: [],
    failed: [],
    contentItems: 0,
    rankings: 0,
    builtCities: [],
  };
  await cleanupSocialTrendData(now);
  const processResult = await processAvailableRuns(token, weekStart, summary);
  summary.started = await startMissingRuns(token, weekStart);
  if (summary.started.length > 0) return summary;
  if (processResult.pending) return summary;
  await buildRemainingCities(weekStart, summary);
  return summary;
}
