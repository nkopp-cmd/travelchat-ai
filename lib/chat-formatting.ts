/**
 * Detect if message content is a structured itinerary
 * (contains Day 1/2/etc. headers with substantial content)
 */
export function isItineraryContent(content: string): boolean {
    return (
        (/\*+Day \d+:/i.test(content) || /^#{1,6}\s*Day \d+:/im.test(content)) &&
        content.split('\n').length > 10
    );
}

/**
 * Format chat message content with proper spacing and structure
 * Handles itineraries, lists, and structured content
 */
export function formatChatMessage(content: string): string {
    // Add spacing after headers (lines ending with :)
    content = content.replace(/^(.+:)$/gm, '$1\n');

    // Add spacing before numbered lists
    content = content.replace(/(\n)(\d+\.\s)/g, '$1\n$2');

    // Add spacing before bullet points
    content = content.replace(/(\n)([-•]\s)/g, '$1\n$2');

    // Add spacing around day markers (Day 1, Day 2, etc.)
    content = content.replace(/(Day\s+\d+)/gi, '\n\n$1\n');

    // Add spacing around time markers (9:00 AM, 2:30 PM, etc.)
    content = content.replace(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/g, '\n$1');

    return content;
}

/**
 * Parse message content into structured sections
 * Returns array of sections with their types
 */
export interface MessageSection {
    type: 'text' | 'header' | 'list-item' | 'time-slot' | 'day-header';
    content: string;
    indent?: number;
}

export function parseMessageContent(content: string): MessageSection[] {
    const lines = content.split('\n').filter(line => line.trim());
    const sections: MessageSection[] = [];

    lines.forEach(line => {
        const trimmed = line.trim();

        // Day headers (Day 1, Day 2, etc.)
        if (/^Day\s+\d+/i.test(trimmed)) {
            sections.push({ type: 'day-header', content: trimmed });
        }
        // Time slots (9:00 AM, 2:30 PM, etc.)
        else if (/^\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/i.test(trimmed)) {
            sections.push({ type: 'time-slot', content: trimmed });
        }
        // Headers (lines ending with :)
        else if (trimmed.endsWith(':')) {
            sections.push({ type: 'header', content: trimmed });
        }
        // Numbered lists
        else if (/^\d+\.\s/.test(trimmed)) {
            sections.push({ type: 'list-item', content: trimmed, indent: 1 });
        }
        // Bullet points
        else if (/^[-•]\s/.test(trimmed)) {
            sections.push({ type: 'list-item', content: trimmed, indent: 1 });
        }
        // Regular text
        else if (trimmed) {
            sections.push({ type: 'text', content: trimmed });
        }
    });

    return sections;
}
