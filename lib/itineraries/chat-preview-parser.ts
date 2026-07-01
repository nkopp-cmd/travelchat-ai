import { validateCityForItinerary } from "@/lib/cities";
import { isTipLikeActivity } from "@/lib/itineraries/normalize-daily-plans";
import type { ItineraryInsight } from "@/lib/itineraries/normalize-daily-plans";

export interface ParsedChatActivity {
  title: string;
  description: string;
  address?: string;
  type: "hidden-gem" | "local-favorite" | "mixed" | "normal";
}

export interface ParsedChatDay {
  day: string;
  activities: ParsedChatActivity[];
}

export interface ParsedChatItinerary {
  title: string;
  city: string;
  days: ParsedChatDay[];
  tips: string[];
}

function stripMarkdownDecorators(value: string): string {
  return value.replace(/^[#*]+\s*|\*+$/g, "").trim();
}

const DAY_HEADING_PATTERN = /^(?:[#*]+\s*)?Day\s+\d+(?:\s*[:\-\u2013\u2014]\s*.+)?\**$/iu;
const ADDRESS_LINE_PATTERN =
  /^(?:[-*]|\d+[.)])?\s*(?:\u{1F4CD}\s*)?(?:Address|Location|Where)\s*[:\-\u2013\u2014]\s*(.+)$/iu;
const PIN_ADDRESS_LINE_PATTERN = /^(?:[-*]|\d+[.)])?\s*\u{1F4CD}\s*(.+)$/u;
const LIST_MARKER_PATTERN = /^(?:[-*]|\d+[.)])\s+/;

function isTipsHeading(line: string): boolean {
  return /^[#*]*\s*(local\s+tips|insider\s+tips|travel\s+tips|trip\s+tips|practical\s+tips|tips|local\s+notes|trip\s+notes|practical\s+notes|route\s+notes|map\s+notes|booking\s+notes|food\s+notes|money\s+notes|notes|what\s+to\s+order|before\s+you\s+go|getting\s+around|getting\s+there|transport|transport\s+tips|transit|transit\s+tips)\s*:?\s*\**$/i.test(line.trim());
}

function getActivityType(title: string): ParsedChatActivity["type"] {
  const typeMatch = title.match(/\((.+?)\)/);
  if (!typeMatch) return "normal";

  const typeText = typeMatch[1].toLowerCase();
  if (typeText.includes("hidden gem")) return "hidden-gem";
  if (typeText.includes("local favorite")) return "local-favorite";
  if (typeText.includes("mixed")) return "mixed";
  return "normal";
}

function cleanActivityTitle(title: string): string {
  return title.replace(/\s*\(.+?\)\s*$/, "").trim();
}

const LABELED_TIP_FRAGMENT_PATTERN =
  /(?:^|\s+)(tip|tips|local tip|insider tip|travel tip|pro tip|quick tip|note|advice|insight|reminder|heads up|before you go|what to order|booking note|map note|route note|food note|money note|getting around|getting there|transport|transportation|transit)\s*[:\-\u2013\u2014]\s*([^.\n]+(?:[.!?]|$)?)/gi;

function looksLikeUnlabeledPracticalTip(value: string): boolean {
  const text = value.replace(/^[-*]\s*/, "").trim();
  if (!text || text.length > 180) return false;

  if (/^(bring|pack|wear|use|book|reserve|check|avoid|ask|arrive|get|download|carry|keep|remember|try to)\b/i.test(text)) {
    return true;
  }

  if (/^go\s+(early|before|after|around|when)\b/i.test(text)) return true;

  if (/^take\b/i.test(text)) {
    return /\b(subway|metro|bus|train|taxi|ride|route|exit|line|tram|ferry)\b/i.test(text);
  }

  if (/^(cash|cards?|tickets?|reservations?|queues?|lines?|weather|rain|metro|subway|bus|train|taxi|rideshare|wifi|sim)\b/i.test(text)) {
    return true;
  }

  return (
    /[.!?]$/.test(text) &&
    /\b(cash only|small bills|book ahead|reserve ahead|reservation|avoid peak|queue|line|umbrella|rain|closed|opening hours?)\b/i.test(text)
  );
}

function splitSentencesForTipExtraction(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitChatDescriptionTips(description: string): { description: string; tips: string[] } {
  const tips: string[] = [];
  const labeledCleanedDescription = description
    .replace(LABELED_TIP_FRAGMENT_PATTERN, (_match, label: string, text: string) => {
      const tip = `${label}: ${text.trim()}`.trim();
      if (tip) tips.push(tip);
      return " ";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  const keptSegments: string[] = [];

  for (const rawLine of labeledCleanedDescription.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    for (const sentence of splitSentencesForTipExtraction(line)) {
      if (looksLikeUnlabeledPracticalTip(sentence)) {
        tips.push(sentence);
      } else {
        keptSegments.push(sentence);
      }
    }
  }

  return { description: keptSegments.join(" ").trim(), tips };
}

function parseActivityLine(trimmedLine: string): { title: string; description: string } | null {
  const boldMatch = trimmedLine.match(/^(?:[-*]|\d+[.)])\s*\*+(.+?)\*+:\s*(.+)$/);
  if (boldMatch) {
    return {
      title: boldMatch[1].trim(),
      description: boldMatch[2].trim(),
    };
  }

  const colonMatch = trimmedLine.match(/^(?:[-*]|\d+[.)])\s+(.+?)\s*[:\-\u2013\u2014]\s*(.+)$/);
  if (colonMatch) {
    return {
      title: colonMatch[1].trim(),
      description: colonMatch[2].trim(),
    };
  }

  const plainMatch = trimmedLine.match(LIST_MARKER_PATTERN);
  if (plainMatch) {
    return {
      title: trimmedLine.replace(LIST_MARKER_PATTERN, "").trim(),
      description: "",
    };
  }

  return null;
}

function extractAddress(line: string): string | null {
  const trimmedLine = stripMarkdownDecorators(line.trim());
  const labeledMatch = trimmedLine.match(ADDRESS_LINE_PATTERN);
  if (labeledMatch?.[1]) return labeledMatch[1].trim();

  const pinMatch = trimmedLine.match(PIN_ADDRESS_LINE_PATTERN);
  return pinMatch?.[1]?.trim() || null;
}

function pushActivityOrTip(
  currentDay: ParsedChatDay,
  tips: string[],
  rawTitle: string,
  description: string
) {
  const cleanTitle = cleanActivityTitle(rawTitle);

  if (isTipLikeActivity({ name: cleanTitle, description })) {
    const tipText = description ? `${cleanTitle}: ${description}` : cleanTitle;
    tips.push(tipText);
    return;
  }

  const splitDescription = splitChatDescriptionTips(description);
  tips.push(...splitDescription.tips);

  currentDay.activities.push({
    title: cleanTitle,
    description: splitDescription.description,
    type: getActivityType(rawTitle),
  });
}

function getLastActivity(currentDay: ParsedChatDay | null): ParsedChatActivity | null {
  if (!currentDay || currentDay.activities.length === 0) return null;
  return currentDay.activities[currentDay.activities.length - 1];
}

function appendActivityNote(activity: ParsedChatActivity, note: string) {
  const text = note.trim();
  if (!text) return;
  activity.description = activity.description ? `${activity.description}\n${text}` : text;
}

function parseIndentedTip(note: string): string | null {
  const parsed = parseActivityLine(`- ${note}`);
  if (!parsed) return null;

  const cleanTitle = cleanActivityTitle(parsed.title);
  if (!isTipLikeActivity({ name: cleanTitle, description: parsed.description })) return null;

  return parsed.description ? `${cleanTitle}: ${parsed.description}` : cleanTitle;
}

function parseTipsSectionLine(line: string): string | null {
  const tip = line
    .replace(LIST_MARKER_PATTERN, "")
    .replace(/^\*+|\*+$/g, "")
    .trim();

  const labeledTip = tip.match(/^(tip|tips|local tip|insider tip|travel tip|pro tip|quick tip|note|advice|insight|reminder|heads up|before you go|what to order|booking note|map note|route note|food note|money note|getting around|getting there|transport|transportation|transit)\s*[\-\u2013\u2014]\s*(.+)$/i);
  if (labeledTip?.[1] && labeledTip[2]) {
    return `${labeledTip[1]}: ${labeledTip[2].trim()}`;
  }

  return tip || null;
}

function parseStandaloneTipLine(line: string): string | null {
  const withoutBullet = line.replace(LIST_MARKER_PATTERN, "").trim();
  const parsed = parseActivityLine(`- ${withoutBullet}`);
  if (!parsed) return null;

  const cleanTitle = cleanActivityTitle(parsed.title);
  if (!isTipLikeActivity({ name: cleanTitle, description: parsed.description })) return null;

  return parsed.description ? `${cleanTitle}: ${parsed.description}` : cleanTitle;
}

export function getChatTipKind(tip: string): ItineraryInsight["kind"] {
  if (/\b(transport|transit|subway|metro|bus|train|taxi|walk|walking|route|ride|getting around|kakao|maps?)\b/i.test(tip)) {
    return "transport";
  }

  if (/\b(local|insider|cash|bills?|small bills?|order|avoid|before you go|go early|queue|reservation|language|phrase)\b/i.test(tip)) {
    return "local";
  }

  return "insight";
}

export function cleanChatItineraryDescription(text: string): string {
  if (!text) return "";
  return text
    .replace(
      /(?:^|\n)\s*(?:[-*]\s*)?(?:\u{1F4CD}\s*)?(?:Address|Location|Where)\s*[:\-\u2013\u2014]\s*.+?(?=\n|$)/giu,
      "\n"
    )
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?\u{1F4CD}\s*.+?(?=\n|$)/gu, "\n")
    .replace(/\n+/g, " ")
    .trim();
}

export function parseChatItineraryPreview(content: string): ParsedChatItinerary {
  const lines = content.split("\n");
  const fullTitle = stripMarkdownDecorators(lines[0] || "") || "Your Itinerary";

  let city = "";
  const inCityMatch = fullTitle.match(/in\s+([A-Za-z\s]+?)(?:\s*[:\-,]|$)/i);
  const cityFirstMatch = fullTitle.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Adventure|Guide|Trip|Experience|Itinerary|Hidden)/i);
  const cityColonMatch = fullTitle.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):\s+/);

  if (inCityMatch) {
    city = inCityMatch[1].trim();
  } else if (cityFirstMatch) {
    city = cityFirstMatch[1].trim();
  } else if (cityColonMatch) {
    city = cityColonMatch[1].trim();
  }

  if (!city || city === "Unknown City") {
    const validation = validateCityForItinerary(fullTitle);
    if (validation.valid && validation.city) {
      city = validation.city.name;
    }
  }

  let title = fullTitle;
  const words = fullTitle.split(/\s+/);
  if (words.length > 5) {
    title = city ? `${city} Hidden Gems` : words.slice(0, 4).join(" ");
  }

  const days: ParsedChatDay[] = [];
  const tips: string[] = [];
  let currentDay: ParsedChatDay | null = null;
  let inTipsSection = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (isTipsHeading(trimmed)) {
      if (currentDay) {
        days.push(currentDay);
        currentDay = null;
      }
      inTipsSection = true;
      return;
    }

    if (DAY_HEADING_PATTERN.test(trimmed)) {
      if (currentDay) days.push(currentDay);
      inTipsSection = false;
      currentDay = {
        day: stripMarkdownDecorators(trimmed),
        activities: [],
      };
      return;
    }

    if (inTipsSection) {
      const tip = parseTipsSectionLine(trimmed);
      if (tip) tips.push(tip);
      return;
    }

    const lastActivity = getLastActivity(currentDay);
    const address = extractAddress(trimmed);
    if (!inTipsSection && lastActivity && address) {
      lastActivity.address = address;
      return;
    }

    if (!inTipsSection && currentDay && LIST_MARKER_PATTERN.test(trimmed)) {
      const parsed = parseActivityLine(trimmed);
      if (parsed) {
        pushActivityOrTip(currentDay, tips, parsed.title, parsed.description);
      }
      return;
    }

    if (!inTipsSection && currentDay) {
      const tip = parseStandaloneTipLine(trimmed);
      if (tip) {
        tips.push(tip);
        return;
      }
    }

    const indentedNote = line.match(/^\s+(.+)$/)?.[1]?.trim();
    if (!inTipsSection && lastActivity && indentedNote) {
      const noteAddress = extractAddress(indentedNote);
      if (noteAddress) {
        lastActivity.address = noteAddress;
      } else {
        const tip = parseIndentedTip(indentedNote);
        if (tip) {
          tips.push(tip);
        } else {
          appendActivityNote(lastActivity, indentedNote);
        }
      }
    }
  });

  if (currentDay) days.push(currentDay);

  return {
    title,
    city: city || "Unknown City",
    days: days.filter((day) => day.activities.length > 0),
    tips,
  };
}
