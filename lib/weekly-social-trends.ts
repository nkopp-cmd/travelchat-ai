import "server-only";
import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
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
  processed_at: string | null;
};

export type NormalizedSocialTrendItem = {
  weekStart: string;
  citySlug: string;
  platform: SocialTrendPlatform;
  externalId: string;
  canonicalUrl: string;
  contentText: string;
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
};

const APIFY_API_BASE = "https://api.apify.com/v2";
const APIFY_REQUEST_TIMEOUT_MS = 20_000;
const APIFY_DATASET_LIMIT = 1_000;
const SOCIAL_RESULT_LIMIT_PER_CITY = 12;
const MAX_ACTOR_CHARGE_USD = "2";
const MAX_CONTENT_TEXT_LENGTH = 4_000;
const MAX_LINKER_SIGNALS_PER_CITY = 16;
const MAX_LINKER_SPOTS_PER_CITY = 160;
const LINKER_CONCURRENCY = 4;
const MAX_NEW_RUNS_PER_INVOCATION = 1;
const DERIVED_DATA_RETENTION_DAYS = 16 * 7;
const STALE_STARTING_MINUTES = 30;

const SOCIAL_SCOUT_CITY_SLUGS = new Set([
  "seoul",
  "tokyo",
  "bangkok",
  "singapore",
  "taipei",
  "osaka",
  "kyoto",
  "hong-kong",
]);

export const SOCIAL_SCOUT_CITIES = ENABLED_CITIES.filter((city) =>
  SOCIAL_SCOUT_CITY_SLUGS.has(city.slug),
);

const PLATFORM_HOSTS: Record<SocialTrendPlatform, string[]> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
};

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
    "inputUrl",
  ]);
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase();
    if (!PLATFORM_HOSTS[platform].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      return null;
    }
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

export function normalizeSocialTrendItem(input: {
  item: Record<string, unknown>;
  platform: SocialTrendPlatform;
  weekStart: string;
}): NormalizedSocialTrendItem | null {
  const citySlug = detectCitySlug(input.item);
  const canonicalUrl = canonicalSocialUrl(input.item, input.platform);
  if (!citySlug || !canonicalUrl) return null;

  const externalId = firstText(input.item, [
    "id",
    "shortCode",
    "shortcode",
    "videoId",
    "video_id",
  ]) || createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32);
  const contentText = [
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
    publishedAt: normalizePublishedAt(input.item),
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
}

function spotCitySlug(spot: RawSpot): string | null {
  return inferCityFromAddress(getLocalizedText(spot.address))?.slug || null;
}

