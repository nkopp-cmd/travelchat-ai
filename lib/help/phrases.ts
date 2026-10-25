import source from "./source.json";
import translations from "./translations.json";

/** "Help me say this" (shared/plans/localley-helper-community.md): static, reviewed phrase cards per country. */
export type HelpLanguage = "ko" | "ja" | "th" | "vi" | "zh-TW" | "en";

export const HELP_COUNTRIES = [
  { slug: "korea", name: "South Korea", language: "ko", languageName: "Korean", flag: "🇰🇷" },
  { slug: "japan", name: "Japan", language: "ja", languageName: "Japanese", flag: "🇯🇵" },
  { slug: "thailand", name: "Thailand", language: "th", languageName: "Thai", flag: "🇹🇭" },
  { slug: "vietnam", name: "Vietnam", language: "vi", languageName: "Vietnamese", flag: "🇻🇳" },
  { slug: "taiwan", name: "Taiwan", language: "zh-TW", languageName: "Chinese (Taiwan)", flag: "🇹🇼" },
  { slug: "singapore", name: "Singapore", language: "en", languageName: "English", flag: "🇸🇬" },
] as const satisfies readonly { slug: string; name: string; language: HelpLanguage; languageName: string; flag: string }[];

export type HelpCountry = (typeof HELP_COUNTRIES)[number];

export const HELP_CATEGORY_TITLES: Record<string, string> = {
  basics: "Basics",
  food: "Food & allergies",
  transport: "Getting around",
  pay: "Paying",
  emergency: "Emergency",
};

export type HelpPhrase = { id: string; en: string; text: string; roman: string | null };

const table = translations as Record<string, Partial<Record<Exclude<HelpLanguage, "en">, { text: string; roman: string }>>>;

export function helpCountry(slug: string): HelpCountry | undefined {
  return HELP_COUNTRIES.find((c) => c.slug === slug);
}

/** Phrases of one country grouped by category, in the source order. English countries show the English text. */
export function helpPhrases(country: HelpCountry): { id: string; title: string; phrases: HelpPhrase[] }[] {
  return source.categories.map((category) => ({
    id: category.id,
    title: HELP_CATEGORY_TITLES[category.id] ?? category.id,
    phrases: category.phrases.map((phrase) => {
      if (country.language === "en") return { id: phrase.id, en: phrase.en, text: phrase.en, roman: null };
      const local = table[phrase.id]?.[country.language];
      if (!local) throw new Error(`Missing ${country.language} translation for ${phrase.id}`);
      return { id: phrase.id, en: phrase.en, text: local.text, roman: local.roman };
    }),
  }));
}
