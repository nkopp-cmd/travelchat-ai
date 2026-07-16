import { z } from "zod";
import { ENABLED_CITIES } from "../cities";

export const VIBE_SLUGS = [
  "trendy",
  "family-friendly",
  "luxury",
  "budget",
  "cultural",
  "nightlife",
  "wellness",
  "adventure",
  "foodie",
  "historic",
  "romantic",
  "quiet",
  "walkable",
  "accessible",
  "local-authenticity",
] as const;

export const normalizeGeoAlias = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const slugSchema = z.string().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Expected a lowercase kebab-case slug.",
);

const localizedTextSchema = z
  .record(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/), z.string().trim().min(1).max(500))
  .refine((value) => Boolean(value.en), "English localized text is required.");

const sourceMetaSchema = z.object({
  source: z.string().trim().min(1).max(120),
  sourceId: z.string().trim().min(1).max(200),
  license: z.string().trim().min(1).max(160),
  url: z.url().optional(),
  retrievedAt: z.iso.datetime(),
});

const centerSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const aliasArraySchema = z.array(z.string().trim().min(1).max(160)).superRefine((aliases, ctx) => {
  const seen = new Set<string>();
  for (const [index, alias] of aliases.entries()) {
    const normalized = normalizeGeoAlias(alias);
    if (!normalized || seen.has(normalized)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate normalized alias: ${alias}`,
        path: [index],
      });
    }
    seen.add(normalized);
  }
});

const vibeScoreSchema = z.object({
  slug: z.enum(VIBE_SLUGS),
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidence: z.string().trim().min(12).max(500),
});

const localAreaSchema = z.object({
  slug: slugSchema,
  kind: z.enum([
    "district",
    "neighborhood",
    "town",
    "island",
    "day_trip_area",
    "spot_cluster",
  ]),
  name: localizedTextSchema,
  aliases: aliasArraySchema,
  characterization: localizedTextSchema,
  travelerTypes: z.array(z.string().trim().min(1).max(80)).min(1),
  practicalNotes: z.object({
    walkability: z.string().trim().min(1).max(400),
    bestTime: z.string().trim().min(1).max(400),
    transit: z.string().trim().min(1).max(400),
  }),
  center: centerSchema.optional(),
  confidence: z.number().min(0).max(1),
  reviewStatus: z.enum(["draft", "machine_checked", "human_verified", "needs_review"]),
  reviewedAt: z.iso.datetime(),
  sourceMeta: sourceMetaSchema,
  vibes: z.array(vibeScoreSchema).min(3),
}).superRefine((area, ctx) => {
  const vibeSlugs = new Set<string>();
  for (const [index, vibe] of area.vibes.entries()) {
    if (vibeSlugs.has(vibe.slug)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate vibe axis: ${vibe.slug}`,
        path: ["vibes", index, "slug"],
      });
    }
    vibeSlugs.add(vibe.slug);
  }
});

const countrySchema = z.object({
  code: z.string().regex(/^[A-Z]{2}$/),
  name: localizedTextSchema,
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  defaultLanguages: z.array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)).min(1),
  sourceMeta: sourceMetaSchema,
});

const destinationSchema = z.object({
  slug: slugSchema,
  name: localizedTextSchema,
  aliases: aliasArraySchema.min(1),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  center: centerSchema,
  timezone: z.string().trim().min(3).max(80),
  currency: z.string().regex(/^[A-Z]{3}$/),
  languages: z.array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)).min(1),
  ring: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  isEnabled: z.boolean(),
  targets: z.object({
    spots: z.object({ min: z.number().int().nonnegative(), ideal: z.number().int().positive() }),
    templates: z.object({ min: z.number().int().nonnegative(), ideal: z.number().int().positive() }),
  }),
  characterization: localizedTextSchema,
  sourceMeta: sourceMetaSchema,
  reviewedAt: z.iso.datetime(),
  localAreas: z.array(localAreaSchema),
}).refine(
  (destination) => destination.targets.spots.ideal >= destination.targets.spots.min &&
    destination.targets.templates.ideal >= destination.targets.templates.min,
  "Ideal coverage targets must be greater than or equal to minimum targets.",
);

const vibeTaxonomySchema = z.object({
  slug: z.enum(VIBE_SLUGS),
  label: z.string().trim().min(1).max(80),
  version: z.number().int().positive(),
  rubric: z.object({
    veryLow: z.string().trim().min(1),
    low: z.string().trim().min(1),
    mixed: z.string().trim().min(1),
    high: z.string().trim().min(1),
    defining: z.string().trim().min(1),
  }),
});

const canonicalDestinationSlugs = new Set(ENABLED_CITIES.map((city) => city.slug));

export const GeographyManifestSchema = z.object({
  version: z.literal(1),
  generatedFrom: z.literal("lib/cities.ts"),
  reviewedAt: z.iso.datetime(),
  countries: z.array(countrySchema).min(1),
  vibeTaxonomy: z.array(vibeTaxonomySchema).length(VIBE_SLUGS.length),
  destinations: z.array(destinationSchema).min(1),
}).superRefine((manifest, ctx) => {
  const countryCodes = new Set<string>();
  for (const [index, country] of manifest.countries.entries()) {
    if (countryCodes.has(country.code)) {
      ctx.addIssue({ code: "custom", message: `Duplicate country code: ${country.code}`, path: ["countries", index] });
    }
    countryCodes.add(country.code);
  }

  const destinationSlugs = new Set<string>();
  for (const [index, destination] of manifest.destinations.entries()) {
    if (!canonicalDestinationSlugs.has(destination.slug)) {
      ctx.addIssue({
        code: "custom",
        message: `Destination slug is not present in the canonical city registry: ${destination.slug}`,
        path: ["destinations", index, "slug"],
      });
    }
    if (destinationSlugs.has(destination.slug)) {
      ctx.addIssue({ code: "custom", message: `Duplicate destination slug: ${destination.slug}`, path: ["destinations", index] });
    }
    destinationSlugs.add(destination.slug);
    if (!countryCodes.has(destination.countryCode)) {
      ctx.addIssue({ code: "custom", message: `Unknown country code: ${destination.countryCode}`, path: ["destinations", index, "countryCode"] });
    }
    const areaSlugs = new Set<string>();
    for (const [areaIndex, area] of destination.localAreas.entries()) {
      if (areaSlugs.has(area.slug)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate local-area slug in ${destination.slug}: ${area.slug}`,
          path: ["destinations", index, "localAreas", areaIndex, "slug"],
        });
      }
      areaSlugs.add(area.slug);
    }
  }

  const missing = [...canonicalDestinationSlugs].filter((slug) => !destinationSlugs.has(slug));
  if (missing.length > 0) {
    ctx.addIssue({
      code: "custom",
      message: `Manifest is missing canonical city registry slugs: ${missing.join(", ")}`,
      path: ["destinations"],
    });
  }

  const taxonomySlugs = manifest.vibeTaxonomy.map((vibe) => vibe.slug);
  if (new Set(taxonomySlugs).size !== VIBE_SLUGS.length) {
    ctx.addIssue({ code: "custom", message: "Vibe taxonomy must include every axis exactly once.", path: ["vibeTaxonomy"] });
  }
});

export type GeographyManifest = z.infer<typeof GeographyManifestSchema>;
export type GeographyDestination = GeographyManifest["destinations"][number];
export type GeographyLocalArea = GeographyDestination["localAreas"][number];