function mentionsSpot(content: string, spot: RawSpot): boolean {
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

async function linkSignalsToSpots(input: {
  cityName: string;
  signals: NormalizedSocialTrendItem[];
  spots: RawSpot[];
}): Promise<SpotSignalLink[]> {
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
      linked.add(signal.externalId);
      hardLinks.set(spot.id, linked);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return [...hardLinks].map(([spotId, signalIds]) => ({
      spotId,
      signalIds: [...signalIds],
    }));
  }

  const hardLinkedSignalIds = new Set(
    [...hardLinks.values()].flatMap((signalIds) => [...signalIds]),
  );
  const semanticSignals = eligibleSignals.filter(
    (signal) => !hardLinkedSignalIds.has(signal.externalId),
  );
  if (semanticSignals.length === 0) {
    return [...hardLinks].map(([spotId, signalIds]) => ({
      spotId,
      signalIds: [...signalIds],
    }));
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 0 });
    const response = await client.responses.create({
      model: process.env.SOCIAL_TREND_LINKER_MODEL || "gpt-5.4-mini",
      max_output_tokens: 2_000,
      input: [
        {
          role: "system",
          content:
            "Link social travel snippets to an allowlisted Localley place only when the snippet explicitly names that same real-world place or an unmistakable alias. Never guess from category, neighborhood, or vibe alone.",
        },
        {
          role: "user",
          content: JSON.stringify({
            city: input.cityName,
            signals: semanticSignals.map((signal) => ({
              id: signal.externalId,
              text: signal.contentText,
            })),
            allowedSpots: eligibleSpots.map((spot) => ({
              id: spot.id,
              name: getLocalizedText(spot.name),
              address: getLocalizedText(spot.address),
            })),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "weekly_social_spot_links",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["matches"],
            properties: {
              matches: {
                type: "array",
                maxItems: 40,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["spotId", "signalIds"],
                  properties: {
                    spotId: { type: "string" },
                    signalIds: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: MAX_LINKER_SIGNALS_PER_CITY,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const parsed = JSON.parse(response.output_text) as { matches?: SpotSignalLink[] };
    const allowedSpotIds = new Set(eligibleSpots.map((spot) => spot.id));
    const allowedSignalIds = new Set(semanticSignals.map((signal) => signal.externalId));
    for (const match of parsed.matches || []) {
      if (!allowedSpotIds.has(match.spotId)) continue;
      const linked = hardLinks.get(match.spotId) || new Set<string>();
      for (const signalId of match.signalIds || []) {
        if (allowedSignalIds.has(signalId)) linked.add(signalId);
      }
      if (linked.size > 0) hardLinks.set(match.spotId, linked);
    }
  } catch (error) {
    console.warn(
      `[weekly-social-trends] Semantic linking unavailable for ${input.cityName}:`,
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  return [...hardLinks].map(([spotId, signalIds]) => ({
    spotId,
    signalIds: [...signalIds],
  }));
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const output: TOutput[] = [];
  for (let index = 0; index < values.length; index += concurrency) {
    output.push(...await Promise.all(values.slice(index, index + concurrency).map(mapper)));
  }
  return output;
}

async function rebuildRankings(weekStart: string): Promise<number> {
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

  const rankingRows = (await mapWithConcurrency(
    SOCIAL_SCOUT_CITIES,
    LINKER_CONCURRENCY,
    async (city): Promise<Array<Record<string, unknown>>> => {
    const cityContent = content.filter(
      (item) => item.citySlug === city.slug && engagementValue(item) > 0,
    );
    const citySpots = spots.filter((spot) => spotCitySlug(spot) === city.slug);
    const links = await linkSignalsToSpots({
      cityName: city.name,
      signals: cityContent,
      spots: citySpots,
    });
    const signalsById = new Map(cityContent.map((signal) => [signal.externalId, signal]));
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

    return candidates.map((candidate, index) => ({
        week_start: weekStart,
        city_slug: city.slug,
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
        updated_at: new Date().toISOString(),
      }));
    },
  )).flat();

  const { error: deleteError } = await supabase
    .from("weekly_city_spot_rankings")
    .delete()
    .eq("week_start", weekStart);
  if (deleteError) throw new Error(`Could not refresh weekly rankings: ${deleteError.message}`);
  if (rankingRows.length > 0) {
    const { error } = await supabase.from("weekly_city_spot_rankings").insert(rankingRows);
    if (error) throw new Error(`Could not publish weekly rankings: ${error.message}`);
  }
  return rankingRows.length;
}

export function getSocialTrendRetentionCutoffs(now: Date = new Date()): {
  derivedBeforeWeek: string;
  staleStartingBefore: string;
} {
  return {
    derivedBeforeWeek: new Date(
      now.getTime() - DERIVED_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
    ).toISOString().slice(0, 10),
    staleStartingBefore: new Date(
      now.getTime() - STALE_STARTING_MINUTES * 60 * 1_000,
    ).toISOString(),
  };
}

async function cleanupSocialTrendData(now: Date): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { derivedBeforeWeek, staleStartingBefore } = getSocialTrendRetentionCutoffs(now);
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
      .lt("created_at", staleStartingBefore),
    supabase
      .from("weekly_social_trend_runs")
      .delete()
      .lt("week_start", derivedBeforeWeek),
  ]);
  const cleanupError = cleanupResults.find((result) => result.error)?.error;
  if (cleanupError) {
    throw new Error(`Could not apply social trend retention: ${cleanupError.message}`);
  }
}

async function processRuns(
  token: string,
  weekStart: string,
  summary: WeeklyTrendRefreshSummary,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("weekly_social_trend_runs")
    .select("*")
    .eq("week_start", weekStart)
    .is("processed_at", null);
  if (error) throw new Error(`Could not load weekly social runs: ${error.message}`);

  const runs = (data || []) as TrendRunRow[];
  const checkedRuns = await Promise.all(runs.map(async (run) => {
    if (run.state === "failed") return { run, status: "FAILED" };
    if (run.actor_run_id.startsWith("starting:")) return { run, status: "STARTING" };
    const response = await apifyRequest<{
      data: { status: string; defaultDatasetId?: string; statusMessage?: string };
    }>(`/actor-runs/${run.actor_run_id}`, token);
    return {
      run,
      status: response.data.status,
      datasetId: response.data.defaultDatasetId || run.dataset_id,
    };
  }));

  const failedRuns = checkedRuns.filter(({ status }) =>
    ["FAILED", "ABORTED", "TIMED-OUT"].includes(status),
  );
  await Promise.all(failedRuns.map(async ({ run, status }) => {
    if (run.state !== "failed") {
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
    }
    summary.failed.push(run.platform);
  }));

  for (const { run, status } of checkedRuns) {
    if (!["FAILED", "ABORTED", "TIMED-OUT", "SUCCEEDED"].includes(status)) {
      summary.pending.push(run.platform);
    }
  }

  const completed = await Promise.all(
    checkedRuns
      .filter(({ status }) => status === "SUCCEEDED")
      .map(async ({ run, datasetId }) => {
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
        return { platform: run.platform, contentItems: normalized.length };
      }),
  );
  for (const result of completed) {
    summary.contentItems += result.contentItems;
    summary.processed.push(result.platform);
  }

  if (summary.processed.length > 0) {
    summary.rankings = await rebuildRankings(weekStart);
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
  };
  await cleanupSocialTrendData(now);
  summary.started = await startMissingRuns(token, weekStart);
  await processRuns(token, weekStart, summary);
  return summary;
}
