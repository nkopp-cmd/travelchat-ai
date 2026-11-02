/**
 * Emoji pickers for the story / TikTok carousel slides (app/api/itineraries/[id]/story/route.tsx).
 * Topic first: the category decides, then words in the stop name, then the description.
 * Every result is a real emoji from STORY_EMOJI (Satori draws them with Twemoji), so a row
 * never shows a bare symbol or an empty gap.
 */

type Rule = [emoji: string, pattern: RegExp];

// Order matters: drinks before food ("izakaya grill" is an evening out), food before
// shopping ("food market" is a meal), sights after places to eat.
const TOPIC_RULES: Rule[] = [
    ["☕", /\b(cafe|café|coffee|kissa|kissaten|tea ?house|bakery|dessert|pudding)/],
    ["🍻", /\b(bar|bars|pub|izakaya|drinking|drinks|beer|brewery|sake|soju|pocha|pojangmacha|nightlife|cocktail|wine|yokocho)s?\b/],
    ["🍢", /\b(yakitori|skewer|skewers|kushikatsu|oden|street food|grilled chicken|chicken|grill|bbq|barbecue|galbi|samgyeopsal)/],
    ["🍣", /\b(sushi|sashimi|omakase|seafood|fish market)/],
    ["🥟", /\b(dumpling|dumplings|mandu|gyoza|dim sum|xiaolongbao)/],
    ["🍜", /\b(ramen|noodle|noodles|udon|soba|pho|naengmyeon|kalguksu|restaurant|food|dining|eat|eats|lunch|dinner|breakfast|brunch|cuisine|meal|curry|bibimbap|kimbap|tteokbokki)/],
    ["⛩️", /\b(temple|shrine|jinja|-ji|pagoda|wat|palace|gung)s?\b/],
    ["🛍️", /\b(shopping|shop|shops|store|boutique|market|arcade|shotengai|mall|vintage|thrift|street)s?\b/],
    ["🌳", /\b(park|garden|gardens|forest|trail|hike|hiking|nature|river|stream|mountain|san)s?\b/],
    ["🖼️", /\b(museum|gallery|art|exhibition|design)s?\b/],
    ["🌆", /\b(view|views|viewpoint|observatory|tower|skyline|sunset|rooftop|night view|lookout)s?\b/],
    ["🏖️", /\b(beach|coast|sea|seaside|island|bay|harbor|harbour)s?\b/],
    ["🎵", /\b(music|concert|live house|jazz|karaoke|noraebang|club)s?\b/],
    ["♨️", /\b(onsen|sento|bathhouse|spa|jjimjilbang|hot spring)s?\b/],
    ["🏘️", /\b(neighborhood|neighbourhood|village|alley|alleys|district|walk|stroll|old town|hanok)s?\b/],
];

const HIGHLIGHT_EXTRA: Rule[] = [
    ["🏛️", /\b(culture|history|heritage|historic)s?\b/],
    ["🗺️", /\b(explore|discover|adventure)s?\b/],
    ["✨", /\b(memor\w*|experience\w*)s?\b/],
];

export const STORY_FALLBACK_EMOJI = "📍";

/** Every emoji a picker can return. Tests check this set so Twemoji has a file for each. */
export const STORY_EMOJI = [...new Set([...TOPIC_RULES, ...HIGHLIGHT_EXTRA].map(([emoji]) => emoji).concat(STORY_FALLBACK_EMOJI))];

function match(text: string, rules: Rule[]): string | undefined {
    const lower = text.toLowerCase();
    if (!lower.trim()) return undefined;
    return rules.find(([, pattern]) => pattern.test(lower))?.[0];
}

export interface StoryEmojiActivity {
    name?: unknown;
    category?: unknown;
    description?: unknown;
}

function text(value: unknown): string {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return typeof obj.en === "string" ? obj.en : typeof obj.ko === "string" ? obj.ko : "";
    }
    return "";
}

export function getActivityEmoji(activity: StoryEmojiActivity): string {
    return match(text(activity.category), TOPIC_RULES)
        ?? match(text(activity.name), TOPIC_RULES)
        ?? match(text(activity.description), TOPIC_RULES)
        ?? STORY_FALLBACK_EMOJI;
}

export function getHighlightEmoji(highlight: string): string {
    return match(highlight, TOPIC_RULES) ?? match(highlight, HIGHLIGHT_EXTRA) ?? STORY_FALLBACK_EMOJI;
}
