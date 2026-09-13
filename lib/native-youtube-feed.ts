import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { z } from "zod";
import { exactNativeSocialTime, nativeSocialDigest, nativeSocialIdentity, nativeSocialWeek,
  type NativeSocialCity, type NativeSocialPost } from "./native-social-trends";

export const CHANNEL_FEED_LIMIT = 512 * 1024;
const link = z.object({ "@_rel": z.string(), "@_href": z.string() });
const author = z.object({ name: z.string().min(1), uri: z.string() });
const entrySchema = z.object({ "yt:videoId": z.string().regex(/^[A-Za-z0-9_-]{11}$/), "yt:channelId": z.string(),
  title: z.string().min(1), published: z.string(), updated: z.string().optional(), author,
  link: z.array(link), "media:group": z.object({ "media:title": z.string(), "media:description": z.string(),
    "media:community": z.preprocess(value => value === "" ? {} : value,
      z.object({ "media:statistics": z.preprocess(value => value === "" ? {} : value,
        z.object({ "@_views": z.string().optional() }).optional()) }).optional()) }),
});
const feedSchema = z.object({ "@_xmlns": z.literal("http://www.w3.org/2005/Atom"),
  "@_xmlns:yt": z.literal("http://www.youtube.com/xml/schemas/2015"), "@_xmlns:media": z.literal("http://search.yahoo.com/mrss/"),
  "yt:channelId": z.string(), title: z.string(), author, link: z.array(link), entry: z.array(entrySchema).max(20).default([]) });

export function parseNativeYouTubeFeed(xml: string, source: { channelId: string; ownerUrl: string; citySlug: NativeSocialCity }, observedAt: string) {
  const observed = exactNativeSocialTime(observedAt);
  if (observed === null || !/^UC[A-Za-z0-9_-]{22}$/.test(source.channelId)
    || !["seoul", "tokyo"].includes(source.citySlug)) throw new Error("Invalid source context");
  const owner = new URL(source.ownerUrl);
  if (owner.protocol !== "https:" || owner.username || owner.password || owner.port || owner.hash) throw new Error("Invalid channel owner source");
  if (Buffer.byteLength(xml, "utf8") > CHANNEL_FEED_LIMIT || /<!DOCTYPE|<!ENTITY/i.test(xml)
    || (xml.match(/</g) || []).length > 2000 || XMLValidator.validate(xml) !== true) throw new Error("Invalid or oversized channel XML");
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
    trimValues: false, isArray: (_name, path) => typeof path === "string" && ["feed.entry", "feed.link", "feed.entry.link"].includes(path) }).parse(xml);
  const feed = feedSchema.parse(parsed.feed), channelUrl = `https://www.youtube.com/channel/${source.channelId}`;
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`;
  if (![source.channelId, source.channelId.slice(2)].includes(feed["yt:channelId"])
    || feed.author.uri !== channelUrl || !feed.link.some(item => item["@_rel"] === "alternate" && item["@_href"] === channelUrl)
    || !feed.link.some(item => item["@_rel"] === "self" && item["@_href"].replace(/^http:/, "https:") === feedUrl)) throw new Error("Channel identity mismatch");
  const weekStart = nativeSocialWeek(observed), bodySha256 = createHash("sha256").update(xml).digest("hex"), seen = new Set<string>();
  const records: NativeSocialPost[] = [], excluded: Array<{ videoId: string; reason: string }> = [];
  for (const entry of feed.entry) {
    const id = entry["yt:videoId"], published = exactNativeSocialTime(entry.published);
    if (seen.has(id) || entry["yt:channelId"] !== source.channelId || entry.author.uri !== channelUrl
      || entry.title !== entry["media:group"]["media:title"]
      || entry.link.filter(item => item["@_rel"] === "alternate" && nativeSocialIdentity(item["@_href"])?.externalId === id).length !== 1) {
      throw new Error("Incoherent video identity");
    }
    seen.add(id);
    if (published === null || published > observed || published <= 0) throw new Error("Invalid video publication time");
    // A recent edit is not a new publication. Old videos never enter current-week ranking.
    if (nativeSocialWeek(published) !== weekStart) { excluded.push({ videoId: id, reason: "outside_current_week" }); continue; }
    const contentText = `${entry.title}\n${entry["media:group"]["media:description"]}`;
    if (contentText.length > 4000) throw new Error("Current video content exceeds review bounds");
    const rawViews = entry["media:group"]["media:community"]?.["media:statistics"]?.["@_views"];
    if (rawViews !== undefined && (!/^(?:0|[1-9]\d*)$/.test(rawViews) || !Number.isSafeInteger(Number(rawViews)))) throw new Error("Inexact view count");
    // RSS star-rating count is not a documented like count. Never relabel it as likes.
    const metrics = { views: rawViews === undefined ? null : Number(rawViews), likes: null, comments: null, shares: null, saves: null };
    const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
    records.push({ kind: "social", recordId: nativeSocialDigest({ canonicalUrl, observedAt, bodySha256 }), citySlug: source.citySlug,
      platform: "youtube", externalId: id, canonicalUrl, contentText, publishedAt: entry.published, weekStart, metrics,
      provenance: { jobId: `native-channel-capture:${nativeSocialDigest({ bodySha256, observedAt })}`, sourceUrl: canonicalUrl, observedAt,
        retrieval: { kind: "youtube_public_feed", url: feedUrl, channelId: source.channelId, bodySha256, ownerUrl: source.ownerUrl } },
      evidence: [{ locator: `feed/entry[yt:videoId='${id}']`, sourceText: contentText, publicationTimeText: entry.published,
        addressText: "", metrics }], extractionComplete: true,
      state: metrics.views === null ? "rejected" : "pending_place_match", issues: metrics.views === null ? ["engagement_unavailable"] : [] });
  }
  return { version: "localley-social-evidence-v1", publicationReady: false as const, records, discoveryLeads: [], socialSources: [],
    source: { feedUrl, channelId: source.channelId, ownerUrl: source.ownerUrl, observedAt, bodySha256, entryCount: feed.entry.length }, excluded };
}
