"use client";

import { parseMessageContent, MessageSection } from "@/lib/chat-formatting";
import { Clock, MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItineraryPreview } from "./itinerary-preview";

interface FormattedMessageProps {
    content: string;
    role: "user" | "assistant";
}

export function FormattedMessage({ content, role }: FormattedMessageProps) {
    // Check if this is an itinerary (contains Day 1, Day 2, etc. with asterisks or hashtags)
    const isItinerary = (/\*+Day \d+:/i.test(content) || /^#{1,6}\s*Day \d+:/im.test(content)) && content.split('\n').length > 10;

    // If it's an itinerary from assistant, show the preview
    if (isItinerary && role === "assistant") {
        return <ItineraryPreview content={content} />;
    }

    // Strip markdown formatting for display
    const stripMarkdown = (text: string): string => {
        return text
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // Bold italic
            .replace(/\*\*(.+?)\*\*/g, '$1')      // Bold
            .replace(/\*(.+?)\*/g, '$1')          // Italic
            .replace(/~~(.+?)~~/g, '$1')          // Strikethrough
            .replace(/`(.+?)`/g, '$1');           // Code
    };

    const sections = parseMessageContent(content);

    const renderSection = (section: MessageSection, index: number) => {
        const cleanContent = stripMarkdown(section.content);

        switch (section.type) {
            case 'day-header':
                return (
                    <div key={index} className="flex items-center gap-2 mt-4 mb-2 pb-2 border-b border-border/30">
                        <Calendar className="h-4 w-4 text-violet-500" />
                        <h3 className="font-bold text-base">{cleanContent}</h3>
                    </div>
                );

            case 'time-slot':
                return (
                    <div key={index} className="flex items-start gap-2 mt-3 mb-1">
                        <Clock className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="font-semibold text-sm">{cleanContent}</p>
                        </div>
                    </div>
                );

            case 'header':
                return (
                    <h4 key={index} className="font-semibold mt-3 mb-1 text-sm">
                        {cleanContent}
                    </h4>
                );

            case 'list-item':
                const isLocation = section.content.includes('📍') || /\bat\b/i.test(section.content);
                return (
                    <div
                        key={index}
                        className={cn(
                            "flex items-start gap-2 my-1.5",
                            section.indent && "ml-4"
                        )}
                    >
                        {isLocation && <MapPin className="h-3.5 w-3.5 text-violet-500 mt-0.5 flex-shrink-0" />}
                        <p className="text-sm leading-relaxed flex-1">{cleanContent}</p>
                    </div>
                );

            case 'text':
            default:
                return (
                    <p key={index} className="text-sm leading-relaxed my-1.5">
                        {cleanContent}
                    </p>
                );
        }
    };

    // If it's a simple message without structure, strip markdown and render
    if (sections.length === 1 && sections[0].type === 'text') {
        return (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {stripMarkdown(content)}
            </p>
        );
    }

    // Render structured content
    return (
        <div className="space-y-0.5">
            {sections.map((section, index) => renderSection(section, index))}
        </div>
    );
}
