// Static email images (built by scripts/newsletter/build-email-assets.tsx, served from public/email/v1/).
export const EMAIL_ASSET_BASE = "https://www.localley.io/email/v1";

// Localley score levels (components/spots/localley-scale.tsx): same icons, 400-shade colours for the dark email.
export const LEVELS = {
  1: { name: "Tourist Trap", color: "#f87171", glyph: "Warning" },
  2: { name: "Tourist Friendly", color: "#fb923c", glyph: "Camera" },
  3: { name: "Mixed Crowd", color: "#facc15", glyph: "UsersThree" },
  4: { name: "Local Favorite", color: "#4ade80", glyph: "Heart" },
  5: { name: "Hidden Gem", color: "#a78bfa", glyph: "Sparkle" },
  6: { name: "Legendary Alley", color: "#e879f9", glyph: "CrownSimple" },
} as const;

export type LevelId = keyof typeof LEVELS;

const UTILITY = [
  { key: "card", glyph: "CreditCard", color: "#b9a1ff" },
  { key: "pin", glyph: "MapPin", color: "#b9a1ff" },
  { key: "trend", glyph: "TrendUp", color: "#b9a1ff" },
  { key: "fire", glyph: "Fire", color: "#fb923c" },
  { key: "train", glyph: "Train", color: "#b9a1ff" },
] as const;

export type UtilityIcon = (typeof UTILITY)[number]["key"];

export const EMAIL_ICONS = [
  ...Object.entries(LEVELS).map(([id, level]) => ({ file: `level-${id}.png`, glyph: level.glyph, color: level.color })),
  ...UTILITY.map((icon) => ({ file: `icon-${icon.key}.png`, glyph: icon.glyph, color: icon.color })),
];

export const levelIcon = (id: LevelId) => `${EMAIL_ASSET_BASE}/level-${id}.png`;
export const utilityIcon = (key: UtilityIcon) => `${EMAIL_ASSET_BASE}/icon-${key}.png`;
export const cityPhoto = (city: string, size: "hero" | "card") => `${EMAIL_ASSET_BASE}/${city}-${size}.jpg`;
export const LOGO = `${EMAIL_ASSET_BASE}/logo.png`;
