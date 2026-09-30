import { LOCALNESS_LABELS } from "@/lib/cities";
import { getLocalizedText } from "@/lib/spots/transform";
import type { MultiLanguageField } from "@/types";

export interface ChatContextSpot {
  id?: string;
  name: MultiLanguageField;
  description: MultiLanguageField;
  address: MultiLanguageField;
  category: string | null;
  localley_score: number | null;
  local_percentage: number | null;
  best_times: MultiLanguageField | null;
  tips: unknown;
  photos: string[] | null;
}

const categoryKeywords: Record<string, string[]> = {
  Food: ["eat", "food", "lunch", "dinner", "breakfast", "brunch", "restaurant", "meal", "hungry", "cuisine", "dining"],
  Cafe: ["cafe", "coffee", "tea", "dessert", "cake", "pastry", "bakery"],
  Nightlife: ["bar", "drink", "cocktail", "nightlife", "pub", "club", "night out", "beer", "wine"],
  Shopping: ["shop", "shopping", "buy", "store", "market", "souvenir", "clothes", "fashion"],
  Outdoor: ["park", "outdoor", "walk", "hike", "nature", "garden", "kids", "children", "family", "playground"],
  Market: ["market", "street food", "stall", "vendor"],
};

/** Keep the production and preview chat filters identical. */
export function matchedChatCategories(userMessage: string): string[] {
  const lowerMessage = userMessage.toLowerCase();
  return Object.entries(categoryKeywords)
    .filter(([, keywords]) => keywords.some(keyword => lowerMessage.includes(keyword)))
    .map(([category]) => category);
}

/** Preserve the current prompt format while switching only its spot repository. */
export function formatChatSpotContext(city: string, spots: ChatContextSpot[]): string {
  if (spots.length === 0) return "";
  const spotLines = spots.map(spot => {
    const name = getLocalizedText(spot.name);
    const desc = getLocalizedText(spot.description);
    const addr = getLocalizedText(spot.address);
    const score = spot.localley_score || 3;
    const scoreLabel = LOCALNESS_LABELS[score] || "Mixed Crowd";
    const bestTime = getLocalizedText(spot.best_times as MultiLanguageField) || "";
    const category = spot.category || "";
    const localPct = spot.local_percentage || 50;
    const tips = Array.isArray(spot.tips) ? spot.tips.slice(0, 2).join("; ") : "";
    const hasPhotos = Array.isArray(spot.photos) && spot.photos.length > 0;

    return `- ${name} [${category}] (${scoreLabel}, ${score}/6, ${localPct}% locals)
  Address: ${addr}
  ${desc ? `Description: ${desc.substring(0, 150)}` : ""}
  ${bestTime ? `Best time: ${bestTime}` : ""}
  ${tips ? `Tips: ${tips}` : ""}
  ${hasPhotos ? "Has photos" : ""}`;
  }).join("\n");

  return `\n\n## CURATED SPOTS DATABASE — Real verified places in ${city}
Use these REAL spots in your recommendations when relevant. These are verified, curated places from our database:\n\n${spotLines}\n\nIMPORTANT: Prefer recommending these verified spots over places from your training data. If you recommend a spot from this list, use the exact name and address shown.`;
}
