const CATEGORY_FALLBACKS: Record<string, string[]> = {
  food: [
    "https://images.unsplash.com/photo-1590301157890-4810ed352733",
    "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56",
    "https://images.unsplash.com/photo-1498654896293-37aacf113fd9",
    "https://images.unsplash.com/photo-1551218808-94e220e084d2",
  ],
  cafe: [
    "https://images.unsplash.com/photo-1559496417-e7f25cb247f3",
    "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb",
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24",
    "https://images.unsplash.com/photo-1445116572660-236099ec97a0",
  ],
  nightlife: [
    "https://images.unsplash.com/photo-1514933651103-005eec06c04b",
    "https://images.unsplash.com/photo-1470337458703-46ad1756a187",
    "https://images.unsplash.com/photo-1572116469696-31de0f17cc34",
    "https://images.unsplash.com/photo-1551024709-8f23befc6f87",
    "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2",
    "https://images.unsplash.com/photo-1544145945-f90425340c7e",
    "https://images.unsplash.com/photo-1536935338788-846bb9981813",
    "https://images.unsplash.com/photo-1525268323446-0505b6fe7778",
    "https://images.unsplash.com/photo-1530103862676-de8c9debad1d",
  ],
  shopping: [
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8",
    "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d",
    "https://images.unsplash.com/photo-1555529771-835f59fc5efe",
  ],
  outdoor: [
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
    "https://images.unsplash.com/photo-1522383225653-ed111181a951",
    "https://images.unsplash.com/photo-1565967511849-76a60a516170",
  ],
  market: [
    "https://images.unsplash.com/photo-1555992336-fb0d29498b13",
    "https://images.unsplash.com/photo-1534531173927-aeb928d54385",
    "https://images.unsplash.com/photo-1563245372-f21724e3856d",
  ],
  culture: [
    "https://images.unsplash.com/photo-1517154421773-0529f29ea451",
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9",
    "https://images.unsplash.com/photo-1548115184-bc6544d06a58",
    "https://images.unsplash.com/photo-1573165067541-4cd6d9837902",
  ],
  local: [
    "https://images.unsplash.com/photo-1538485399081-7191377e8241",
    "https://images.unsplash.com/photo-1546874177-9e664107314e",
    "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc",
    "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b",
  ],
};

const CATEGORY_ALIASES: Record<string, keyof typeof CATEGORY_FALLBACKS> = {
  restaurant: "food",
  restaurants: "food",
  dining: "food",
  food: "food",
  cafe: "cafe",
  cafes: "cafe",
  coffee: "cafe",
  nightlife: "nightlife",
  bar: "nightlife",
  bars: "nightlife",
  cocktail: "nightlife",
  shopping: "shopping",
  shop: "shopping",
  shops: "shopping",
  outdoor: "outdoor",
  outdoors: "outdoor",
  park: "outdoor",
  nature: "outdoor",
  market: "market",
  markets: "market",
  culture: "culture",
  museum: "culture",
  temple: "culture",
  gallery: "culture",
};

interface SpotFallbackImageInput {
  name: string;
  category?: string | null;
  city?: string | null;
  address?: string | null;
  width?: number;
  height?: number;
  quality?: number;
}

function stableIndex(seed: string, size: number): number {
  if (size <= 1) return 0;

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  return Math.abs(hash) % size;
}

function normalizeCategory(category: string | null | undefined): keyof typeof CATEGORY_FALLBACKS {
  const normalized = (category || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .trim();

  for (const [alias, fallbackCategory] of Object.entries(CATEGORY_ALIASES)) {
    if (normalized.includes(alias)) return fallbackCategory;
  }

  return "local";
}

function withImageParams(
  baseUrl: string,
  options: Pick<SpotFallbackImageInput, "width" | "height" | "quality">
): string {
  const params = new URLSearchParams({
    w: String(options.width ?? 1200),
    q: String(options.quality ?? 90),
    auto: "format",
    fit: "crop",
  });

  if (options.height) {
    params.set("h", String(options.height));
  }

  return `${baseUrl}?${params.toString()}`;
}

export function getSpotFallbackImageUrl(input: SpotFallbackImageInput): string {
  const fallbackCategory = normalizeCategory(input.category);
  const images = CATEGORY_FALLBACKS[fallbackCategory];
  const seed = [input.city, input.category, input.name, input.address]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

  return withImageParams(images[stableIndex(seed, images.length)], input);
}
