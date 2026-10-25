import translations from "./translations.json";
import type { HelpLanguage } from "./phrases";

/**
 * "Help me get there" (shared/plans/localley-helper-community.md, helper 3): a show-to-driver card for one spot.
 * The language comes from the spot's local-name keys first, then from the country in its address; the request line
 * is the reviewed "take_me_here" phrase. Singapore and unknown countries use English.
 */
const COUNTRY_LANGUAGE: [RegExp, HelpLanguage][] = [
  [/korea|seoul|busan|jeju|gyeongju|서울|부산|제주/i, "ko"],
  [/japan|tokyo|osaka|kyoto|東京|大阪|京都/i, "ja"],
  [/thailand|bangkok|chiang mai|phuket|กรุงเทพ/i, "th"],
  [/vietnam|viet nam|hanoi|ho chi minh|saigon|da nang/i, "vi"],
  [/taiwan|taipei|kaohsiung|tainan|臺北|台北/i, "zh-TW"],
  [/singapore/i, "en"],
];
const NAME_KEYS: [string, HelpLanguage][] = [["ko", "ko"], ["ja", "ja"], ["th", "th"], ["vi", "vi"], ["zh-TW", "zh-TW"], ["zh", "zh-TW"]];
const LANGUAGE_NAMES: Record<HelpLanguage, string> = { ko: "Korean", ja: "Japanese", th: "Thai", vi: "Vietnamese", "zh-TW": "Chinese", en: "English" };

export type DriverCard = {
  language: HelpLanguage;
  languageName: string;
  localName: string | null;
  name: string;
  address: string;
  request: { text: string; roman: string | null };
};

export function driverCard(input: { name: string; nameField: unknown; address: string }): DriverCard {
  const field = input.nameField && typeof input.nameField === "object" ? input.nameField as Record<string, unknown> : {};
  const fromName = NAME_KEYS.find(([key]) => typeof field[key] === "string" && String(field[key]).trim());
  const language = fromName?.[1] ?? COUNTRY_LANGUAGE.find(([pattern]) => pattern.test(input.address))?.[1] ?? "en";
  const localName = fromName ? String(field[fromName[0]]).trim() : null;
  const phrase = language === "en" ? null : (translations as Record<string, Record<string, { text: string; roman: string }>>).take_me_here?.[language];
  return {
    language,
    languageName: LANGUAGE_NAMES[language],
    localName: localName && localName !== input.name ? localName : null,
    name: input.name,
    address: input.address,
    request: phrase ? { text: phrase.text, roman: phrase.roman } : { text: "Please take me to this address.", roman: null },
  };
}
