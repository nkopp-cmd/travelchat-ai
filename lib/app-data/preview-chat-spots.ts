import "server-only";
import { ALL_CITIES } from "@/lib/cities";
import { formatChatSpotContext, matchedChatCategories, type ChatContextSpot } from "@/lib/chat/spot-context";
import { PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS } from "@/lib/spots/public-quality";
import { previewAppDataReader } from "./preview-db";

interface BatchRow { counts: string }
interface CountRow { spots: number; source: number; visible: number }
interface SourceRow { spotId: string; payload: string }

function sourceSpot(row: SourceRow): ChatContextSpot & { id: string } {
  const source: unknown = JSON.parse(row.payload);
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Invalid chat spot source");
  const spot = source as Record<string, unknown>;
  const text = (value: unknown): value is Record<string, string> => !!value
    && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every(part => typeof part === "string");
  if (spot.id !== row.spotId || !text(spot.name) || !text(spot.description)
    || !text(spot.address) || !text(spot.best_times)
    || typeof spot.category !== "string" || !spot.category
    || !Number.isSafeInteger(spot.localley_score) || (spot.localley_score as number) < 1
    || (spot.localley_score as number) > 6
    || !Number.isSafeInteger(spot.local_percentage) || (spot.local_percentage as number) < 0
    || (spot.local_percentage as number) > 100
    || !(spot.photos === null || (Array.isArray(spot.photos)
      && spot.photos.every(photo => typeof photo === "string")))
    || !Array.isArray(spot.subcategories)) throw new Error("Invalid chat spot fields");
  return {
    id: row.spotId, name: spot.name, description: spot.description,
    address: spot.address, category: spot.category,
    localley_score: spot.localley_score as number,
    local_percentage: spot.local_percentage as number,
    best_times: spot.best_times,
    tips: spot.tips, photos: spot.photos as string[] | null,
  };
}

/** Read full source fields through the counted archive; normalized D1 controls visibility. */
export async function previewChatSpotContext(city: string, userMessage: string) {
  if (city.length > 100 || userMessage.length > 200) throw new RangeError("Invalid chat spot query");
  const cityConfig = ALL_CITIES.find(item => item.name.toLowerCase() === city.toLowerCase());
  if (!cityConfig) throw new RangeError("Unknown chat city");
  const db = previewAppDataReader();
  const [batches, counts] = await Promise.all([
    db.prepare("SELECT counts FROM legacy_import_batches LIMIT 2").all<BatchRow>(),
    db.prepare(`SELECT (SELECT count(*) FROM spots) AS spots,
      (SELECT count(*) FROM legacy_spot_source) AS source,
      (SELECT count(*) FROM spots WHERE visible = 1) AS visible`).first<CountRow>(),
  ]);
  if (!Array.isArray(batches.results) || batches.results.length !== 1 || !counts) {
    throw new Error("Chat source batch unavailable");
  }
  const expected: unknown = JSON.parse(batches.results[0].counts);
  if (!expected || typeof expected !== "object" || Array.isArray(expected)
    || (expected as Record<string, unknown>).spots !== counts.spots
    || (expected as Record<string, unknown>).legacy_spot_source !== counts.source
    || counts.spots !== counts.source || !Number.isSafeInteger(counts.visible)
    || counts.visible < 0 || counts.visible > counts.spots) throw new Error("Chat source count mismatch");

  const categories = matchedChatCategories(userMessage);
  const categoryClause = categories.length
    ? ` AND json_extract(x.payload, '$.category') IN (${categories.map(() => "?").join(",")})` : "";
  const limit = categories.length ? 15 : 20;
  const excludedNames = PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS.map(() =>
    " AND json_extract(x.payload, '$.name.en') NOT LIKE ? COLLATE NOCASE").join("");
  const sql = `SELECT x.spotId, x.payload, x.publicIssue, s.visible FROM legacy_spot_source x
    JOIN spots s ON s.id = x.spotId
    WHERE json_extract(x.payload, '$.address.en') LIKE ? COLLATE NOCASE
      AND json_type(x.payload, '$.photos') = 'array'
      AND json_array_length(x.payload, '$.photos') > 0${excludedNames}${categoryClause}
    ORDER BY s.localley_score DESC,
      json_extract(x.payload, '$.local_percentage') DESC, s.id ASC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(`%${cityConfig.name}%`,
    ...PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS, ...categories, limit).all<SourceRow & { publicIssue: string | null; visible: number }>();
  if (!Array.isArray(results) || results.length > limit) throw new Error("Chat source rows unavailable");
  if (results.some(row => (row.visible === 1) !== (row.publicIssue === null))) {
    throw new Error("Chat source visibility mismatch");
  }
  // Production applies its JS quality predicate after SQL LIMIT.
  const spots = results.filter(row => row.publicIssue === null).map(sourceSpot);
  return { city: cityConfig.name, spotIds: spots.map(spot => spot.id),
    context: formatChatSpotContext(cityConfig.name, spots), categories };
}
