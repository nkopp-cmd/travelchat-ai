// Share cards (og:image) for pages that are not a spot or a city hub (reach-engine R7: no shared default card).
// The text comes only from this registry, so the public route cannot be made to render arbitrary words.
import { HELP_COUNTRIES } from "@/lib/help/phrases";
import { absoluteUrl } from "@/lib/seo/meta";
import { TIER_CONFIGS } from "@/lib/subscription";

export interface PageCard {
  label: string;
  headline: string;
  subline: string;
}

const STATIC_CARDS: Record<string, PageCard> = {
  home: { label: "Your local friend in Asia", headline: "Hidden gems locals rate", subline: "Seoul · Tokyo · Bangkok · Singapore" },
  pricing: { label: "Localley Pro", headline: "Trip plans built from local spots", subline: `Pro from $${TIER_CONFIGS.pro.price} a month · cancel any time` },
  templates: { label: "Itinerary templates", headline: "Ready-made trip plans for Asia", subline: "Relaxed, moderate or active pace" },
  help: { label: "Help me say this", headline: "Phrase cards to show staff", subline: "Korean · Japanese · Thai · Vietnamese · Chinese" },
};

function countryCards(): Record<string, PageCard> {
  const cards: Record<string, PageCard> = {};
  for (const country of HELP_COUNTRIES) {
    cards[`help-${country.slug}`] = { label: "Help me say this", headline: `Say it in ${country.languageName}`, subline: `Phrase cards for ${country.name}` };
    cards[`help-${country.slug}-pay`] = { label: "Visitor guide", headline: `How to pay in ${country.name}`, subline: "Cards, cash, wallets, transit cards and ATMs" };
    cards[`help-${country.slug}-menu`] = { label: "Menu help", headline: `Read a menu in ${country.name}`, subline: "Photograph it, read every dish in English" };
    cards[`help-${country.slug}-open`] = { label: "Open now", headline: `What is open near you in ${country.name}`, subline: "Opening hours in one tap" };
  }
  return cards;
}

const CARDS: Record<string, PageCard> = { ...STATIC_CARDS, ...countryCards() };

export const PAGE_CARD_KEYS: readonly string[] = Object.keys(CARDS);

export function pageCard(key: string): PageCard | null {
  return Object.prototype.hasOwnProperty.call(CARDS, key) ? CARDS[key] : null;
}

/** Absolute og:image URL for a registered page card. Throws on an unknown key so a typo fails the build, not the share. */
export function pageCardImage(key: string): string {
  if (!pageCard(key)) throw new Error(`Unknown page card: ${key}`);
  return absoluteUrl(`/og/pages/${key}`);
}
