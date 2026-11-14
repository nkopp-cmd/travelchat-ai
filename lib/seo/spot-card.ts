// Text for the per-spot share card (/spots/<id>/og, reach-engine R7: every money page has its own og:image).
// The card is drawn in code, so the words are always correct; it is not a photo and never claims to be one.

export function scoreLabel(score: number): string {
  if (score >= 6) return "Legendary Local Spot";
  if (score >= 5) return "Hidden Gem";
  if (score >= 4) return "Local Favorite";
  return "Popular Spot";
}

// The bundled OG font covers Latin only; other scripts would render as empty boxes.
const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]+$/u;

export interface SpotCardInput {
  name: string;
  category: string;
  score: number;
  city: string | null;
}

export interface SpotCardText {
  headline: string;
  label: string;
  place: string;
}

const clean = (value: string, max: number) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

export function spotCardText(input: SpotCardInput): SpotCardText {
  const city = input.city && LATIN_ONLY.test(input.city) ? clean(input.city, 40) : "";
  const category = clean(input.category || "Local spot", 40);
  const name = clean(input.name, 70);
  const headline = name && LATIN_ONLY.test(name) ? name : city ? `${category} in ${city}` : category;
  return { headline, label: scoreLabel(input.score), place: city };
}

/** Font size that keeps the headline within about two lines of the 1200 px card. */
export function headlineSize(text: string): number {
  if (text.length <= 22) return 84;
  if (text.length <= 36) return 72;
  if (text.length <= 52) return 60;
  return 50;
}
