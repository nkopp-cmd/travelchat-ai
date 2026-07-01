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

function isTipsHeading(line: string): boolean {
  return /^[#*]*\s*(local\s+tips|insider\s+tips|travel\s+tips|trip\s+tips|practical\s+tips|tips|local\s+notes|trip\s+notes|getting\s+around|transport\s+tips|transit\s+tips)\s*\**$/i.test(line.trim());
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
  /(?:^|\s+)(tip|tips|local tip|insider tip|travel tip|pro tip|quick tip|note|advice|insight|reminder|heads up|before you go|getting around|transport|transportation|transit)\s*:\s*([^.\n]+(?:[.!?]|$)?)/gi;

function splitChatDescriptionTips(description: string): { description: string; tips: string[] } {
  const tips: string[] = [];
  const cleanedDescription = description
    .replace(LABELED_TIP_FRAGMENT_PATTERN, (_match, label: string, text: string) => {
      const tip = `${label}: ${text.trim()}`.trim();
      if (tip) tips.push(tip);
      return " ";
    })
    .replace(/\s{2,}/g, " ")
    .trim();

  return { description: cleanedDescription, tips };
}

function parseActivityLine(trimmedLine: string): { title: string; description: string } | null {
  const boldMatch = trimmedLine.match(/^[-*]\s*\*+(.+?)\*+:\s*(.+)$/);
  if (boldMatch) {
    return {
      title: boldMatch[1].trim(),
      description: boldMatch[2].trim(),
    };
  }

  const colonMatch = trimmedLine.match(/^[-*]\s+(.+?):\s*(.+)$/);
  if (colonMatch) {
    return {
      title: colonMatch[1].trim(),
      description: colonMatch[2].trim(),
    };
  }

  const plainMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
  if (plainMatch) {
    return {
      title: plainMatch[1].trim(),
      description: "",
    };
  }

  return null;
}

function extractAddress(line: string): string | null {
  const match = line.trim().match(/^(?:[-*]\s*)?(?:Address|Location)\s*:\s*(.+)$/i);
  return match?.[1]?.trim() || null;
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

export function getChatTipKind(tip: string): ItineraryInsight["kind"] {
  if (/\b(transport|transit|subway|metro|bus|train|taxi|walk|walking|route|ride|getting around|kakao|maps?)\b/i.test(tip)) {
    return "transport";
  }

  if (/\b(local|insider|cash|order|avoid|before you go|go early|queue|reservation|language|phrase)\b/i.test(tip)) {
    return "local";
  }

  return "insight";
}

export function cleanChatItineraryDescription(text: string): string {
  if (!text) return "";
  return text
    .replace(/(?:^|\n)\s*(?:[-*]\s*)?(?:Address|Location)\s*:\s*.+?(?=\n|$)/gi, "\n")
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

    if (/^(?:[#*]+\s*)?Day \d+:/i.test(trimmed)) {
      if (currentDay) days.push(currentDay);
      inTipsSection = false;
      currentDay = {
        day: stripMarkdownDecorators(trimmed),
        activities: [],
      };
      return;
    }

    if (inTipsSection && /^[-*]\s+/.test(trimmed)) {
      const tip = trimmed
        .replace(/^[-*]\s*/, "")
        .replace(/^\*+|\*+$/g, "")
        .trim();
      if (tip) tips.push(tip);
      return;
    }

    const lastActivity = getLastActivity(currentDay);
    const address = extractAddress(trimmed);
    if (!inTipsSection && lastActivity && address) {
      lastActivity.address = address;
      return;
    }

    if (!inTipsSection && currentDay && /^[-*]\s+/.test(trimmed)) {
      const parsed = parseActivityLine(trimmed);
      if (parsed) {
        pushActivityOrTip(currentDay, tips, parsed.title, parsed.description);
      }
      return;
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
    days,
    tips,
  };
}
